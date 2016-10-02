define(() => {
    const Server = {
        _init() {
            Env.connection.resources = Env.connection.resourcesTest;
            this.initializeTestSocket();

            this.testSocketAddRequestHandler("oink", this.oink);
        },

        oink({ req, msg }) {
            Log("Oink!");
        },

        initializeTestSocket() {


            // Establish a Testing Server
            const websocket = new WebSocketServer({ port: Env.connection.testPort });

            // OnConnection
            websocket.on('connection', (client) => {

                Log("websocket connection for testing framework open", LOG_INFO);

                client.on('message', (message) => {
                    Log("Message received from Test framework");
                    Log(message);

                    const json = JSON.parse(message);

                    this.handleTestMessage(json);
                });

                client.on('close', () => {
                    Log("Testing Websocket connection closed");
                });

                client.on('error', () => {
                    Log("Testing Websocket connection error");
                });
            });
        },

        testSocketRequests: {},

        testSocketAddRequestHandler(req, callback) {
            this.testSocketRequests[req] = {
                callback
            };
        },

        handleTestMessage(msg) {

            if (msg.req in this.testSocketRequests) {
                this.testSocketRequests[msg.req].callback(msg);
            } else {
                Log("Testing socket received bad request", LOG_ERROR);
                Log(msg, LOG_ERROR);
            }
        }
    };

    return Server;
});

