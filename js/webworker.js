define(
    [
        'dynamic'
    ],
    (
        Dynamic
    ) => {

        const WebWorker = function(module) {

            this.worker = null;
            this.module = module;

            // Callbacks to worker calls
            this.cbList = {}; 
            this.cbListSize = 0;

            Ext.extend(this,'webworker');

            this.onMessage = () => {};
        };

        return WebWorker;
    });
