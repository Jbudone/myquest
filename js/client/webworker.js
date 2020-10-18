// Client WebWorker
define(() => {

        const WebWorker = {

            _init() {
            },

            initialize() {
                // FIXME: Can we reject on throw/fail? Otherwise timeout on no success message received
                return new Promise((resolve, reject) => {
                    this.worker = new Worker('dist/js/client/webworker.job.js');
                    this.worker.postMessage({
                        module: this.module
                    });

                    this.worker.onmessage = (message) => {
                        this.worker.onmessage = null;

                        // Equivalent to this.onMessage = worker.onmessage
                        Object.defineProperty(this, 'onMessage', {
                            get: () => { return this.worker.onmessage; },
                            set: (onmessage) => { this.worker.onmessage = (e) => {
                                const data = e.data;
                                if (data.__cbId) {
                                    if (this.cbList[data.__cbId]) {
                                        this.cbList[data.__cbId](data);
                                        delete this.cbList[data.__cbId];
                                    }
                                } else {
                                    onmessage(data);
                                }
                            }}
                        });

                        resolve();
                    };
                });
            },

            postMessage(message, cb) {
                if (cb) {
                    this.cbList[++this.cbListSize] = cb;
                    message.__cbId = this.cbListSize;
                }

                this.worker.postMessage(message);
            },
        };

        return WebWorker;
});
