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

        // Don't process events until we begin initializing the server handler.
        // NOTE: We override this in client/game, so just need to pass messages that take us as far as there
        this.shouldQueueMessage     = function(evt){
            if (evt.login || evt.newCharacter || evt.initialization) return false;
            return true;
        };

        window.handledEvents       = new Array(10); // Array of events that have been passed to handleEvent (for debugging purposes)
        window.handledEventsCursor = 0;

        // We could receive multiple related events in the same frame, but require them to be processed in order (eg.
        // NetSerialize a character's health going below 0, resulting in death, before receiving the death event). This
        // allows us to handle high priority events first, and then go through the remaining events afterwards. Its
        // unfortunate to do things this way, but currently not viable to reorder those events/broadcasts on the server
        this.highPriorityEvents = [ EVT_NETSERIALIZE ];

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

                this.handleEvent = (evt) => {

                    // Push event to list of handled events (circular array)
                    window.handledEventsCursor = (window.handledEventsCursor + 1) % window.handledEvents.length;
                    window.handledEvents[window.handledEventsCursor] = evt;

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
                    } else if (evt.evtType === EVT_END_OF_FRAME) {
                        // All events that we've queued up this frame are ready to be processed
                        if (this.queuedEvents.length > 0) {
                            this.processQueuedEvents();
                        }
                    } else if (evt.events) {

                        // Pre-parse page events
                        const pageEvents     = JSON.parse(evt.events),
                            parsedPageEvents = [];

                        for (let i = 0; i < pageEvents.events.length; ++i) {
                            const pageEvent = JSON.parse(pageEvents.events[i]);
                            parsedPageEvents.push(pageEvent);
                        }

                        evt.page   = parseInt(evt.page, 10);
                        evt.events = parsedPageEvents;

                        this.queueEvt(evt);
                    } else if (evt.zone) {
                        this.queueEvt(evt);
                    } else if (evt.teleport) {
                        this.queueEvt(evt);
                    } else if (evt.zoneArea) {
                        this.queueEvt(evt);
                    } else if (evt.respawn) {
                        this.queueEvt(evt);
                    } else if (evt.id) {
                        // FIXME: Should this be queued? If so we'll need to tag a frameId on it
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
                    } else if (evt.evtType === EVT_NETSERIALIZE_OWNER) {
                        // Need to sort this into pageEvent
                        this.queueEvt(evt);
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

                this.bufferedMessages = [];

                this.bufferMessage = (msg) => {
                    this.bufferedMessages.push(msg);
                };

                this.runBufferedMessages = () => {

                    const buffer = this.bufferedMessages;
                    this.bufferedMessages = [];
                    for (let i = 0; i < buffer; ++i) {
                        this.handleMessage(buffer[i]);
                    };
                };

                this.processQueuedEvents = () => {

                    // Special Case Handling
                    // Sort EVT_NETSERIALIZE_OWNER into its pageEvents
                    // Unfortunately we can't send these along with the page since this is sent specifically to the
                    // owner. So look for any NETSERIALIZE_OWNER events and sort them into pageEvents for the specific
                    // page; if we haven't received any events for that page then just create one
                    const netSerializeOwnerList = [];
                    for (let i = 0; i < this.queuedEvents.length;) {
                        const queuedEvent = this.queuedEvents[i];
                        if (queuedEvent.evtType === EVT_NETSERIALIZE_OWNER) {
                            this.queuedEvents.splice(i, 1);
                            netSerializeOwnerList.push(queuedEvent);
                            continue;
                        }

                        ++i;
                    };

                    for (let i = 0; i < netSerializeOwnerList.length; ++i) {
                        // Find the pageEvents on the page where this netSerialize occurred
                        const netSerialize = netSerializeOwnerList[i];
                        let pageEvents = this.queuedEvents.find((queuedEvent) => queuedEvent.events && queuedEvent.page === netSerialize.data.page);

                        if (!pageEvents) {
                            pageEvents = {
                                page: netSerialize.data.page,
                                events: [],
                                evtType: EVT_PAGE_EVENTS
                            };
                            this.queuedEvents.push(pageEvents);
                        }

                        pageEvents.events.push(netSerialize);
                    }

                    // Re-order all queued events
                    const frameEvents = [],
                        queuedEvents = this.queuedEvents;
                    this.queuedEvents = [];
                    queuedEvents.forEach((queuedEvent) => {

                        if (queuedEvent.events) {

                            // Page events
                            const page = queuedEvent.page,
                                events = queuedEvent.events;

                            // Is this event from a stale page? We only want to process events from [0, evtCursor],
                            // that's the point which we removed that page and no longer need it
                            if (queuedEvent.evtCursor) {
                                events = events.slice(0, queuedEvent.evtCursor);
                            }

                            // Reorder events in order w/ netSerialize event offsets
                            const reorderedEvents   = [],
                                netSerializeOffsets = [];
                            for (let i = 0; i < events.length; ++i) {
                                const event = events[i];

                                if (event.evtType === EVT_NETSERIALIZE || event.evtType === EVT_NETSERIALIZE_OWNER) {

                                    // NetSerialize could be split into parts; loop through serialize data and order onto
                                    // entityNetSerialize as separate netSerialize events
                                    const serialized = event.data.serialize;
                                    const entityNetSerialize = [];
                                    let offset = 0;
                                    if (serialized[0] >= 0) {
                                        entityNetSerialize[offset] = {
                                            evtType: event.evtType,
                                            data: {
                                                serialize: [],
                                                entityId: event.data.entityId,
                                                page: event.data.page
                                            }
                                        };
                                    }
                                    for (let j = 0; j < serialized.length; ++j) {
                                        if (serialized[j] < 0) {
                                            // Offset by this amount
                                            offset += serialized[j] * -1;
                                            entityNetSerialize[offset] = {
                                                evtType: event.evtType,
                                                data: {
                                                    serialize: [],
                                                    entityId: event.data.entityId,
                                                    page: event.data.page
                                                }
                                            };
                                        } else {
                                            entityNetSerialize[offset].data.serialize.push(serialized[j]);
                                            entityNetSerialize[offset].data.serialize.push(serialized[++j]);
                                        }
                                    }

                                    // Push each set of netSerializes onto global netSerializeOffsets
                                    for (let j = 0; j < entityNetSerialize.length; ++j) {
                                        if (!entityNetSerialize[j]) continue;
                                        let netSerialize = entityNetSerialize[j];
                                        if (!netSerializeOffsets[j]) netSerializeOffsets[j] = [];
                                        netSerializeOffsets[j].push(netSerialize);

                                        // This event happened earlier, we've passed it already. Splice it into
                                        // reorderedEvents right now
                                        if (j < i) {
                                            reorderedEvents.splice(j, 0, netSerialize);
                                        }
                                    }
                                } else {
                                    reorderedEvents.push(event);
                                }

                                // Do we have any netSerialize events for the next order id? Push those before we get to the
                                // next event
                                if (netSerializeOffsets[i]) {
                                    for (let j = 0; j < netSerializeOffsets[i].length; ++j) {
                                        let netSerializesForOffset = netSerializeOffsets[i][j];
                                        for (let k = 0; k < netSerializesForOffset.length; ++k) {
                                            reorderedEvents.push(netSerializesForOffset[k]);
                                        }
                                    }
                                }
                            }

                            // Add remaining netSerializeOffsets
                            for (let i = events.length; i < netSerializeOffsets.length; ++i) {
                                if (!netSerializeOffsets[i]) continue;
                                for (let j = 0; j < netSerializeOffsets[i].length; ++j) {
                                    let netSerializesForOffset = netSerializeOffsets[i][j];
                                    for (let k = 0; k < netSerializesForOffset.length; ++k) {
                                        reorderedEvents.push(netSerializesForOffset[k]);
                                    }
                                }
                            }

                            // Order page events into frameEvents
                            for (let i = 0; i < reorderedEvents.length; ++i) {
                                let event      = reorderedEvents[i],
                                    frameEvtId = event.frameId;

                                let indexOfNextEvt = frameEvents.length;
                                for (let j = 0; j < frameEvents.length; ++j) {
                                    if (frameEvents[j].frameId > frameEvtId) {
                                        indexOfNextEvt = j;
                                        break;
                                    }
                                }

                                event.page = page;
                                frameEvents.splice(indexOfNextEvt, 0, {
                                    frameId: event.frameId,
                                    pageEvent: event
                                });
                            }
                        } else {

                            const frameEvtId = queuedEvent.frameId;
                            let indexOfNextEvt = frameEvents.length;
                            for (let j = 0; j < frameEvents.length; ++j) {
                                if (frameEvents[j].frameId > frameEvtId) {
                                    indexOfNextEvt = j;
                                    break;
                                }
                            }

                            frameEvents.splice(indexOfNextEvt, 0, queuedEvent);
                        }
                    });

                    // Process all re-ordered events from this frame
                    for (let i = 0; i < frameEvents.length; ++i) {
                        const evt   = frameEvents[i];

                        if (evt.pageEvent) {

                            const event = evt.pageEvent,
                                page    = event.page,
                                evtType = event.evtType;

                            if (evtType == EVT_ADDED_ENTITY) this.onEntityAdded( page, event.entity );
                            else if (evtType == EVT_REMOVED_ENTITY) this.onEntityRemoved( page, event.entity );
                            else if (evtType == EVT_NETSERIALIZE) this.onEntityNetserialize( page, event.data.entityId, event.data.serialize );
                            else if (evtType == EVT_PATH_PARTIAL_PROGRESS) this.onEntityPathProgress( page, event.data );
                            else if (evtType == EVT_CANCELLED_PATH) this.onEntityPathCancelled( page, event.data );
                            else if (evtType == EVT_DAMAGED) this.onEntityDamaged( page, event.data );
                            else if (evtType == EVT_DIED) this.onEntityDied( page, event.data );
                            else if (evtType == EVT_TELEPORT) this.onEntityTeleport( page, event.data );
                            else {
                                const dynamicHandler = this.handler(evtType);
                                if (dynamicHandler) {
                                    dynamicHandler.call(event, event.data);
                                } else {
                                    this.Log("Unknown event received from server", LOG_ERROR);
                                    this.Log(event, LOG_ERROR);
                                }
                            }
                        } else if (evt.zone) {
                            this.onZone( evt.page, evt.pages, evt.pageList );
                        } else if (evt.teleport) {
                            this.onTeleported( evt.page, evt.tile );
                        } else if (evt.zoneArea) {
                            this.onLoadedArea( evt.area, evt.pages, evt.player );
                        } else if (evt.respawn) {
                            this.onRespawn( evt.area, evt.pages, evt.player );
                        } else {
                            assert(false, "Unexpected frame event type");
                        }
                    }
                };

                // These events will be appended to the next set of 
                this.queuedEvents = []; // All queued events for this frame
                this.queueEvt = (evt) => {
                    this.queuedEvents.push(evt);
                };

                this.handleMessage = (msg) => {

                    if (this.shouldQueueMessage(msg)) {
                        this.bufferMessage(msg);
                        return;
                    }

                    this.handleEvent(msg);
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

                    const msg = JSON.parse(evt.data);
                    if (typeof msg !== "object") {
                        this.Log("Bad message received from server", LOG_ERROR);
                    }

                    this.handleMessage(msg);
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
        this.onEntityNetserialize   = function(){};
        this.onEntityPathProgress   = function(){};
        this.onEntityPathCancelled  = function(){};
        this.onEntityDamaged        = function(){};
        this.onEntityDied           = function(){};
        this.onFinishedMoving       = function(){}; // TODO: is this one necessary?
        this.onEntityTeleport       = function(){};
        this.onTeleported           = function(){};



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
