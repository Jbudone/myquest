
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
    console.log(" TEST EXITING");
    process.exit();
};

process.stdin.setRawMode(true);

process.on('exit', () => { exitingGame(); });
process.on('SIGINT', () => { exitingGame(); });
process.on('uncaughtException', couldNotStartup);

const stdinCallbacks = [];
stdinCallbacks.push({
    process: process,
    
    cb: (b) => {

        if (b[0] === 3) {
            console.log("SIGINT received");
            exitingGame();

            return false;
        }


        console.log("Got an input: ");
        console.log(b);
        console.log(b.toString());
    }
});

// Setup options
const options = {
    debug: false
};

for (let i = 2; i < process.argv.length; ++i) {
    let option = process.argv[i];

    // Process option here
    if (option === "--debug") {
        console.log("Turning debug mode on");
        options.debug = true;
    } else {
        console.error(`Test could not find option: ${option}`);
        exitingGame();
    }
}


requirejs(['keys', 'environment'], (Keys, Environment) => {

    // Initialize our environment as the server
    const Env = (new Environment());
    Env.isBot = true;
    GLOBAL.Env = Env;

    GLOBAL.Err = Error; // Temporary shim for Err until we load errors


	const _       = require('lodash'),
		fs        = require('fs'),
		Promise   = require('bluebird'),
		http      = require('http'), // TODO: need this?
		WebSocket = require('ws'),
		chalk     = require('chalk'),
        cluster   = require('cluster'),
        spawn     = require('child_process').spawn;

var jsdom = require('jsdom');
var { JSDOM } = jsdom;
 var DOM = new JSDOM('<body></body>', {});
 var window = DOM.window;
 var document = window.document;
 //var window = document.defaultView;
 const $ = require('jquery')(window);
    //const $ = require('jquery')(require("jsdom").jsdom().parentWindow);

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

        setTimeout(() => {
            process.exit();
        }, 500);
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

    let x = 0;

    const prepareForTesting = () => {

        const testPath = 'resources/tests/testFile.json';

        var activeBots = [],
            activeTest = null;

        Test.addBot = () => {

            ++x;
            let connectOn = 9222 + x;

            const botOptions = ['./dist/js/test/bot2.js', '--colors'];
            if (options.debug) {
                botOptions.unshift('--inspect=' + connectOn, '--inspect-brk');
            }

            console.log(botOptions);
            const bot = spawn('node', botOptions, {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            });

            // Detached/Unref doesn't seem to kill bot when we kill parent and attempt to kill bot
            //const bot = spawn('node', ['--inspect', '--inspect-brk', './dist/js/test/bot2.js'], { detached: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
            //bot.unref();

            // Pipe stdout to process stdout
            // TODO: Find out why using 'pipe' and 'inherit' don't work in stdio option for spawn
            bot.stdout.pipe(process.stdout);
            //process.stdin.pipe(bot.stdin); // Piping our stdin into bot.stdin seems to redirect stdin such that parent
            //doesn't have it anymore; this won't work (no ctrl-c, no inputs across multiple bots)

            let debugURL = null;

            // Catch v8 Debug URL for bot
            // The --inspect option on node (v8 devtools) writes the inspection URL to stderr, but this seems to happen
            // before the bot script starts executing. Unfortunately the bot can't listen for his own stderr output and
            // sniff out this URL.
            // Sniff stderr for the debug URL (it should be the first thing output to stderr), then redirect the stderr
            // pipe
            const catchDebugURL = (chunk) => {
                if (!debugURL) {

                    // This may be an actual error
                    let err = chunk.toString();
                    if (err.indexOf("Debugger listening on") === -1) {
                        console.error(err);
                        return;
                    }


                    const idx = chunk.indexOf("chrome-devtools:\/\/");
                    if (idx >= 0) {
                        const c = `${chunk}`;
                        debugURL = c.substring(idx, c.length - 1);

                        console.log(`Found Debug URL: "http://${debugURL}"`);

                        bot.send({
                            command: BOT_SET_DEBUGURL,
                            debugURL: debugURL
                        });
                        
                        // TODO: Open Chromium with the inspection debug URL. Unfortunately chromium seems to ignore the
                        // chrome-devtools:// protocol, and simply remains on the new tab page
                        //const execSync = require('child_process').execSync;
                        ////const result = execSync('/usr/bin/chromium --app="http://' + debugURL +'"');
                        //const result = execSync('/usr/bin/chromium "http://' + debugURL + '"');
                        //console.log("Running this: " + '/usr/bin/chromium --app ' + debugURL);

                        // We now have the inspect URL, redirect the stderr pipe to inherit from this process's pipe
                        bot.stderr.removeListener('data', catchDebugURL);
                        bot.stderr.pipe(process.stderr);
                        bot.stderr.resume();
                    }
                } else {
                    console.log(`${chunk}`);
                }
            };

            // FIXME: Go back to catchDebugURL, but have an extra check for *actual* error that isn't debugURL
            bot.stderr.on('data', catchDebugURL);

            console.log(`I spawned a bot: You are ${bot.pid}`);

            let testContext = activeTest;

            const onKilledBot = () => {
                console.log(`Bot has been killed: ${bot.pid}`);
                const index = activeBots.indexOf(bot);
                if (index >= 0) {
                    activeBots.splice(index, 1);
                }

                if (activeBots.length === 0) {
                    if (testContext == activeTest) {
                        nextTest();
                    }
                }
            };

            const onBotError = () => {
                /*
                console.log("Bot error");

                activeBots.forEach((_bot) => {
                    if (_bot == bot) return;
                    console.log("Killing bot");

                    if (!_bot.exitedAfterDisconnect) {
                        _bot.kill('SIGTERM');
                    }
                });
                activeBots = [];
                */

                // TODO: Start debugging?
            };

            bot.on('disconnect', () => {
                console.log("Disconnecting bot..");
                onKilledBot();
            });
            bot.on('exit', () => {
                console.log("Exiting bot..");
                onKilledBot();
            });
            bot.on('error', (d) => {
                console.log("Bot error..");
                onBotError();
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
                console.log(`KillBots: Killing bot: ${bot.pid}`);

                if (!bot.exitedAfterDisconnect) {
                    bot.kill('SIGTERM');
                    bot.disconnect();
                }
            });

            activeBots = [];
        };

        let nextTest = () => {};

        fs.readFile(testPath, 'utf8', (err, data) => {
            if (err) {
                console.error(err);
            }

            let testRunning = false;

            const testFiles = JSON.parse(data);
            console.log(testFiles);
            nextTest = () => {

                const test = testFiles.tests.shift();

                if (!test) {
                    if (testRunning) {
                        console.log("Finished tests");
                        testsFinished();
                        testRunning = false;
                    }
                    return;
                }

                console.log("Loading next test: " + test);
                activeTest = test;
                testRunning = true;
                const Smoke = require('../../resources/tests/' + test);

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
                        console.log(`Still more tests:  ${testFiles.tests.length}`);
                        nextTest();
                    } else {
                        // Finished testing
                        console.log("Finished testing!");
                    }
                });

                Smoke.onError((botPID) => {

                    activeBots.forEach((bot) => {

                        // Check if this is the same bot
                        if (bot.pid == botPID) return;
                        console.log(`Smoke.onError(${botPID}): Killing bot ${bot.pid}`);

                        if (!bot.exitedAfterDisconnect) {
                            bot.kill('SIGTERM');
                            bot.disconnect();
                        }
                    });

                });

                Smoke.onInput((botPID, forwardStdin) => {

                    let bot = activeBots.find((bot) => bot.pid == botPID);

                    // Check if this is the same bot
                    console.log(`Smoke.onInput(${botPID})`);

                    if (!bot.exitedAfterDisconnect) {

                        // Do we already have an input cb for this bot?

                        let idx, stdinCb;
                        for (idx = 0; idx < stdinCallbacks.length; ++idx) {
                            if (stdinCallbacks[idx].process === bot) {
                                stdinCb = stdinCallbacks[idx];
                                break;
                            }
                        }

                        if (stdinCb && forwardStdin) {
                            debugger;
                            console.error("ERROR: You already have a stdin cb for this bot!");
                            return;
                        } else if (!stdinCb && !forwardStdin) {
                            debugger;
                            console.error("ERROR: Trying to disable stdin cb for a bot that isn't already listening");
                            return;
                        }

                        if (forwardStdin) {

                            stdinCallbacks.push({
                                process: bot,
                                
                                cb: (b) => {
                                    console.log("Passing input to bot..");
                                    bot.stdin.write(b);
                                    bot.stdin.end();
                                }
                            });
                        } else {
                            stdinCallbacks.splice(idx, 1);
                            debugger;
                        }
                    }
                });

                Smoke.start();
            };

            console.log("Starting tests");
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
            console.log(evt);
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

    const stdin = process.openStdin();
    stdin.addListener('data', function(d) {
        for (let i = 0; i < stdinCallbacks.length; ++i) {
            let ret = stdinCallbacks[i].cb(d);
            if (ret === true) {
                break; // Some cbs may want to steal input for themselves
            }
        }
    });

    connectToServer();
    //prepareForTesting();

});
