const start = () => {

    const unitTest = Test.addTest("Complex Movement and Combat");

    // TODO: Need something to easily setup/manage bots
    //
    //  - Connect (username)
    //  - Job (promise)

    const Bot = function() {

        this.bot = null;

        // Login bot
        this.onReady = function() {};
        this.onFailed = function() {};
        this.spawn = function(username) {

            return new Promise((success, fail) => {

                this.onReady = success;
                this.onFailed = fail;
                this.bot = Test.addBot();
                this.bot.on('message', (msg) => {

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
                    } else if (msg.msg === 'badpath') {
                        this.onFailedPath();
                    } else if (msg.msg === 'failedpath') {
                        this.onFailedPath();
                    } else if (msg.msg === 'finished') {
                        this.onFinishedPath();
                    }  else if (msg.msg === 'response') {
                        this.onInquiryResponse(msg.args);
                    } else {

                    }
                });
            });
        };


        // Movement
        this.moveTo = function(tile) {
            return new Promise((success, fail) => {
                this.onFinishedPath = success;
                this.onFailedPath = fail;
                this.bot.send({
                    command: BOT_MOVE, tile
                });
            });
        };
        this.onFinishedPath = function() {};
        this.onFailedPath = function() {};

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


    // Zoning Bot
    // This bot's sole purpose in life is to zone between two maps. He will continue walking between zones hoping to
    // find what he's looking for, only to realize that what he's looking for was already on the other side. Good luck
    // little buddy.

    let bot1 = new Bot();
    bot1.spawn("bot4").then(() => {

        const maxDelay = 3000;
        const nextMove = () => {

            bot1.inquire(INQUIRE_MAP).then(({map}) => {

                const moves = {
                    main: { x: 55, y: 54 },
                    home: { x: 19, y: 1 }
                };

                // TODO: Find a good way to continuously switch between moving between two tiles here for X count (or, while
                // test is still in process)
                if (map == "main") {
                    bot1.moveTo(moves['main']);
                } else {
                    bot1.moveTo(moves['home']);
                }

                const delay = Math.floor(Math.random() * maxDelay);
                setTimeout(nextMove, delay);
            }).catch(() => {
                console.log("Failed to inquire map");
            });

        };

        nextMove();

    }).catch(() => {

    });



    // Mover Bots

    const moverMoves = {
        botMover1: [
            { x: 20, y: 40 }, 
            { x: 20, y: 41 }, 
            { x: 20, y: 42 }, 
            { x: 20, y: 43 }, 

            { x: 24, y: 40 }, 
            { x: 24, y: 41 }, 
            { x: 24, y: 42 }, 
            { x: 24, y: 43 }, 

            { x: 21, y: 43 },
            { x: 22, y: 43 },
            { x: 23, y: 43 },

            { x: 21, y: 40 },
            { x: 22, y: 40 },
            { x: 23, y: 40 },

            { x: 21, y: 41 }
        ],

        botMover2: [
            { x: 63, y: 82 },
            { x: 63, y: 83 },
            { x: 63, y: 84 },

            { x: 66, y: 82 },
            { x: 66, y: 83 },
            { x: 66, y: 84 },

            { x: 64, y: 82 },
            { x: 65, y: 82 },

            { x: 64, y: 84 },
            { x: 65, y: 84 }
        ],

        botMover3: [
            { x: 29, y: 84 },
            { x: 29, y: 83 },
            { x: 30, y: 84 },
            { x: 30, y: 83 },

            { x: 32, y: 82 }
        ]
    };

    const addMoverBot = (moves, name) => {

        let bot = new Bot();
        bot.spawn(name).then(() => {

            const Move = () => {
                const maxDelay = 500,
                    minDelay = 150;

                const index = Math.floor(Math.random() * moves.length);
                const tile = moves[index];

                console.log(`Moving to: (${tile.x}, ${tile.y})`);

                bot.moveTo(tile);

                const wait = minDelay + parseInt(Math.random() * maxDelay, 10);
                setTimeout(Move, wait);
            };

            Move();

        }).catch(() => {
            console.log("Error spawning Mover bot");
        });
    };

    for (let name in moverMoves) {
        addMoverBot(moverMoves[name], name);
    }

};

let onCompleted = () => {};

module.exports = {
    onCompleted: (cb) => {
        onCompleted = cb;
    }, start
};
