const start = () => {

    const bot = Test.addBot();

    const unitTest = Test.addTest("Recalibration");

    let isRunning = false,
        movesRemaining = 100;

    // Login
    bot.on('message', (msg) => {

        if (msg.msg === 'ready') {
            bot.send({
                command: BOT_CONNECT,
                username: "bot1",
                password: "iambot"
            });
        } else if (msg.msg === 'connected') {

        } else if (msg.msg === 'started') {

            Move();

        } else if (msg.msg === 'nostart') {

        } else if (msg.msg === 'nologin') {
            bot.send({
                command: BOT_SIGNUP,
                username: "bot1",
                password: "iambot",
                email: "k9@lol.bot"
            });
        } else if (msg.msg === 'badpath') {

        } else if (msg.msg === 'failedpath') {

        } else {

        }
    });

    const Move = () => {

        let x = 56, y = 65;

        const xOff = parseInt(Math.random() * 30 - 15, 10),
            yOff   = parseInt(Math.random() * 14 - 7, 10);

        x += xOff;
        y += yOff;

        bot.send({
            command: BOT_MOVE,
            tile: { x, y }
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

const onCompleted = () => {};

module.exports = {
    onCompleted, start
};
