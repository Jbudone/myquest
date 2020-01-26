importScripts('../lib/require.js');
requirejs.config({
    "baseUrl": "/dist/js",
    "paths": {
        // "jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
        "jquery": "lib/jquery-2.1.1.min",
        // "underscore": "//underscorejs.org/underscore",
        //"underscore": "lib/underscore-min",
        "lodash": "lib/lodash.min",
        "bluebird": "lib/bluebird.min",
        "openpgp": "../../node_modules/openpgp/dist/openpgp.min"
    },
    "waitSeconds": 10000
});


// Initial message (load module)
self.onmessage = (message) => {

    if (message.data.module) {

        let module = `../${message.data.module}.js`;

        const worker = {
            get onMessage() { return self.onmessage; },
            set onMessage(onmessage) {
                self.onmessage = onmessage;
            },

            postMessage: (msg) => {
                self.postMessage(msg);
            }
        };

        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // WARNING WARNING WARNING WARNING WARNING WARNING WARNING
        // SHARED CODE FOR ERROR CHECKING
        self.global = self;
        global.OBJECT = 'OBJECT';
        global.FUNCTION = 'FUNCTION';
        global.HAS_KEY = 'HAS_KEY';
        global.IS_TYPE = 'IS_TYPE';

        global.OBJECT_TYPES = ['object', 'function', 'string'];

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
        self.onmessage = (message) => {
            queuedMessages.push(message);
        };

        // Load worker module
        requirejs(['lodash'], (_) => {

            self['_'] = _;

            requirejs([module], (Module) => {
                const moduleJob = new Module(worker);

                queuedMessages.forEach((message) => {
                    worker.onMessage(message);
                });

                worker.postMessage({
                    success: true
                });
            });
        });
    }
};


