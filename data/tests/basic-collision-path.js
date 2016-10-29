const start = () => {

    const bot = Test.addBot();

    const unitTest = Test.addTest("Collision Recalibration");

    let isRunning = false,
        movesRemaining = 20000;

    // Login
    bot.on('message', (msg) => {

        if (msg.msg === 'ready') {
            bot.send({
                command: BOT_CONNECT,
                username: "bot3",
                password: "iambot"
            });
        } else if (msg.msg === 'connected') {

        } else if (msg.msg === 'started') {

            Move();

        } else if (msg.msg === 'nostart') {

        } else if (msg.msg === 'nologin') {
            bot.send({
                command: BOT_SIGNUP,
                username: "bot3",
                password: "iambot",
                email: "k9@lol.bot"
            });
        } else if (msg.msg === 'badpath') {

        } else if (msg.msg === 'failedpath') {

        } else {

        }
    });

    // These tiles are pre-determined by where we're trying to run around (a rock that's shared between two pages)
    let scaryTiles = [{x:13, y:27}, {x:13, y:28}, {x:13, y:29}, {x:13, y:30}, {x:14, y:27}, {x:14, y:28}, {x:14, y:30}, {x:15, y:27}, {x:15, y:30}, {x:16, y:27}, {x:16, y:30}, {x:17, y:27}, {x:17, y:28}, {x:17, y:29}, {x:17, y:30}];

    const Move = () => {

        const index = Math.floor(Math.random() * scaryTiles.length);
        const tile = scaryTiles[index];

        bot.send({
            command: BOT_MOVE, tile
        });

        if (--movesRemaining === 0) {

            unitTest.succeeded();
            onCompleted();
        } else {

            const wait = 200 + parseInt(Math.random() * 300, 10);
            setTimeout(Move, wait);
        }
    };

};

let onCompleted = () => {};

module.exports = {
    onCompleted: (cb) => {
        onCompleted = cb;
    }, start
};
