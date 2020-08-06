define(
    [
        'eventful', 'dynamic', 'loggable', 'movable'
    ],
    (
        Eventful, Dynamic, Loggable, Movable
    ) => {

        const Player = function(client) {

            extendClass(this).with(Loggable);
            extendClass(this).with(Eventful);
            extendClass(this).with(Dynamic);

            this.setLogGroup('Player');
            this.setLogPrefix('Player [null]');

            this.id                    = null;
            this.movable               = null;
            this.client                = client;

            this.onDisconnected        = function() {};
            this.onRequestNewCharacter = function() {};
            this.onLogin               = function() {};

            this.onPreparingToWalk     = function() {};
            this.onSomeEvent           = function() {};
            this.queuedReceives        = [];

            this.pages                 = { }; // Visible pages
            this.stalePages            = [];

            this.queuedDisconnect      = false;
            this.timeToDisconnect      = null;
            this.isConnected           = true;

            this._character            = null; // Character read from DB


            this.setPlayer = (player) => {

                this.id = player.id;
                this.setLogPrefix(`Player ${player.id}`);
                this.Log(`Logged in player ${player.id}`, LOG_DEBUG);

                // Set players position
                if (!The.world.areas[player.area]) {
                    throw Err(`Area (${player.area}) not found in the world!`);
                }

                const area         = The.world.areas[player.area],
                    respawnArea    = The.world.areas[player.respawn.area],
                    playerPosition = area.localFromGlobalCoordinates(player.position.tile.x, player.position.tile.y),
                    respawnPoint   = respawnArea.localFromGlobalCoordinates(player.respawn.position.tile.x, player.respawn.position.tile.y);

                this.movable = new Movable('player', playerPosition.page, {
                    position: {
                        tile: {
                            x: player.position.tile.x,
                            y: player.position.tile.y },
                        global: {
                            x: player.position.tile.x * Env.tileSize,
                            y: player.position.tile.y * Env.tileSize }
                    },
                    respawnPoint: {
                        tile: {
                            x: player.respawn.position.tile.x,
                            y: player.respawn.position.tile.y
                        },
                        page: respawnPoint.page.index,
                        area: respawnPoint.page.area.id
                    }
                });
                this.movable.name     = player.username;
                this.movable.playerID = player.id;
                this.movable.player   = this;
                this._character       = player.character;

                this.movable.page.addEntity(this.movable);
                area.watchEntity(this.movable);

                this.pages = { };
                this.pages[this.movable.page.index] = this.movable.page;
                for (const neighbour in this.movable.page.neighbours) {
                    const npage = this.movable.page.neighbours[neighbour];
                    if (npage) this.pages[npage.index] = npage;
                }

                this.movable.addEventListener(EVT_TELEPORT, this, (entity, pageId, tile) => {

                    // Let player know that they've successfully teleported, and allow them to prepare for EVT_ZONE
                    // information that will come next
                    const teleport =
                        {
                            teleport: true,
                            page: pageId,
                            tile: tile,
                            frameId: The.frameEvtId
                        };
                    this.client.send(JSON.stringify(teleport));
                });

                this.movable.addEventListener(EVT_ZONE, this, (player, oldPage, page) => {
                    this.Log(`Zoned player from (${this.movable.page.index}) to (${page.index})`, LOG_DEBUG);
                    const oldNeighbours = {};

                    assert(oldPage, "No oldPage defined");

                    oldNeighbours[oldPage.index] = oldPage;
                    for (const neighbour in oldPage.neighbours) {
                        if (oldPage.neighbours[neighbour]) {
                            oldNeighbours[oldPage.neighbours[neighbour].index] = oldPage.neighbours[neighbour];
                        }
                    }

                    const oldPageList      = this.pages;
                    this.movable.page      = page;
                    this.pages             = {};
                    this.pages[page.index] = page;

                    if (this.isConnected) {

                        // Send new page & neighbours as necessary
                        // If neighbour page was sent previously then don't send again
                        const initialization =
                            {
                                zone: true,
                                page: page.index,
                                pages: {},
                                frameId: The.frameEvtId
                            };

                        if (!oldNeighbours[page.index]) {
                            const str = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                            initialization.pages[page.index] = str;
                        }

                        for (const neighbour in page.neighbours) {
                            const npage = page.neighbours[neighbour];

                            if (npage) {
                                this.pages[npage.index] = npage;
                                if (!oldNeighbours[npage.index] && npage.index != oldPage.index) {
                                    const str = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                                    initialization.pages[npage.index] = str;
                                }
                            }
                        }

                        // TODO: Since clients (currently) cannot determine their connected pages given only their new
                        // zoned page, we have to provide a list of pages that they are now connected to. This is used
                        // for clients to unload pages which they are no longer connected to. It could be nice to
                        // provide some more information about the map so that clients can determine their connected
                        // pages given their new page
                        initialization.pageList = Object.keys(this.pages);

                        this.client.send(JSON.stringify(initialization));
                    }

                    this.changedPages(oldPageList);
                    this.Log(`Player ${this.movable.id} has pages: ${Object.keys(this.pages)}`, LOG_DEBUG);
                });

                this.movable.addEventListener(EVT_ZONE_OUT, this, (player, oldArea, oldPage, area, page, zone) => {
                    this.Log(`Zoned player from (${oldArea.id})[${oldPage.index}] to (${area.id})[${page.index}]`, LOG_DEBUG);

                    // NOTE: the actual zoning process is already handled in world.js
                    // area.zoneIn(player, zone);

                    player.page = page;
                    this.pages = { };
                    this.pages[page.index] = page;

                    if (this.isConnected) {

                        const initialization = {
                            zoneArea: true,
                            area: {
                                id: area.id,
                                pagesPerRow: area.pagesPerRow,
                                areaWidth: area.area.properties.width,
                                areaHeight: area.area.properties.height,
                                tilesets: area.area.properties.tilesets
                            },
                            player: {
                                position: this.movable.position,
                                page: this.movable.page.index
                            },
                            pages: {},
                            frameId: The.frameEvtId
                        };

                        initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                        for (const neighbour in page.neighbours) {
                            const npage = page.neighbours[neighbour];
                            if (npage) {
                                this.pages[npage.index] = npage;
                                initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                            }
                        }

                        this.client.send(JSON.stringify(initialization));
                    }
                });

                return true;
            };

            this.changedPages = (oldPages) => {
                // FIXME: This won't work if we add the same page multiple times (ie. zone multiple times,
                // losing/adding/losing this page again in one event frame)
                for (const oldPageId in oldPages) {
                    const oldPage = oldPages[oldPageId];
                    if (!_.find(this.pages, oldPage)) {
                        this.stalePages.push({
                            page: oldPage,
                            evtCursor: oldPage.eventsBuffer.length
                        });
                    }
                };
            };

            this.respawn = () => {

                this.pages = {};
                this.pages[this.movable.page.index] = this.movable.page;

                if (this.isConnected) {

                    const page = this.movable.page,
                        area   = page.area,
                        initialization = {
                            respawn: true,
                            area: {
                                id: area.id,
                                pagesPerRow: area.pagesPerRow,
                                areaWidth: area.area.properties.width,
                                areaHeight: area.area.properties.height,
                                tilesets: area.area.properties.tilesets
                            },
                            player: {
                                position: {
                                    tile: {
                                        x: this.movable.position.tile.x,
                                        y: this.movable.position.tile.y },
                                    global: {
                                        x: this.movable.position.global.x,
                                        y: this.movable.position.global.y }
                                },
                                page: this.movable.page.index,
                                _character: this.movable.character.netSerialize(true)
                            },
                            pages: {},
                            frameId: The.frameEvtId
                        };

                    initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                    for (const neighbour in page.neighbours) {
                        const npage = page.neighbours[neighbour];
                        if (npage) {
                            this.pages[npage.index] = npage;
                            initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                        }
                    }

                    this.client.send(JSON.stringify(initialization));
                }
            };

            this.handlePathRequest = (action) => {

                //  Create path from request
                // =================================

                const path   = new Path(),
                    walk     = new Walk(),
                    player   = this.movable,
                    area     = player.page.area,
                    reqState = action.state,
                    maxWalk  = 1500 / player.moveSpeed; // maximum delay of 1.5s (1500/(moveSpeed*tileSize))

                const result = path.fromJSON(action.data);
                if (_.isError(result)) {
                    this.Log("Error serializing path request");
                    return;
                }
                //walk.walked = 0;
                //path.walks.push(walk);

                // FIXME: How to determine maxPath?
                //if (path.length() > maxWalk) {
                //    this.Log("Path longer than maxwalk..", LOG_ERROR);
                //    this.Log(path, LOG_ERROR);
                //    return;
                //}

                path.destination = action.data.walks[action.data.walks.length - 1].destination;
                path.id = reqState.path.id;
                path.flag = reqState.path.flag;
                this.Log(`Path Received: {${path.id}}, ${path.flag}}`, LOG_DEBUG);

                // Check path is safe (no collisions)
                //
                // This works by essentially finding the starting point for the path and walking along that path to
                // check if each tile is open.
                //const safePath = area.pathfinding.checkSafePath(reqState, path);


                const movableState = {
                    position: {
                        global: {
                            x: player.position.global.x,
                            y: player.position.global.y },
                        tile: {
                            x: player.position.tile.x,
                            y: player.position.tile.y }
                    }
                };

                const pathState = {
                    position: {
                        global: {
                            x: reqState.global.x,
                            y: reqState.global.y
                        },
                        tile: {
                            x: reqState.tile.x,
                            y: reqState.tile.y }
                    }
                };


                if (!player.character.canMove()) {
                    if (this.isConnected) {

                        const response = new Response(action.id);
                        response.success = false;
                        response.state   = {
                            position: {
                                global: {
                                    x: movableState.position.global.x,
                                    y: movableState.position.global.y },
                                tile: {
                                    x: movableState.position.tile.x,
                                    y: movableState.position.tile.y }
                            }
                        };
                        response.frameId = The.frameEvtId;
                        this.client.send(response.serialize());
                    }

                    return;
                }

                /*
                if (!safePath) {
                    this.Log("Path is not safe for user... cancelling!");

                    if (this.isConnected) {

                        const response   = new Response(action.id);
                        response.success = false;
                        response.state   = {
                            position: {
                                global: {
                                    x: movableState.position.global.x,
                                    y: movableState.position.global.y },
                                tile: {
                                    x: movableState.position.tile.x,
                                    y: movableState.position.tile.y }
                            }
                        };
                        response.frameId = The.frameEvtId;

                        this.client.send(response.serialize());
                    }
                    return;
                }

                // Are we close enough to recalibrate to the starting point of the path?
                const distX = Math.abs(pathState.position.tile.x - movableState.position.tile.x),
                    distY   = Math.abs(pathState.position.tile.y - movableState.position.tile.y);
                // TODO: Env the max recal distance
                if (distX + distY > 80) {

                    this.Log("We're not close enough to the beginning of the requested path");
                    this.Log(pathState);
                    this.Log(movableState);

                    if (this.isConnected) {

                        const response = new Response(action.id);
                        response.success = false;
                        response.state   = { position: {
                            global: {
                                x: movableState.position.global.x,
                                y: movableState.position.global.y },
                            tile: {
                                x: movableState.position.tile.x,
                                y: movableState.position.tile.y }
                        }
                        };
                        response.frameId = The.frameEvtId;
                        this.client.send(response.serialize());
                    }
                    return;
                }
                */


                // FIXME: Decide if we should recalibrate from curPos -> pathPos and unshift to provide path  OR  find a
                // direct path from curPos -> pathDestination
                // We could also use provided path as a hint to the worker pathfinding, or even add some properties that
                // we don't stray too far from the provided path
                {
                    const fromPt  = { x: movableState.position.global.x, y: movableState.position.global.y },
                        toPt      = { x: path.destination.x, y: path.destination.y },
                        fromTiles = [new Tile(Math.floor(fromPt.x / Env.tileSize), Math.floor(fromPt.y / Env.tileSize))],
                        toTiles   = [new Tile(Math.floor(toPt.x / Env.tileSize), Math.floor(toPt.y / Env.tileSize))];


                    player.cancelPath();
                    this.Log(`Going from: (${fromPt.x}, ${fromPt.y}) -> (${toPt.x}, ${toPt.y})`, LOG_DEBUG);
                    area.pathfinding.workerHandlePath({
                        movableID: player.id,
                        startPt: { x: fromPt.x, y: fromPt.y },
                        endPt: { x: toPt.x, y: toPt.y }
                    }).then((localPath) => {

                        this.Log(localPath, LOG_DEBUG);
                        player.path = null;
                        if (localPath.path.ALREADY_THERE) {
                            this.Log("No need to recalibate to position; we're already synced");

                            // NOTE: This can happen where the user and server position are out of sync and the user
                            // just happens to click to move to the server position
                        } else {

                            // FIXME: Prepend recalibration to path?
                            //let walks = localPath.path.walks;
                            //_.forEachRight(walks, (walk) => {
                            //    path.walks.unshift(walk);
                            //});

                            this.Log(`User path from (${player.position.tile.x}, ${player.position.tile.y}) -> (${pathState.position.tile.x}, ${pathState.position.tile.y})`, LOG_DEBUG);
                            this.Log(`    (${movableState.position.global.x}, ${movableState.position.global.y}) => (${pathState.position.global.x}, ${pathState.position.global.y})`, LOG_DEBUG);
                            this.Log(localPath.path, LOG_DEBUG);
                            player.addPath(localPath.path);
                            player.recordNewPath(localPath.path, movableState);
                            this.triggerEvent(EVT_USER_ADDED_PATH);
                        }


                        if (this.isConnected) {
                            const response = new Response(action.id);
                            response.success = true;
                            response.frameId = The.frameEvtId;
                            this.client.send(response.serialize());
                        }
                    }).catch((data) => {

                        this.Log("Could not find path");
                        this.Log(pathState);
                        this.Log(movableState);
                        this.Log(localPath);

                        if (this.isConnected) {

                            const response = new Response(action.id);
                            response.success = false;
                            response.state   = {
                                position: {
                                    global: {
                                        x: movableState.position.global.x,
                                        y: movableState.position.global.y },
                                    tile: {
                                        x: movableState.position.tile.x,
                                        y: movableState.position.tile.y }
                                }
                            };
                            response.frameId = The.frameEvtId;
                            this.client.send(response.serialize());
                        }


                        console.error("Could not find path!");
                        this.Log(`FAILED TO FIND PATH: (${playerX}, ${playerY}) -> (${toX}, ${toY})`, LOG_INFO);
                    });

                    return;
                }
            };

            this.disconnectPlayer = () => {
                this.Log("Disconnecting player..");
                this.movable.unload();
            };

            this.wantToDisconnect = () => {
                this.queuedDisconnect = true;
                this.timeToDisconnect = Env.game.disconnecting.waitTimeToDisconnect;
            };

            this.canDisconnect = () => {
                return (!Env.game.disconnecting.dontDisconnectIfBusy || this.movable.character.canDisconnect());
            };

            client.on('close', () => {
                this.onDisconnected();
                this.isConnected = false;
                this.Log(`websocket connection close [${this.id}]`);
            });

            // FIXME: do we need to disconnect them from all errors ??
            client.on('error', () => {
                this.onDisconnected();
                this.isConnected = false;
                this.Log(`websocket connection error.. disconnecting user [${this.id}]`);
            });

            client.on('message', (evt) => {

                // If we haven't even logged in yet, then we won't end up stepping through this. So can't queue messages
                if (this.id === null) {
                    this.receiveEvt(evt);
                } else {

                    let rcvTime = now();
                    if (Env.game.server.simulateLag) {
                        // Simulated lag by delaying received message by some arbitrary amount
                        const delayPacketsMin = Env.game.server.simulateLag.delayPacketsMin,
                            delayPacketsMax   = Env.game.server.simulateLag.delayPacketsMax,
                            delay             = Math.random() * (delayPacketsMax - delayPacketsMin) + delayPacketsMin;

                        // NOTE: TCP promises ordered packets, so have to add ontop of last queued packet rcvTime
                        if (this.queuedReceives.length) {
                            rcvTime = Math.max(rcvTime, this.queuedReceives[this.queuedReceives.length - 1].rcvTime);
                        }

                        rcvTime += Math.floor(delay);
                    }

                    this.queuedReceives.push({ evt, rcvTime });
                }

                //this.receiveEvt(evt);
            });

            this.respond = (id, success, args) => {

                if (this.isConnected) {
                    const response = new Response(id);
                    response.success = success;
                    response.frameId = The.frameEvtId;
                    if (args) {
                        // Don't overwrite evt response args
                        assert(!args.hasOwnProperty('id'));
                        assert(!args.hasOwnProperty('frameId'));
                        assert(!args.hasOwnProperty('success'));

                        _.extend(response, args);
                    }
                    this.client.send(response.serialize());
                }
            };

            this.send = (evt, args) => {

                if (this.isConnected) {
                    this.client.send(JSON.stringify({
                        evtType: evt,
                        data: args,
                        frameId: The.frameEvtId
                    }));
                }
            };

            this.step = (time) => {
                this.handlePendingEvents();

                const nowTime = now();
                let receivedIdx = -1;
                for (let i = 0; i < this.queuedReceives.length; ++i) {
                    if (nowTime >= this.queuedReceives[i].rcvTime) {
                        receivedIdx = i;
                        this.Log("About to dequeue receive", LOG_INFO);
                        this.receiveEvt(this.queuedReceives[i].evt);
                    } else {
                        this.Log(`${nowTime} < ${this.queuedReceives[i].rcvTime}`, LOG_DEBUG);
                    }
                }

                if (receivedIdx >= 0) {
                    this.queuedReceives.splice(0, receivedIdx + 1);
                }
            };

            this.receiveEvt = (evt) => {

                this.Log(evt, LOG_DEBUG);
                evt = JSON.parse(evt);
                const evtType = parseInt(evt.evtType, 10);

                if (!this.id) {

                    if (evtType === EVT_NEW_CHARACTER) {

                        this.Log("User requesting a new character..", LOG_DEBUG);
                        this.onRequestNewCharacter().then((newID) => {
                            this.Log(`Created new character for player [${newID}]`);

                            if (this.isConnected) {
                                const response        = new Response(evt.id);
                                response.success      = true;
                                response.newCharacter = { id: newID };
                                this.client.send(response.serialize());
                            }
                        }, () => {
                            this.Log("Could not create new player..", LOG_ERROR);
                            // TODO: tell user
                        })
                        .catch(errorInGame);
                    } else if (evtType === EVT_LOGIN) {

                        const username = evt.data.username,
                            password   = evt.data.password;

                        this.Log(`User logging in as [${username}]`);
                        this.onLogin(username, password).then((details) => {

                            const savedState = details.savedState,
                                callback     = details.callback,
                                succeeded    = this.setPlayer(savedState);

                            if (!succeeded) {

                                if (this.isConnected) {
                                    const response   = new Response(evt.id);
                                    response.success = false;
                                    response.frameId = The.frameEvtId;
                                    this.client.send(response.serialize());
                                }
                                return;
                            }

                            if (this.isConnected) {
                                const response   = new Response(evt.id);
                                response.success = true;
                                response.login   = true;
                                response.player  = {
                                    position: savedState.position,
                                    playerID: this.movable.playerID,
                                    id: this.movable.id,
                                    name: this.movable.name,
                                    _character: savedState.character,
                                    frameId: The.frameEvtId
                                };
                                response.player._character.init = true; // FIXME: Get rid of this! It would be nice to use netRestore instead (for netInitialize)
                                this.client.send(response.serialize());
                            }

                            callback();
                        }, (err) => {

                            this.Log(`Could not login player: ${err}`);

                            if (this.isConnected) {
                                const response   = new Response(evt.id);
                                response.success = false;
                                response.reason  = err;
                                response.frameId = The.frameEvtId;
                                this.client.send(response.serialize());
                            }
                        })
                        .catch(errorInGame);
                    }

                    return;
                }

                if (evtType === EVT_REQUEST_MAP) {

                    this.Log("Sending requested area..", LOG_DEBUG);

                    if (this.isConnected) {
                        const page = this.movable.page,
                            area   = page.area,
                            initialization = {
                                initialization: true,
                                area: {
                                    id: area.id,
                                    pagesPerRow: area.pagesPerRow,
                                    areaWidth: area.area.properties.width,
                                    areaHeight: area.area.properties.height,
                                    tilesets: area.area.properties.tilesets
                                },
                                pages: {},
                            };

                        initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                        for (const neighbour in page.neighbours) {
                            const npage = page.neighbours[neighbour];
                            if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
                        }

                        this.client.send(JSON.stringify(initialization));
                    }

                } else if (evtType === EVT_NEW_PATH) {

                    this.Log(`new message from user.. FROM (${evt.state.global.x}, ${evt.state.global.y}) ----> ${evt.data.distance}`, LOG_DEBUG);
                    this.handlePathRequest(evt);

                } else if (evtType === TEST_CHECKJPS) {

                    if (Env.game.useJPS) {
                        // FIXME: should move this into dynamic handler for a debugging-specific script

                        const area           = The.world.areas[evt.data.areaID],
                            differences      = {},
                            clientJumpPoints = evt.data.JPS;

                        let i = 0;
                        for (let y = evt.data.y; y < Env.pageHeight; ++y) {
                            for (let x = evt.data.x; x < Env.pageWidth; ++x) {
                                for (let d = 0; d < 4; ++d) {
                                    if (area.jumpPoints[4 * (y * area.areaWidth + x) + d] !== clientJumpPoints[i]) {
                                        const tileID = 4 * (y * area.areaWidth + x) + d;
                                        differences[tileID] = area.jumpPoints[4 * (y * area.areaWidth + x) + d];
                                    }

                                    ++i;
                                }
                            }
                        }

                        this.respond(evt.id, _.isEmpty(differences), {
                            differences: differences
                        });
                    }

                } else {

                    const dynamicHandler = this.handler(evtType);
                    if (dynamicHandler) {
                        dynamicHandler.call(evt, evt.data);
                    } else {
                        this.onSomeEvent(evt);
                    }
                }
            };

            this.setCharacterTemplate = (template) => {

                const results = {},
                    success = true;

                this.movable.character.charComponent('buffmgr').clearBuffs();

                for (const statName in template.stats) {
                    const stat = template.stats[statName];
                    this.movable.character.stats[statName].cur = stat;
                    this.movable.character.stats[statName].curMax = stat;
                    this.movable.character.stats[statName].max = stat;
                }

                for (const componentName in template.components) {
                    const templateComponent = template.components[componentName],
                        charComponent = this.movable.character.charComponent(componentName);

                    for (const key in templateComponent) {
                        charComponent[key] = templateComponent[key];
                    }
                }

                if (template.items) {

                    results.items = [];

                    const inventory = this.movable.character.inventory;
                    inventory.clearInventory();

                    template.items.forEach((itm) => {

                        if (!(itm in Resources.items.list)) {
                            success = false;
                            return;
                        }

                        const itmRef = Resources.items.list[itm],
                            result   = inventory.addItem(itmRef);

                        if (result === false) {
                            success = false;
                        } else {
                            results.items.push({
                                itmres: itm,
                                slot: result
                            });
                        }
                    });
                }

                return results;
            };

            // FIXME: Abstract this to admin commands
            this.registerHandler(CMD_ADMIN_DAMAGE_ENTITY);
            this.handler(CMD_ADMIN_DAMAGE_ENTITY).set((evt, data) => {

                const character = this.movable.character,
                    area        = this.movable.page.area,
                    target      = area.movables[data.id];
                let err         = null,
                    source      = null;

                if (!target) err = "No target currently";
                else if (!_.isObject(target)) err = "Target not found";
                else if (!_.isObject(target.character)) err = "Target does not have a character reference"; // FIXME: Unecessary once we fix the issue below
                //else if (!(target.character instanceof Character)) err = "Target does not have a character reference";
                // FIXME: No reference to Character before scripts have been initialized

                if (data.source) source = area.movables[data.source];
                if (source) source = source.character;

                if (data.source !== null && !source) err = `Invalid source for damage: ${data.source}`;

                if (!err) {
                    if (!target.character.isAttackable()) err = "Character is not attackable";
                }

                if (err) {
                    this.Log(`Disallowing user attack: ${err}`, LOG_ERROR);
                    this.respond(evt.id, false, {
                        reason: err
                    });
                    return;
                }

                target.character.damage(data.amount, source, {});

                this.respond(evt.id, true);
            });
        };

        return Player;
    });
