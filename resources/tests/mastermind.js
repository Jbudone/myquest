const start = () => {

    const unitTest = Test.addTest("Mastermind");

    // FIXME:
    //  - AI control (mastermind) for decision making for bots
    //  - Bots keeping lookout for key things & informing mastermind
    //      - Found collision shape
    //      - Waypoint found
    //      - Timer hit (AND not busy attacknig/etc.)
    //  - Bots: general actions 
    //      - Follow -- Teleported (follow w/ teleport?)
    //      - Explore -- Need waypoints
    //      - Inventory control
    //      - Admin commands (admin, buff, give_item)
    //      - Pickup items
    //      - Intelligent fighting
    //          - Near death: use potions
    //          - Don't attack enemies you can't kill
    //   - Handle events
    //      - On attacked (to myself or from myself; possibly to or from following target): (option) wait until target or myself died then resume action; or until timeout hit w/ no attack (from or to myself/target)
    //      - BOT_WATCH_FOR: check for initial targets already in area too
    //  - On bot error: crash other bots and hook into debugger
    //  - Bot: get rid of hacky step, and hook into scripts/game longStep instead
    //  - Cleanup output (distinguish between bots; distinguish between mastermind & bots) -- spacing for bots; colours for different bots
    //  - FIXME: Why is explore mode always taking bot to right edge of map?
    //  - Following: When target teleports, teleport to him
    //  - FIXME: Seems like some orders don't come through on the bot?  (no matching console.log from bot receiving order)
    //  - Reorganize bot2.js  (what a fucking mess!)
    //  - Multiple bots w/ smart coordination
    //      - Some are followers, others lead
    //      - How to handle inspector/input?
    //  - FIXME: ctrl-c sometimes doesn't kill bot

    const botPool = [];

    const Mastermind = (new function(){

        this.addBot = (bot) => {
            botPool.push(bot);

            let state = null;
            let lastPassiveState = null;
            let target = null;

            let dbgRunningStateArgs = null;

            bot.spawn(bot.botDetails.username).then(() => {

                console.log("Spawned! Time to do shit w/ you");
                let resumePassiveState = () => {};

                if (bot.botDetails.explore) {


                    const goBotGo = () => {

                        // Tell this little explorer to go adventure
                        bot.orderTo(BOT_EXPLORE);
                        state = BOT_EXPLORE;
                        lastPassiveState = BOT_EXPLORE; 
                        target = null;

                        resumePassiveState = () => {
                            if (lastPassiveState === BOT_EXPLORE) {
                                bot.orderTo(BOT_EXPLORE);
                                state = BOT_EXPLORE;
                            } else if (lastPassiveState === BOT_FOLLOW) {
                                bot.orderTo(BOT_FOLLOW, {
                                    entity: target
                                }).then(() => {
                                    console.log("Finished following");
                                    bot.orderTo(BOT_EXPLORE);
                                    state = BOT_EXPLORE;
                                    target = null;
                                });

                                state = BOT_FOLLOW;
                            }
                        };

                        bot.orderTo(BOT_WATCH_FOR, {
                            item: BOT_WATCH_FOR_ENEMIES
                        }).then((args) => {
                            console.log("Looks like you found an entity..");
                            console.log(args);

                            if (state !== BOT_EXPLORE && state !== BOT_FOLLOW) {
                                console.log("Too bad we're busy w/ something else");

                                console.log(`State: ${state}`);
                                if (state === BOT_ATTACK) {
                                    console.log(`  Attacking: `);
                                    console.log(dbgRunningStateArgs);
                                } else if (state === BOT_FOLLOW) {
                                    console.log(`  Following: `);
                                    console.log(dbgRunningStateArgs);
                                }

                                if (!args.attackable) {
                                    target = args.entityID;
                                }
                                return;
                            }

                            if (args.attackable) {
                                dbgRunningStateArgs = args;
                                bot.orderTo(BOT_ATTACK, {
                                    entity: args.entityID
                                }).then(() => {
                                    console.log("Finished attacking");
                                    resumePassiveState();
                                });

                                state = BOT_ATTACK;
                            } else {
                                dbgRunningStateArgs = args;
                                bot.orderTo(BOT_FOLLOW, {
                                    entity: args.entityID
                                }).then(() => {
                                    console.log("Finished following");
                                    bot.orderTo(BOT_EXPLORE);
                                    state = BOT_EXPLORE;
                                    target = null;
                                });

                                target = args.entityID;
                                state = BOT_FOLLOW;

                                lastPassiveState = BOT_FOLLOW; 
                            }
                        });

                    };

                    // FIXME: Clicking to attack enemy, while running over there some other entity attacks us and steals
                    // our attention. After killing that entity we never go back to killing the original entity...
                    // Probably need a timeout for orders, but probably also worth it to have a listener for being
                    // attacked, then we cancel current shiz and wait for attack to finish. If we're attacking something
                    // that wasn't the expected entity, then we can try to re-attack after or just give up

                    goBotGo();

                    bot.handleMessage('onreloaded', () => {
                        //console.log("Reloaded");
                        //bot.orderTo(BOT_EXPLORE);
                        //state = BOT_EXPLORE;
                        //target = null;
                        goBotGo();
                    });

                    bot.handleMessage('idle', () => {
                        console.log("Looks like you've gone idle. Resuming passive state");
                        resumePassiveState();
                    });
                }
            });
        };

    }());

    const Bot = function(botDetails) {

        this.botDetails = botDetails;
        this.bot = null;

        this.messageHandlers = {};

        this.handleMessage = (msg, cb) => {
            this.messageHandlers[msg] = cb;
        };

        // Login bot
        this.onReady = function() {};
        this.onFailed = function() {};
        this.spawn = function(username) {

            return new Promise((success, fail) => {

                this.onReady = success;
                this.onFailed = fail;
                this.bot = Test.addBot();
                this.bot.on('message', (msg) => {

                    console.log(msg);
                    if (msg.msg === 'ready') {
                        this.bot.send({
                            command: BOT_CONNECT,
                            username: username,
                            password: "iambot"
                        });
                    } else if (msg.msg === 'connected') {

                    } else if (msg.msg === 'started') {
                        this.onReady();
                    } else if (msg.msg === 'nostart') {
                        this.onFailed();
                    } else if (msg.msg === 'nologin') {
                        this.bot.send({
                            command: BOT_SIGNUP,
                            username: username,
                            password: "iambot",
                            email: "k9@lol.bot"
                        });
                    } else if (msg.msg === 'error') {
                        onError(this.bot.pid);
                        testRunning = false;
                    } else if (msg.msg === 'signedup') {
                        this.bot.send({
                            command: BOT_CONNECT,
                            username: username,
                            password: "iambot"
                        });
                    } else if (msg.msg === 'finishedOrder') {

                        // Find the order that this is in response to
                        let sentOrder = this.sentOrders.find((o) => o.id === msg.args.id);
                        sentOrder.finished(msg.args);
                    }  else if (msg.msg === 'response') {
                        this.onInquiryResponse(msg.args);
                    }  else if (msg.msg === 'input') {
                        onInput(this.bot.pid, true);
                    }  else if (msg.msg === 'noinput') {
                        onInput(this.bot.pid, false);
                    } else {
                        if (this.messageHandlers[msg.msg]) {
                            this.messageHandlers[msg.msg](msg);
                        } else {
                            console.error("No handler for msg from bot: " + msg);
                        }
                    }
                });
            });
        };


        // Orders
        this.orderTo = (command, args) => {
            // FIXME: Not sure why this promise doesn't work
            //return new Promise((success, fail) => {
            console.log("======================================================");
            console.log(`Sending order to bot: ${command}`);
            console.log(args);
            let _success = () => {}, _fail = () => {};
            let success = (args) => { _success(args); },
                fail    = (args) => { _fail(args); };

            this.bot.send({ command, args, id: this.sentOrders.length });
            this.sentOrders.push({
                command, args, id: this.sentOrders.length,
                finished: success,
                failed: fail
            });
            console.log("    Sent.");
            console.log("======================================================");
            //});

            return {
                then: (success, fail) => {
                    _success = success || (() => {});
                    _fail = fail || (() => {});
                }
            };
        };

        this.sentOrders = [];

        // Inquiries
        this.inquire = function(inquiry) {
            return new Promise((success, fail) => {
                this.onInquiryResponse = success;
                this.onInquiryFailed = fail;
                this.bot.send({
                    command: BOT_INQUIRE,
                    detail: inquiry
                });
            });
        };
        this.onInquiryResponse = function() {};
        this.onInquiryFailed = function() {};
    };

    const addBot = (botDetails) => {
        const bot = new Bot(botDetails);
        Mastermind.addBot(bot);
    };

    addBot({
        username: 'lolbot',
        explore: true
    });

    //addBot({
    //    username: 'lolbot2',
    //    explore: true
    //});
};

let onCompleted = () => {
    console.log("TEST COMPLETED");
};
let onError = () => {
    console.log("TEST ERR");
}; // FIXME: Default should exit
let onInput = () => {
    console.log("Input stuff");
};

module.exports = {
    onCompleted: (cb) => {
        onCompleted = cb;
    },
    onError: (cb) => {
        onError = cb;
    },
    onInput: (cb) => {
        onInput = cb;
    },
    start
};
