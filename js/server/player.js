define(
    [
        'eventful', 'dynamic', 'loggable', 'movable'
    ],
    (
        Eventful, Dynamic, Loggable, Movable, Inventory
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

            this.pages                 = { }; // Visible pages

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
                            tile: tile
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
                                pages: {}
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
                            pages: {}
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
                            pages: {}
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

                path.id = reqState.path.id;
                path.flag = reqState.path.flag;
                this.Log(`Path Received: {${path.id}}, ${path.flag}}`, LOG_DEBUG);

                // Check path is safe (no collisions)
                //
                // This works by essentially finding the starting point for the path and walking along that path to
                // check if each tile is open.
                const safePath = area.pathfinding.checkSafePath(reqState, path);

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
                        this.client.send(response.serialize());
                    }
                    return;
                }

                // Are we close enough to recalibrate to the starting point of the path?
                const distX = Math.abs(pathState.position.tile.x - movableState.position.tile.x),
                    distY   = Math.abs(pathState.position.tile.y - movableState.position.tile.y);
                // TODO: Env the max recal distance
                if (distX + distY > 8) {

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
                        this.client.send(response.serialize());
                    }
                    return;
                }

                let maxPathLength = path.length() + maxWalk;
                this.Log(path, LOG_DEBUG);
                const success = area.recalibratePath(movableState, pathState, path, maxPathLength);

                if (success) {

                    player.path = null;

                    this.Log(`User path from (${player.position.tile.x}, ${player.position.tile.y}) -> (${pathState.position.tile.x}, ${pathState.position.tile.y})`, LOG_DEBUG);
                    this.Log(`    (${movableState.position.global.x}, ${movableState.position.global.y}) => (${pathState.position.global.x}, ${pathState.position.global.y})`, LOG_DEBUG);
                    this.Log(path, LOG_DEBUG);
                    player.addPath(path);
                    player.recordNewPath(path, movableState);
                    this.triggerEvent(EVT_USER_ADDED_PATH);

                    if (this.isConnected) {
                        const response = new Response(action.id);
                        response.success = true;
                        this.client.send(response.serialize());
                    }
                } else {
                    this.Log("Could not recalibrate our current position to the beginning of the requested path");
                    this.Log(pathState);
                    this.Log(movableState);
                    this.Log(path);

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
                        this.client.send(response.serialize());
                    }
                }
            };

            this.disconnectPlayer = () => {
                this.Log("Disconnecting player..");
                this.movable.unload();
            };

            this.attackTarget = (targetID) => {
                this.Log(`Player requesting to attack entity [${targetID}]..`, LOG_DEBUG);
                const target = this.movable.page.movables[targetID];
                if (target && target.playerID) {
                    return; // NO player killing!
                }
                this.movable.triggerEvent(EVT_AGGRO, this.movable.page.area.movables[targetID]);
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
                                    _character: savedState.character
                                };
                                response.player._character.init = true; // FIXME: Get rid of this! It would be nice to use netRestore instead (for netInitialize)
                                this.client.send(response.serialize());
                            }

                            callback();
                        }, (err) => {

                            this.Log("Could not login player..");

                            if (this.isConnected) {
                                const response   = new Response(evt.id);
                                response.success = false;
                                response.reason  = err;
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
                                pages: {}
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
            });

            this.respond = (id, success, args) => {

                if (this.isConnected) {
                    const response = new Response(id);
                    response.success = success;
                    if (args) {
                        _.extend(response, args);
                    }
                    this.client.send(response.serialize());
                }
            };

            this.send = (evt, args) => {

                if (this.isConnected) {
                    this.client.send(JSON.stringify({
                        evtType: evt,
                        data: args
                    }));
                }
            };

            this.step = (time) => {
                this.handlePendingEvents();
            };
        };

        return Player;
    });
