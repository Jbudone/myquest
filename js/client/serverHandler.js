define(['dynamic','loggable'], (Dynamic, Loggable) => {

    const ServerHandler = function() {

        extendClass(this).with(Dynamic);
        extendClass(this).with(Loggable);

        this.setLogGroup('Connection');
        this.setLogPrefix('Connection');

        this.websocket = null;

        this.requestBuffer     = new EventsArchive();
        this.requestsId        = 0;
        this.requests          = []; // Requests sent to server

        this.connect = (link) => {

            this.requestBuffer.pushArchive();
            return new Promise((connected) => {

                this.websocket = new WebSocket(link);
                this.Log(`Connecting to: ${link}`);

                this.websocket.onopen = (evt) => {
                    this.Log("Connected to server");
                    connected(evt);
                };

                this.websocket.onerror = (evt) => {
                    this.Log("Error connecting to server", LOG_CRITICAL);
                    throw Err("Error connecting to server", evt);
                };

                this.websocket.onclose = (evt) => {
                    this.Log("Disconnected from server..");
                    this.onDisconnect();
                };

                this.websocket.onmessage = (evt) => {
                    this.Log("Message received", LOG_DEBUG);

                    // FIXME: Clean this up
                    if (Env.game.measureServerMessageTimes) {
                        if (!window['lastMessage']){
                            window['lastMessage'] = now();
                            window['maxTimeLastMessage'] = now();
                        } else {
                            var timeSinceLast = now() - window['lastMessage'];
                            console.log("Time since last message: " + timeSinceLast);
                            if (window['maxTimeLastMessage'] < timeSinceLast) {
                                window['maxTimeLastMessage'] = timeSinceLast;
                                console.log("LONGEST TIME SINCE LAST MESSAGE");
                            }

                            window['lastMessage'] = now();
                        }
                    }

                    evt = JSON.parse(evt.data);
                    if (typeof evt !== "object") {
                        this.Log("Bad message received from server", LOG_ERROR);
                    }

                    // TODO: form server as an FSM, since we can expect newCharacter or login first; and then area
                    // initialization responses next, and then area related events. Move from one state of responses to
                    // the next
                    if (evt.newCharacter) {
                        if (evt.success) this.onNewCharacter( evt.newCharacter );
                        else             this.onNewCharacterFailed();
                    } else if (evt.login) {
                        if (evt.success) this.onLogin( evt.player );
                        else             this.onLoginFailed();
                    } else if (evt.initialization) {
                        this.onInitialization( evt );
                    } else if (evt.events) {
                        const page = parseInt(evt.page, 10),
                            buffer = JSON.parse(evt.events),
                            events = buffer.events;
                        for (let i = 0; i < events.length; ++i) {
                            const event = JSON.parse(events[i]),
                                evtType = event.evtType;

                            if (evtType == EVT_ADDED_ENTITY) this.onEntityAdded( page, event.entity );
                            else if (evtType == EVT_REMOVED_ENTITY) this.onEntityRemoved( page, event.entity );
                            else if (evtType == EVT_PATH_PARTIAL_PROGRESS) this.onEntityPathProgress( page, event.data );
                            else if (evtType == EVT_CANCELLED_PATH) this.onEntityPathCancelled( page, event.data );
                            else if (evtType == EVT_ATTACKED) this.onEntityHurt( page, event.data.entity, event.data.target, event.data.amount, event.data.health );
                            else {
                                const dynamicHandler = this.handler(evtType);
                                if (dynamicHandler) {
                                    dynamicHandler.call(event, event.data);
                                } else {
                                    this.Log("Unknown event received from server", LOG_ERROR);
                                    this.Log(evt, LOG_ERROR);
                                }
                            }
                        }
                    } else if (evt.zone) {
                        this.onZone( evt.pages );
                    } else if (evt.zoneArea) {
                        this.onLoadedArea( evt.area, evt.pages, evt.player );
                    } else if (evt.respawn) {
                        this.onRespawn( evt.area, evt.pages, evt.player );
                    } else if (evt.id) {
                        // INTENTIONALLY BLANK (success/fail response to request)
                        let event = null;
                        for (let j = 0; j < this.requestBuffer.archives.length; ++j) {
                            const archive = this.requestBuffer.archives[j];
                            for (let k = 0; k < archive.archive.length; ++k) {
                                const storedEvent = archive.archive[k];
                                if (storedEvent.id === evt.id) {
                                    event = storedEvent;
                                    break;
                                }
                            }
                            if (event) break;
                        }

                        if (event) {
                            event.callback(evt);
                        } else {
                            this.Log("Error finding event in which to respond", LOG_ERROR);
                            this.Log(evt, LOG_ERROR);
                        }
                    } else {
                        const dynamicHandler = this.handler(evt.evtType);
                        if (dynamicHandler) {
                            dynamicHandler.call(evt, evt.data);
                        } else {
                            this.Log("Unknown event received from server", LOG_ERROR);
                            this.Log(evt, LOG_ERROR);
                        }
                    }
                };
            });
        };

        this.onDisconnect           = function(){};
        this.onLogin                = function(){};
        this.onLoginFailed          = function(){};
        this.onNewCharacter         = function(){};
        this.onNewCharacterFailed   = function(){};
        this.onInitialization       = function(){};
        this.onRespawn              = function(){};
        this.onLoadedArea           = function(){};
        this.onZone                 = function(){};
        this.onEntityAdded          = function(){};
        this.onEntityRemoved        = function(){};
        this.onEntityPathProgress   = function(){};
        this.onEntityPathCancelled  = function(){};
        this.onEntityHurt           = function(){};
        this.onFinishedMoving       = function(){}; // TODO: is this one necessary?


        this.login = (username, password) => {
            this.Log("Logging in..");

            // if (playerID) event = new Event((++this.requestsId), EVT_LOGIN, { id: playerID }, null);
            // else          event = new Event((++this.requestsId), EVT_NEW_CHARACTER, {}, null);
            const event = new Event((++this.requestsId), EVT_LOGIN, { username, password }, null);
            return this.request(event).then(function(){}, this.onLoginFailed)
                .catch(errorInGame);
        };

        this.requestArea = () => {
            this.Log("Requesting current area from server");
            const event = new Event((++this.requestsId), EVT_REQUEST_MAP, null, null);
            return this.request(event);
        };

        this.attackEntity = (entity) => {
            this.Log(`Sending attack request [${entity.id}]..`, LOG_DEBUG);
            const event = new Event((++this.requestsId), EVT_ATTACKED, { id:entity.id });
            return this.request(event);
        };

        this.playerDistracted = () => {
            const event = new Event((++this.requestsId), EVT_DISTRACTED, {});
            return this.request(event);
        };

        this.walkTo = (walk, state) => {
            this.Log("Sending path request..", LOG_DEBUG);
            // this.LogGroup();
            // this.Log(walk, LOG_DEBUG);
            // this.LogGroupEnd();
            const event = new Event((++this.requestsId), EVT_PREPARING_WALK, walk.toJSON(), state);
            if (walk.time) event.time = walk.time;
            return this.request(event);
        };

        this.addPath = (path, state) => {
            this.Log("Sending path request..", LOG_DEBUG);
            // this.LogGroup();
            // this.Log(walk, LOG_DEBUG);
            // this.LogGroupEnd();
            const event = new Event((++this.requestsId), EVT_NEW_PATH, path.toJSON(), state);
            if (path.time) event.time = path.time;
            return this.request(event);
        };

        this.makeRequest = (id, args) => {
            this.Log(`Sending a request.. ${id}`, LOG_DEBUG);
            const event = new Event((++this.requestsId), id, args);
            return this.request(event);
        };

        this.request = (event) => {
            return new Promise((allow, disallow) => {
                event.callback = (response) => {
                    if (response) {
                        if (response.success) {
                            allow(response);
                        } else {
                            disallow(response);
                        }
                    } else {
                        this.Log("No response from request", LOG_ERROR);
                        this.Log(event, LOG_ERROR);
                    }
                };

                this.websocket.send(event.serialize());
                this.requestBuffer.addEvent(event);

            });
        };
    };

    return ServerHandler;
});
