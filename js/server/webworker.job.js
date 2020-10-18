const requirejs = require('requirejs');
requirejs.config({
    nodeRequire: require,
    baseUrl: __dirname + '/..', // __dirname is dist/js/server
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});

global.dirname = __dirname;


let scriptModule = null;

for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];
    if (arg === "--module") {
        scriptModule = `${process.argv[++i]}`;
    }
}

if (scriptModule) {

    const worker = {
        get onMessage() { return this.worker.onmessage; },
        set onMessage(onmessage) {
            onMessage = onmessage;
        },

        postMessage: (msg) => {
            // NOTE: Its possible that we've lost our connection with the master
            try {
                process.send(msg);
            } catch(e) {
                console.error(e);
            }
        }
    };

    global.IS_WORKER = true;
    global.LOG = console.log;

    // In case we receive messages before the module is loaded
    let queuedMessages = [];
    let onMessage = (message) => {
        queuedMessages.push(message);
    };

    process.on('message', (data) => {
        onMessage({data});
    });

    const _ = require('lodash');
    global._ = _;

    // Load worker module
    requirejs(['errors', 'debugging'], (Errors, Debugging) => {



        const errorInGame = (e) => {

            const isAnError = e !== "SIGINT";
            if (shuttingDown) {

                // We may have already started shutting down, but could be waiting for the inspector. We may want to kill the
                // process without any debugging (ctrl-c)
                if (!isAnError) {
                    process.exit(e);
                }

                return;
            }

            shuttingDown = true;

            if (isAnError) {
                console.error("Error in game");
                if (console.trace) console.trace();
            }

            if (e) {
                waitForInspector();
            }

            process.exit(e);
        };

        global.shuttingDown = false;
        global.errorInGame = errorInGame;

        // If anything happens make sure we go through the common error/exit routine
        process.on('exit', errorInGame);
        //process.on('SIGINT', errorInGame);
        process.on('uncaughtException', errorInGame);


        global.worker = worker;
        global._global = global;


        requirejs([scriptModule], (Module) => {
            const moduleJob = new Module(worker);

            queuedMessages.forEach((message) => {
                onMessage(message);
            });

            worker.postMessage({
                success: true
            });
        }, (e) => {
            DEBUGGER("Error loading module", e);
            console.error(e);
            process.exit();
        });
    }, (e) => {
        console.error(e);
    });
}
