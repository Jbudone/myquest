
var assert = require('assert');
var expect = require("expect");

const start = () => {

    var unitTest = Test.addTest("Moving Around");

//var abc = null;
//describe('User', function() {
//    this.timeout(10000);
//    describe('#save()', function() {
//        it('should save without error', function(done) {
//            abc = done;
//        });
//    });
//});

    var botMove = 0;
    var botMoves = [{x:56, y:65},
                     {x:70, y:65},
                     {x:82, y:65},
                     {x:82, y:75},
                     {x:82, y:85},
                     {x:82, y:94},
                     {x:72, y:94},
                     {x:62, y:94},
                     {x:52, y:94},
                     {x:42, y:94},
                     {x:32, y:94},
                     {x:22, y:94},
                     {x:12, y:94},
                     {x:12, y:84},
                     {x:12, y:74},
                     {x:12, y:64},
                     {x:12, y:54},
                     {x:12, y:44},
                     {x:12, y:34},
                     {x:12, y:25},
                     {x:22, y:25},
                     {x:32, y:25},
                     {x:42, y:25},
                     {x:52, y:25},
                     {x:62, y:25},
                     {x:72, y:25},
                     {x:84, y:25},
                     {x:84, y:35},
                     {x:84, y:45},
                     {x:84, y:55},
                     {x:84, y:65},
                     {x:84, y:75},
                     {x:84, y:85},
                     {x:82, y:94},
                     {x:72, y:94},
                     {x:62, y:94},
                     {x:52, y:94},
                     {x:42, y:94},
                     {x:32, y:94},
                     {x:22, y:94},
                     {x:12, y:94},
                     {x:12, y:25},
                     {x:12, y:84},
                     {x:12, y:74},
                     {x:12, y:64},
                     {x:12, y:54},
                     {x:12, y:44},
                     {x:12, y:34},
                     {x:12, y:25},
                     {x:22, y:25},
                     {x:32, y:25},
                     {x:42, y:25},
                     {x:52, y:25},
                     {x:62, y:25},
                     {x:72, y:25},
                     {x:84, y:25}];

const bot = Test.addBot();

    bot.on('message', function(msg){
        //printMsg(msg);

        if (!msg.msg) return;
        if (msg.msg == 'ready') {
            bot.send({ command: BOT_CONNECT, username: "bot1", password: "iambot" });
        } else if (msg.msg == 'connected') {

        } else if (msg.msg == 'started') {

            bot.send({ command: BOT_MOVE, tile: { x: botMoves[0].x, y: botMoves[0].y } });
        } else if (msg.msg == 'nostart') {

        } else if (msg.msg == 'nologin') {
            bot.send({ command: BOT_SIGNUP, username: "bot1", password: "iambot", email: "k9@lol.bot" });
        } else if (msg.msg == 'signedup') {
            var username = msg.username,
                password = msg.password;
            bot.send({ command: BOT_CONNECT, username: username, password: password });
        } else if (msg.msg == 'nosignup') {
            console.error("Could not signup!");
        } else if (msg.msg == 'badpath') {
            // Already there?
            console.error("Could not set path");
            ++botMove;
            bot.send({ command: BOT_MOVE, tile: { x: botMoves[botMove].x, y: botMoves[botMove].y } });
        } else if (msg.msg == 'failedpath') {
            console.error("Failed to walk along path..");
            --botMove;
            setTimeout(function(){
                console.log("Adding next path");
                bot.send({ command: BOT_MOVE, tile: { x: botMoves[botMove].x, y: botMoves[botMove].y } });
            }, 500);
        } else if (msg.msg == 'ondied') {
            console.error("Zomg K9 has died!");
            unitTest.succeeded();
            onCompleted();
        } else {

            console.log("Finished path: " + botMove);
            if (++botMove >= botMoves.length) {
                unitTest.succeeded();

                onCompleted();
            } else {
                bot.send({ command: BOT_MOVE, tile: { x: botMoves[botMove].x, y: botMoves[botMove].y } });
            }
        }
    });

};

let onCompleted = () => {};

module.exports = {
    onCompleted: (cb) => {
        onCompleted = cb;
    }, start
};
