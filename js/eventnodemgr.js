define(['loggable'], (Loggable) => {


    const EventNode = function(evtNodeRes, eventnode, page) {
        assert(evtNodeRes);

        this.evtNodeRes  = evtNodeRes;
        this.base     = new evtNodeRes.base();
        this.modified = {};
        this.id       = null;
        this.page     = page;
        this.state    = {}; // Like modified but not to be serialized
        this.destroyed = false;

        this.pages = [page]; // FIXME: Only one page for now


        this.activate = () => {

            this.state.page = page;
            let result = this.base.activate(evtNodeRes.args, eventnode, this.modified, this.state, this);
            return result;
        };

        this.deactivate = () => {
            this.base.deactivate(evtNodeRes.args, eventnode, this.modified, this);
            this.destroyed = true;
        };


        this.events = {};
        this.addEvent = (key) => {
            this.events[key] = (args) => {
                this.base[key](this, args);
            };

            return this.events[key];
        };


        this.trigger = (key, args) => {
            this.events[key](args);
        };

        this.cancel = () => {
            this.base.cancel(evtNodeRes.args, eventnode, this.modified, this);
            this.deactivate();
        };

        if (Env.isServer) {

            // This indicates the evtNode hasn't had its first flush yet which includes the init/setup details. In case
            // somebody zones into the page before this flushes, we won't serialize the evtNode to that user
            this.pendingInitialFlush = true;
            this.flushData = [];

            this.serverOnly = false;


            this.serialize = () => {

                const _modified = this.base.serialize(evtNodeRes.args, eventnode, this.modified, this);

                const data = {
                    evtNodeRes: this.evtNodeRes.id,
                    id: this.id,
                    data: _modified
                };

                return data;
            };

            this.broadcast = (key, args) => {
                const evt = { event: true };
                evt.key = key;
                evt.args = args;
                this.flushData.push(evt);
            };

            this.flushUpdates = () => {
                if (!this.pendingInitialFlush && this.flushData.length === 0 && !this.destroyed) return null;

                // Store evt updates and netUpdate state, then serialize/copy/flush here
                const flush = {};
                if (this.pendingInitialFlush) {
                    // Initial creation serialization
                    flush.init = this.serialize();
                    this.pendingInitialFlush = false;
                }

                // Update stuff here (events and netUpdate)
                flush.update = this.flushData;
                this.flushData = [];

                if (this.destroyed) {
                    flush.remove = true;
                }

                return flush;
            };

            let accumulatedDelta = 0;
            this.step = (delta) => {

                accumulatedDelta += delta;
                if (accumulatedDelta > 500) {
                    const result = this.base.step(evtNodeRes.args, eventnode, this.modified, this, accumulatedDelta);
                    accumulatedDelta = 0;

                    return result;
                }

                return true;
            };

        } else {

            this.clientOnly = false;
            this.pseudoDeactivated = false;

            this.netInitialize = (id, modified) => {
                this.id = id;
                this.modified = modified;
                modified.page = page;
                const result = this.activate();
                return result;
            };

            this.netUpdate = (modified) => {
                // FIXME: Any point to this? Might be better to just stick w/ netEvent for now
                this.modified = modified;
                modified.page = page;
            };

            this.netEvent = (event) => {
                this.events[event.key](event.args);
            };

            this.step = (delta) => {
                const result = this.base.step(evtNodeRes.args, eventnode, this.modified, this, delta);
                return result;
            };

            // Unload due to leaving page, different from deactivating
            this.unload = () => {
                this.base.unload(evtNodeRes.args, eventnode, this.modified, this);
            };

            this.pseudoDeactivate = () => {
                this.pseudoDeactivated = true;
                const result = this.base.pseudoDeactivate(evtNodeRes.args, eventnode, this.modified, this);
            };

            this.linkToServer = (args) => {
                this.id = args.evtId;
            };
        }
    };

    const EventNodeMgr = function(area) {

        extendClass(this).with(Loggable);

        this.setLogGroup('EventNodeMgr');
        this.setLogPrefix(`EventNodeMgr: ${area.id}`);

        this.evtNodes = [];
        this.lastTick = 0;

        this.triggerNode = (id, key, args) => {
            const evtNodeI = this.evtNodes.findIndex((e) => e.id === id),
                evtNode    = this.evtNodes[evtNodeI];

            evtNode.trigger(key, args);
        };

        if (Env.isServer) {
            let maxID = 0;

            this.queuedNodes = [];
            this.queuedDestroyedNodes = [];
            this.addNode = (eventnode, page, activate) => {

                const EventNodes = Resources.eventnodes;
                const evtNodeRes = EventNodes[eventnode.id];
                const evtNode = new EventNode(evtNodeRes, eventnode, page);

                evtNode.id = maxID;
                if (++maxID >= Number.MAX_SAFE_INTEGER) {
                    maxID = 0;
                }


                if (activate) {
                    this.evtNodes.push(evtNode);
                    let idx = this.evtNodes.length - 1;
                    let result = evtNode.activate();
                    if (result === false) {
                        evtNode.deactivate();
                        this.queuedDestroyedNodes.push(evtNode); // FIXME: Double check we need this, I think we need it to flush update once across page serialize
                        this.evtNodes.splice(idx, 1);
                    }
                } else {
                    this.queuedNodes.push(evtNode);
                }

                return evtNode;
            };

            this.serializePage = (page) => {

                // NOTE: Do NOT serialize evtNode's which haven't flushed their creation yet, this makes it easier to
                // netInitialize/netUpdate events at the same time for everyone, and only serialize init for users
                // zoning into the page when the evtNode has already been initialized for others
                const serializedNodes = [];
                this.evtNodes.forEach((evtNode) => {
                    if (evtNode.page === page && !evtNode.pendingInitialFlush && !evtNode.serverOnly) {
                        const serializedNode = evtNode.serialize();
                        if (serializedNodes) {
                            serializedNodes.push(serializedNode);
                        }
                    }
                });

                return serializedNodes;
            };

            this.initialize = () => {

            };

            this.activate = () => {
                this.queuedNodes.forEach((evtNode) => {
                    this.evtNodes.push(evtNode);
                    let idx = this.evtNodes.length - 1;
                    let result = evtNode.activate();
                    if (result === false) {
                        evtNode.deactivate();
                        this.queuedDestroyedNodes.push(evtNode); // FIXME: Double check we need this, I think we need it to flush update once across page serialize
                        this.evtNodes.splice(idx, 1);
                    }
                });

                this.queuedNodes = [];
            };

            this.step = (time) => {

                let delta = time - this.lastTick;
                if (this.lastTick === 0) delta = 0;
                this.lastTick = time;


                for (let i = 0; i < this.evtNodes.length; ++i) {
                    const evtNode = this.evtNodes[i];
                    if (evtNode.step(delta) === false) {
                        evtNode.deactivate();
                    }

                    if (evtNode.destroyed) {
                        this.queuedDestroyedNodes.push(evtNode);
                        this.evtNodes.splice(i, 1);
                        --i;
                    }
                }

                this.flushUpdatesPages();
            };

            this.flushUpdatesPages = () => {
                const pageUpdates = {};

                const processEvtNode = (evtNode) => {
                    const updates = evtNode.flushUpdates();
                    if (!updates) return;

                    evtNode.pages.forEach((page) => {
                        const pageI = page.index;
                        if (!pageUpdates[pageI]) {
                            pageUpdates[pageI] = { }
                        }

                        pageUpdates[pageI][evtNode.id] = updates;
                    });
                };

                this.evtNodes.forEach(processEvtNode);
                this.queuedDestroyedNodes.forEach(processEvtNode);
                this.queuedDestroyedNodes = [];

                _.forEach(pageUpdates, (updateList, pageI) => {
                    area.pages[pageI].broadcast(EVT_EVTNODEMGR_UPDATES_PAGE, updateList);
                });
            };

            this.flushUpdatesUsers = () => {
                // FIXME: Similar to pages but for specified users
            };

        } else {

            let attachToSprites = {};

            this.initialize = () => {

                _.forEach(Resources.eventnodes, (eventnode, eventnodeId) => {
                    if (eventnode.env === 'client' && eventnode.attach) {
                        if (eventnode.attach.type === 'sprite') {
                            attachToSprites[eventnode.attach.sprite] = eventnode;
                        }
                    }
                });
            };

            this.activate = () => {

                // FIXME: Shouldn't need to ref The.scripting
                The.scripting.server.registerHandler(EVT_EVTNODEMGR_UPDATES_PAGE, 'eventnodemgr');
                The.scripting.server.handler(EVT_EVTNODEMGR_UPDATES_PAGE).set((evt, data) => {
                    // Received updates from server
                    _.forEach(data, (_evtNode, evtNodeId) => {

                        const page = The.area.pages[evt.page];
                        assert(page);

                        const id = parseInt(evtNodeId, 10);

                        if (_evtNode.init) {
                            // If this was a locally created evtNode then we'll already have this evtNode
                            let evtNodeI = this.evtNodes.findIndex((e) => e.id === id);
                            if (evtNodeI >= 0) {
                                // FIXME: Do we need to do anything here?
                            } else {
                                this.netInitializeNode(_evtNode.init, page);
                            }
                        }

                        const evtNodeI = this.evtNodes.findIndex((e) => e.id === id),
                            evtNode    = this.evtNodes[evtNodeI];

                        // We remove the evtNode on the server before sending update/remove; so we may be seeing the end
                        // of this evtNodes life before seeing it initialized. Just ignore
                        // We may also have removed locally due to local authoritative node
                        if (!evtNode && _evtNode.remove) {
                            return;
                        }

                        if (_evtNode.update) {
                            _evtNode.update.forEach((update) => {
                                if (update.event) {
                                    evtNode.netEvent(update);
                                } else {
                                    evtNode.netUpdate(update);
                                }
                            });
                        }

                        if (_evtNode.remove) {
                            // Removal stuff (this can all happen in the same frame)
                            evtNode.destroyed = true; // Queue destruction until final step
                            evtNode.deactivate();
                            this.evtNodes.splice(evtNodeI, 1);
                        }
                    });
                });
            };

            this.step = (time) => {

                let delta = time - this.lastTick;
                if (this.lastTick === 0) {
                    delta = 0;
                    this.activate();
                }
                this.lastTick = time;


                for (let i = 0; i < this.evtNodes.length; ++i) {
                    const evtNode = this.evtNodes[i];
                    if (evtNode.pseudoDeactivated) continue;

                    if (!evtNode.destroyed && evtNode.step(delta) === false) {
                        // FIXME: Deactivate if clientOnly? Pseudodeactivate otherwise?
                        if (evtNode.env === "client") {
                            evtNode.deactivate();

                            this.evtNodes.splice(i, 1);
                            --i;
                        } else {
                            // Wait for server to deactivate for us
                            evtNode.pseudoDeactivate();
                        }
                    }

                    if (evtNode.destroyed) {
                        this.evtNodes.splice(i, 1);
                        --i;
                    }
                }
            };

            this.localInitializeNode = (eventnode, page) => {
                eventnode.id = -1;
                return this.netInitializeNode(eventnode, page);
            };

            this.netInitializeNode = (eventnode, page) => {
                const eventnodeArgs = eventnode.data;
                const EventNodes = Resources.eventnodes;
                const evtNodeRes = EventNodes[eventnode.evtNodeRes];
                const evtNode = new EventNode(evtNodeRes, eventnodeArgs, page);
                this.evtNodes.push(evtNode);
                const result = evtNode.netInitialize(eventnode.id, eventnode.data);
                if (result === false) {
                    evtNode.pseudoDeactivate();
                }

                return evtNode;
            };

            this.removePage = (page, pageI) => {

                for (let i = this.evtNodes.length - 1; i >= 0; --i) {
                    let evtNode = this.evtNodes[i];
                    if (evtNode.page === page) {
                        evtNode.unload();
                        this.evtNodes.splice(i, 1);
                    }
                }
            };

            this.addPage = (page, pageI) => {

                // Look through list of auto-attachments to attach evtNodes
                page.sprites.forEach((spriteObj, coord) => {
                    if (!spriteObj) return;

                    if (attachToSprites[spriteObj.sprite]) {
                        const localY = Math.floor(coord / Env.pageWidth),
                            localX   = coord - localY * Env.pageWidth,
                            globalCoord = (page.y + localY) * The.area.areaWidth + page.x + localX;

                        const eventnode = attachToSprites[spriteObj.sprite];

                        const init = {
                                evtNodeRes: eventnode.id,
                                id: -1,
                                data: {
                                    region: [globalCoord]
                                }
                            };

                        this.netInitializeNode(init, page);
                    }
                });
            };

            this.unload = () => {
                The.scripting.server.handler(EVT_EVTNODEMGR_UPDATES_PAGE).unset();
            };
        }
    };

    return EventNodeMgr;
});

