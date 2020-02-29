const requirejs = require('requirejs');
requirejs.config({
    nodeRequire: require,
    baseUrl: __dirname,
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});


let scriptModule = null;

for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];
    if (arg === "--module") {
        scriptModule = `../${process.argv[++i]}`;
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

    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // WARNING WARNING WARNING WARNING WARNING WARNING WARNING
    // SHARED CODE FOR ERROR CHECKING
    global.OBJECT = 'OBJECT';
    global.FUNCTION = 'FUNCTION';
    global.HAS_KEY = 'HAS_KEY';
    global.IS_TYPE = 'IS_TYPE';

    global.OBJECT_TYPES = ['object', 'function', 'string', 'number'];

    var DEBUGGER = (msg) => {
        debugger;
    };
    global.DEBUGGER = DEBUGGER;
    global.worker = worker;

    var CHECK = (stuffToCheck) => {

        stuffToCheck.forEach((check) => {

            if (check.checker === IS_TYPE) {
                if (check.typeCmp === OBJECT) {
                    if (typeof check.node !== "object" && typeof check.node !== "function" && typeof check.node !== "string") DEBUGGER("TYPE EXEPCTED TO BE OBJECT", check);
                } else if (check.typeCmp === FUNCTION) {
                    if (typeof check.node !== "function") DEBUGGER("TYPE EXEPCTED TO BE FUNCTION", check);
                } else { 
                    DEBUGGER("Unexpected type comparison", check);
                }
            } else if (check.checker === HAS_KEY) {
                if (!(check.property in check.object)) DEBUGGER("OBJECT EXPECTED TO HAVE KEY", check);
            } else {
                DEBUGGER("Unexpected check", check);
            }
        });
    };

    global.CHECK = CHECK;
    // WARNING WARNING WARNING WARNING WARNING WARNING WARNING
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!



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
    requirejs([scriptModule], (Module) => {
        const moduleJob = new Module(worker);

        queuedMessages.forEach((message) => {
            onMessage(message);
        });

        worker.postMessage({
            success: true
        });
    });
}
