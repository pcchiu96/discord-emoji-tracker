const { performance } = require("perf_hooks");
const { prefix } = require("../config.json");

module.exports = {
    name: "emojis",
    description: "Get emoji(s) from the current channel and their usage",
    async execute(message, args) {
        message.react("🔎");
        let p1 = performance.now();

        let condition = getConditions(args);
        let allMessage = await getMessages(message, condition);
        let emojis = await getEmojis(message, allMessage, condition.needSpecificEmojis);
        // console.log("emojis: ", emojis);

        let p2 = performance.now();
        let time = getSecondsToOneDecimal(p1, p2);
        console.log(`Time took ${time}s`);

        printEmojis(message, emojis, time);
    },
};

//returns the condition for the emojis search from arguments
function getConditions(args) {
    let condition = {
        needSpecificEmojis: [],
        needPastDays: 0,
        needAllChannels: false,
        needReaction: false,
    };

    for (let i = 0; i < args.length; i++) {
        let arg = args[i];

        if (!arg.startsWith("-") && !arg.startsWith("<:")) continue;
        if (arg.startsWith("<:")) {
            condition.needSpecificEmojis.push(arg);
            continue;
        }

        arg = arg.slice(1);
        if (arg === "a") {
            condition.needAllChannels = true;
        } else if (!isNaN(parseInt(arg))) {
            condition.needPastDays = parseInt(arg);
        } else if (arg === "r") {
            condition.needReaction = true;
        }
    }

    return condition;
}

async function getMessages(message, { needPastDays, needAllChannels }) {
    let allMessages = "";
    let textChannels = [message.channel];
    let date = message.createdAt;

    if (needPastDays) {
        date.setDate(date.getDate() - needPastDays);
    } else {
        date.setDate(date.getDate() - 1);
    }

    if (needAllChannels) {
        let serverChannels = message.guild.channels.cache;
        textChannels = serverChannels.filter((channel) => channel.type === "text" && channel.viewable).array();
    }

    let id = ""; //used as a check point for fetching messages
    let fetchOptions = {
        limit: 100, //discord fetch max is 100 messages
    };

    let messageSize = 0;

    //for every channel
    for (textChannel of textChannels) {
        //reset fetch options all for all channels
        fetchOptions = {
            limit: 100, //discord fetch max is 100 messages
        };
        id = "";

        while (true) {
            //go to last message's checkpoint
            if (id) fetchOptions.before = id;

            try {
                let messages = await textChannel.messages.fetch(fetchOptions);
                let lines = 0;

                messages.each((sentence) => {
                    lines++;
                    if (sentence.createdAt.getTime() < date.getTime()) {
                        throw new Error();
                    }

                    //ignore emojis from bot, empty string, or this commands
                    if (sentence.author.bot || !sentence.toString() || sentence.toString().startsWith(prefix + " emojis")) return;

                    //exit out of search when timestamp reached

                    let reactions = sentence.reactions.cache.map((reaction) => {
                        return { name: reaction._emoji.toString(), count: reaction.count };
                    });

                    if (reactions.length) {
                        reactions.forEach((react) => {
                            allMessages += react.name.repeat(react.count);
                        });
                    }

                    allMessages += `${sentence.toString()}\n`;
                });

                messageSize += lines;

                //set last message checkpoint
                id = messages.last().id;
            } catch (reachEnd) {
                break;
            }
        }
    }

    return allMessages;
}

//gets all the emojis count in an sorted array
async function getEmojis(message, allMessages, needSpecificEmojis) {
    let emojis;
    //if there are input emojis
    if (needSpecificEmojis.length) {
        emojis = needSpecificEmojis;
    } else {
        //else use all server emojis
        emojis = await message.guild.emojis.cache.map((e) => e.toString());
    }

    let emojisUsage = [];
    emojis.forEach((emoji) => {
        var regex = new RegExp(emoji, "g");
        let found = allMessages.match(regex);
        emojisUsage.push({ name: emoji.toString(), count: found ? found.length : 0 });
    });

    emojisUsage.sort((a, b) => b.count - a.count); //sort in descending order
    return emojisUsage;
}

//sends 50 emojis at a time to the current channel to prevent discord message limit of 2000 characters
async function printEmojis(message, emojis, time) {
    let emojiCount = "";
    for (let i = 0, messageCap = 0; i < emojis.length; i++, messageCap++) {
        if (messageCap === 50) {
            await message.channel.send(`>>> ${emojiCount}`); //sends 50 emojis
            messageCap = 0;
            emojiCount = "";
        }
        emojiCount += `${emojis[i].name}${emojis[i].count} `;
    }

    //sends the remaining emojis
    message.channel.send(`>>> ${emojiCount}\nTime took ${time}s`);
}

function getSecondsToOneDecimal(p1, p2) {
    return ((p2 - p1) / 1000).toFixed(1);
}
