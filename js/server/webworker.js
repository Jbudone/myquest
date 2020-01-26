// Server WebWorker
define(() => {

        const WebWorker = {

            _init() {
            },

            initialize() {
                return new Promise((resolve, reject) => {
                    const { spawn } = require('child_process');
                    this.worker = spawn('node', ['./dist/js/server/webworker.job.js', '--module', this.module], {
                        cwd: process.cwd(),
                        env: process.env,
                        encoding: 'utf-8',

                        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
                    });

                    // Equivalent to this.onMessage = onMessage
                    let onMessage = (data) => {
                        Object.defineProperty(this, 'onMessage', {
                            get: () => { return onMessage; },
                            set: (onmessage) => { onMessage = onmessage; }
                        });

                        resolve();
                    };

                    this.worker.stdout.on('data', (data) => {
                        console.log(`stdout: ${data}`);
                    });

                    this.worker.stderr.on('data', (data) => {
                        console.error(`stderr: ${data}`);
                        DEBUGGER();
                    });

                    this.worker.on('close', (code) => {
                        console.log(`child process exited with code ${code}`);
                        DEBUGGER();
                    });

                    this.worker.on('message', (data) => {
                        console.log(data);
                        if (data.__cbId) {
                            if (this.cbList[data.__cbId]) {
                                this.cbList[data.__cbId](data);
                                delete this.cbList[data.__cbId];
                            }
                        } else {
                            onMessage(data);
                        }
                    });
                });
            },

            postMessage(message, cb) {
                if (cb) {
                    this.cbList[++this.cbListSize] = cb;
                    message.__cbId = this.cbListSize;
                }

                this.worker.send(message);
            }
        };

        return WebWorker;
});
