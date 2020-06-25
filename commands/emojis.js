const { performance } = require("perf_hooks");
module.exports = {
    name: "emojis",
    description: "Get emoji(s) from the current channel and their usage",
    async execute(message, args) {
        let p1 = performance.now();

        let { specificEmojis, timestamp, isAllChannels, needReaction } = getConditions(args);
        let { allMessages, messageSize, reactionEmojis } = await getMessages(timestamp, isAllChannels, needReaction);
        let emojis = await getEmojis(specificEmojis, reactionEmojis);

        let p2 = performance.now();
        let time = getSecondsToOneDecimal(p1, p2);
        console.log(`Time took ${time}s`);

        printEmojis(message, emojis, messageSize);

        //returns a hashmap of emojis <name, 0>
        async function getServerEmojis() {
            let serverEmojis;
            let emojis = {};

            serverEmojis = await message.guild.emojis.cache;
            serverEmojis.forEach((emoji) => {
                emojis[emoji.toString()] = 0;
            });

            return emojis;
        }

        //returns the condition for the emojis search
        function getConditions(args) {
            let condition = {
                specificEmojis: [],
            };

            args.forEach((arg) => {
                if (!arg.startsWith("-") && !arg.startsWith("<:")) return;
                if (arg.startsWith("<:")) return condition.specificEmojis.push(arg);

                arg = arg.slice(1);
                if (arg === "a") return (condition.isAllChannels = true);
                if (!isNaN(parseInt(arg))) return (condition.timestamp = parseInt(arg));
                if (arg === "r") return (condition.needReaction = true);
            });

            return condition;
        }

        //fetch messages based on input conditions
        async function getMessages(timestamp, isAllChannels, needReaction) {
            let numberOfMessages = 100;
            let date = new Date();
            //set a date to -timestamp days before today
            if (timestamp) date.setDate(date.getDate() - timestamp);

            let textChannels = [message.channel];
            if (isAllChannels) {
                //override the default channel to all channels
                numberOfMessages = 10;
                let serverChannels = message.guild.channels.cache;
                textChannels = serverChannels.filter((channel) => channel.type === "text" && channel.viewable).array();

                //when using isAllChannels, make default 7 days to increase speed
                if (!timestamp) date.setDate(date.getDate() - 7);
            }

            let reactionEmojis = await getServerEmojis();

            let id = ""; //used as a check point for fetching messages
            let fetchOptions = {
                limit: 100, //discord fetch max is 100 messages
            };

            let allMessages = "";
            let messageSize = 0;

            for (textChannel of textChannels) {
                //reset fetch options all for all channels
                fetchOptions = {
                    limit: 100, //discord fetch max is 100 messages
                };
                id = "";

                //fetch 10k messages and store them in allMessages
                for (let i = 0; i < numberOfMessages; i++) {
                    //go to last message's checkpoint
                    if (id) fetchOptions.before = id;

                    try {
                        let messages = await textChannel.messages.fetch(fetchOptions);
                        messageSize += messages.size;
                        let lines = 0;

                        //for every 100 messages
                        messages.forEach((sentence) => {
                            lines++;
                            //ignore emojis from bot
                            if (!sentence.author.bot && sentence.toString()) {
                                //if there's a timestamp, stop reading when sentence's date is less than timestamp
                                if (timestamp && sentence.createdAt.getTime() < date.getTime()) {
                                    messageSize -= messages.size - lines; //subtract the unread lines
                                    throw error;
                                }

                                if (needReaction) {
                                    sentence.reactions.cache.forEach((messageReaction) => {
                                        let reaction = messageReaction._emoji.toString();
                                        if (reactionEmojis[reaction] >= 0) reactionEmojis[reaction]++;
                                    });
                                }

                                allMessages += `${sentence.toString()}\n`;
                            }
                        });

                        //set message checkpoint
                        id = messages.last().id;
                    } catch (reachEnd) {
                        break;
                    }
                }
            }

            return { allMessages, messageSize, reactionEmojis };
        }

        //gets all the emojis count in an sorted array
        async function getEmojis(specificEmojis, reactionEmojis) {
            let serverEmojis;
            //if there are input emojis
            if (specificEmojis[0]) {
                serverEmojis = specificEmojis;
            } else {
                //else use all server emojis
                serverEmojis = await message.guild.emojis.cache;
            }

            let emojis = [];
            serverEmojis.forEach((emoji) => {
                var regex = new RegExp(emoji, "g");
                let found = allMessages.match(regex);
                let reaction = reactionEmojis[emoji.toString()];
                emojis.push({ name: emoji.toString(), count: found ? found.length + reaction : 0 });
            });

            emojis.sort((a, b) => b.count - a.count); //sort in descending order
            return emojis;
        }

        //sends 50 emojis at a time to the current channel to prevent discord message limit of 2000 characters
        async function printEmojis(message, emojis, messageSize) {
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
            message.channel.send(`>>> ${emojiCount}\n${messageSize} lines. Time took ${time}s`);
        }

        function getSecondsToOneDecimal(p1, p2) {
            return ((p2 - p1) / 1000).toFixed(1);
        }
    },
};
