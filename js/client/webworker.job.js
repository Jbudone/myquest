importScripts('../lib/require.js');
requirejs.config({
    "baseUrl": self.location.pathname + '/../../',
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

        self.IS_WORKER = true;
        self.LOG = console.log;

        var DEBUGGER = (msg) => {
            debugger;
        };
        self.DEBUGGER = DEBUGGER;
        self.worker = worker;
        self.global = self;


        // In case we receive messages before the module is loaded
        let queuedMessages = [];
        self.onmessage = (message) => {
            queuedMessages.push(message);
        };

        // Load worker module
        requirejs(['lodash', 'debugging', 'errors'], (_, Debugging, Errors) => {

            self['_'] = _;

            requirejs([module], (Module) => {
                const moduleJob = new Module(worker);

                queuedMessages.forEach((message) => {
                    worker.onMessage(message);
                });

                worker.postMessage({
                    success: true
                });
            }, (e) => {
                DEBUGGER("Error loading module", e);
                console.error(e);
            });
        }, (e) => {
            console.error(e);
        });
    }
};


