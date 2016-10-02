
const filepath = require('path'),
    requirejs  = require('requirejs');

requirejs.config({
    nodeRequire: require,
    baseUrl: __dirname,
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});



var couldNotStartup = function(e){
   console.log("Could not startup server");
   if (e) {
	   console.log(e);
	   console.log(e.stack);
   }

   process.exit();
};

process.on('exit', couldNotStartup);
process.on('SIGINT', couldNotStartup);
process.on('uncaughtException', couldNotStartup);


requirejs(['keys', 'environment'], (Keys, Environment) => {

    // Initialize our environment as the server
    const Env = (new Environment());
    Env.isBot = true;
    GLOBAL.Env = Env;


	var _         = require('lodash'),
		fs        = require('fs'),
		Promise   = require('bluebird'),
		http      = require('http'), // TODO: need this?
		WebSocket = require('ws'),
		chalk     = require('chalk'),
        cluster   = require('cluster');

    var $ = require('jquery')(require("jsdom").jsdom().parentWindow);

	$.support.cors = true;
	Promise.longStackTraces();

    var Mocha = require('mocha');

    var mocha = new Mocha();

    GLOBAL.describe = mocha.describe;

	var errorInGame = function(e){

		console.error(chalk.red(e));
		console.trace();
		process.exit();
	};

	var printMsg = function(msg){
		if (_.isObject(msg)) msg = JSON.stringify(msg);
		console.log(chalk.bold.underline.green(msg));
	};

    let server = null;

    const Test = {};

    GLOBAL.Test = Test;

    const prepareForTesting = () => {

        const testPath = 'data/tests/testFile.json';

        cluster.setupMaster({
            //execArgv: ['--debug'],
            exec: 'dist/test/bot2.js',
        });

        var activeBots = [];

        Test.addBot = () => {
            const bot = cluster.fork();

            activeBots.push(bot);

            return bot;
        };

        var tests = [];

        const UnitTest = function(title) {
            this.title = title;
            this.finished = false;
            this.success = false;

            this.succeeded = () => {
                this.success = true;
                this.finished = true;
            };

            this.failed = () => {
                this.finished = true;
            };

            this.log = () => {
                console.log(`  ${this.title}: ${this.success ? "succeeded" : "failed"}`);
            };
        };

        Test.addTest = (title) => {
            var unit = new UnitTest(title);
            tests.push(unit);

            return unit;
        };

        fs.readFile(testPath, 'utf8', (err, data) => {
            if (err) {
                console.error(err);
            }

            console.log(data);

            const testFiles = JSON.parse(data);

            console.log(testFiles);

            const nextTest = () => {

                const test = testFiles.tests.shift();

            //testFiles.tests.forEach((file) => {
            //    require('../data/tests/' + file);
            //    //mocha.addFile('data/tests/' + file);
            //    //var m = mocha.run((err) => {
            //    //    console.error(err);

            //    //    //process.exit();

            //    //});

            //});


                const Smoke = require('../data/tests/' + test);

                Smoke.onCompleted = () => {

                    // Clear bots
                    activeBots.forEach((bot) => {
                        bot.process.exit(0);
                    });

                    activeBots = [];

                    // Print Unit Tests
                    console.log("Test: " + test);
                    tests.forEach((t) => {
                        t.log();
                    });

                    tests = [];

                    // Go to next test if there's more
                    if (testFiles.tests.length) {
                        nextTest();
                    } else {
                        // Finished testing
                        console.log("Finished testing!");
                    }
                };

                Smoke.start();
            };

            nextTest();
        });
    };


    const connected = () => {
        prepareForTesting();

        const msg = { req: "oink", msg: "Lol" },
            json = JSON.stringify(msg);
        server.send(json);
    };

    const disconnected = () => {
        console.log("Oops..");
        process.exit();
    };

    const connectToServer = () => {

        server = new WebSocket(Env.connection.websocketTest);
        //this.Log("Connecting to: "+link);

        server.onopen = (evt) => {
            //server.Log("Connected to server");
            connected(evt);
        };

        server.onerror = (evt) => {
            //server.Log("Error connecting to server", LOG_CRITICAL);
            throw new Err("Error connecting to server", evt);
        };

        server.onclose = (evt) => {
            //server.Log("Disconnected from server..");
            //server.onDisconnect();
            disconnected();
        };

        server.onmessage = (evt) => {
            //server.Log("Message received", LOG_DEBUG);

            evt = JSON.parse(evt.data);


        };
    };

    connectToServer();

});
