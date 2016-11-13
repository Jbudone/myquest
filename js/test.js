
const filepath = require('path'),
    requirejs  = require('requirejs');

requirejs.config({
    nodeRequire: require,
    baseUrl: __dirname,
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});



const couldNotStartup = (e) => {
   console.log("Could not startup server");
   if (e) {
	   console.log(e);
	   console.log(e.stack);
   }

   process.exit();
};

let exitingGame = () => {
    process.exit();
};

process.on('exit', () => { exitingGame(); });
process.on('SIGINT', () => { exitingGame(); });
process.on('uncaughtException', couldNotStartup);


requirejs(['keys', 'environment'], (Keys, Environment) => {

    // Initialize our environment as the server
    const Env = (new Environment());
    Env.isBot = true;
    GLOBAL.Env = Env;


	const _       = require('lodash'),
		fs        = require('fs'),
		Promise   = require('bluebird'),
		http      = require('http'), // TODO: need this?
		WebSocket = require('ws'),
		chalk     = require('chalk'),
        cluster   = require('cluster');

    const $ = require('jquery')(require("jsdom").jsdom().parentWindow);

	$.support.cors = true;
	Promise.longStackTraces();

	const errorInGame = (e) => {

        killBots();
		console.error(chalk.red(e));
		console.trace();
		process.exit();
	};

    exitingGame = () => {
        killBots();
        process.exit();
    };

	const printMsg = (msg) => {
		if (_.isObject(msg)) msg = JSON.stringify(msg);
		console.log(chalk.bold.underline.green(msg));
	};

    let server = null;

    const Test = {};

    let killBots = () => {};

    GLOBAL.Test = Test;

    const testsFinished = () => {
        killBots();

        // NOTE: Exiting too early results in bots not actually dying. Perhaps they aren't receiving the signal in time?
        // Maybe its a queued operation or something. TODO: Look into this
        setTimeout(() => {
            process.exit();
        }, 500);
    };

    const prepareForTesting = () => {

        const testPath = 'data/tests/testFile.json';

        cluster.setupMaster({
            //execArgv: ['--debug'],
            exec: 'dist/test/bot2.js',
        });

        var activeBots = [],
            activeTest = null;

        Test.addBot = () => {
            const bot = cluster.fork();

            let testContext = activeTest;

            bot.on('disconnect', () => {
                if (testContext == activeTest) nextTest();
            });

            bot.on('error', () => {
                console.log("Bot error");
                if (testContext == activeTest) nextTest();
            });

            bot.on('exit', () => {
                if (testContext == activeTest) nextTest();
            });

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
                const result = this.success ? chalk.bold.green("✓") : chalk.bold.red("✘");
                console.log(`    ${result} ${chalk.gray(this.title)}`);
            };
        };

        Test.addTest = (title) => {
            var unit = new UnitTest(title);
            tests.push(unit);

            return unit;
        };

        killBots = () => {
            activeBots.forEach((bot) => {
                console.log("Killing bot");

                if (!bot.suicide) {
                    bot.kill('SIGTERM');
                }
            });
        };

        let nextTest = () => {};

        fs.readFile(testPath, 'utf8', (err, data) => {
            if (err) {
                console.error(err);
            }

            const testFiles = JSON.parse(data);
            console.log(testFiles);
            nextTest = () => {

                const test = testFiles.tests.shift();

                if (!test) {
                    console.log("Finished tests");
                    testsFinished();
                    return;
                }

                console.log("Loading next test: " + test);
                activeTest = test;
                const Smoke = require('../data/tests/' + test);

                Smoke.onCompleted(() => {

                    // Clear bots
                    killBots();

                    activeBots = [];

                    // Print Unit Tests
                    console.log(`\n  ${chalk.bold(test)}`);
                    tests.forEach((t) => {
                        t.log();
                    });
                    console.log(`\n\n`);

                    tests = [];

                    // Go to next test if there's more
                    if (testFiles.tests.length) {
                        nextTest();
                    } else {
                        // Finished testing
                        console.log("Finished testing!");
                    }
                });

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
