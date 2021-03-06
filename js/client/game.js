
// Client Game
//
// Client game functionality runs here. Any sort of interaction with the client, handling events from the server, and
// the actual game loop are all done here.   

// TODO: Find a better way to replace modules for bots
const fxmgrPath = Env.isBot ? 'test/pseudofxmgr' : 'client/fxmgr',
    rendererPath = Env.isBot ? 'test/pseudoRenderer' : 'client/renderer',
    uiPath = Env.isBot ? 'test/pseudoUI' : 'client/ui';
define(
    [
        'loggable', 'entity', 'movable', 'area', 'page', 'scriptmgr',
        'client/camera', fxmgrPath, rendererPath, uiPath
    ],
    (
        Loggable, Entity, Movable, Area, Page, ScriptMgr,
        Camera, FXMgr, Renderer, UI
    ) => {

        window.Movable = Movable;
        window.Entity  = Entity;

        const Game = function() {

            extendClass(this).with(Loggable);
            this.setLogGroup('Game');
            this.setLogPrefix('Game');

            this.onStarted = function() {};
            this.gameStep = function() {};

            let server   = null,
                ui       = null,
                renderer = null,
                initialListening = true,
                isGameRunning = false;


            // Callback pattern to defer tasks for when the game has finished readying
            // TODO: Abstract this into a pattern in util (this sounds strikingly similar to $.when, perhaps there's a _
            // alternative?)
            let ready = true,
                callbacksWhenReady = [];

            const callbackWhenReady = (callback) => {
                if (ready) callback();
                else callbacksWhenReady.push(callback);
            };
            const callbacksReady = () => {
                ready = true;
                callbacksWhenReady.forEach((task) => { task(); });
                callbacksWhenReady = [];
            };


            // Setup event listeners specific to our player
            // This is done when we start the game, any time we load into a new area or respawn
            const listenToPlayer = () => {

                // Zoning (new page)
                // Need to reset area listeners since this was all cleared when reloading scripts
                // NOTE: This is intentionally a function with the intention of using the area context
                The.player.addEventListener(EVT_ZONE, The.area, function(player, oldPage, newPage, direction) {
                    this.Log(`Zoned to page: ${newPage.index}`, LOG_DEBUG);
                    this.zone(newPage);
                    ui.updatePages();
                    The.renderer.updatePages();
                    The.camera.centerCamera();
                });

                // First time setting up event listeners
                if (initialListening) {

                    The.player.addEventListener(EVT_FINISHED_PATH, this, (player, walk) => {
                        ui.tilePathHighlight = null;
                    });

                    The.player.addEventListener(EVT_NEW_PATH, this, (player, path) => {

                        const area = The.area;
                        const playerPosition = {
                            global: {
                                x: The.player.position.global.x,
                                y: The.player.position.global.y },
                            tile: {
                                x: The.player.position.tile.x,
                                y: The.player.position.tile.y }
                        };

                        const state = {
                            page: The.area.curPage.index,
                            global: {
                                x: playerPosition.global.x,
                                y: playerPosition.global.y },
                            tile: {
                                x: playerPosition.tile.x,
                                y: playerPosition.tile.y },
                            path: {
                                id: player.path.id,
                                flag: player.path.flag
                            }
                        };

                        if (player.path.id === null) {
                            throw Err("Player's path ID is null");
                        }

                        this.Log("Sending walkTo request", LOG_DEBUG);
                        this.Log(state, LOG_DEBUG);

                        // Do we have any walks that we don't want to send to the server? If we don't want to send any
                        // of them then mark path as dontSendToServer
                        if (path.walks.find((w) => !w.dontSendToServer) === undefined) {
                            path.dontSendToServer = true;
                        }

                        // We may not want to send this path to the server. If so then early-out.  This could be because
                        // we've received this path from the server (eg. automated movement) and we only needed to
                        // process it locally
                        if (path.dontSendToServer) {
                            return true;
                        }

                        // FIXME: Should we ever have a path that we want to send to the server consisting of 1 or more
                        // walks that we don't want to send to the server? (Sending the partial path) -- look into this
                        assert(path.walks.find((w) => w.dontSendToServer) === undefined, "Unexpected path consisting of walks that we don't want to send to the server");

                        server.addPath(path, state)
                            .then(() => {}, (response) => {

                                // Was the path requested before we zoned to another area? If so then this is irrelevant
                                // by now
                                if (The.area !== area) {
                                    return;
                                }

                                // Walk Denied!!
                                this.Log("Walk denied! Going back to state", LOG_ERROR);
                                this.Log(state, LOG_ERROR);
                                this.Log(path, LOG_ERROR);

                                ui.tilePathHighlight = null;

                                // Teleport to server state
                                const serverState = response.state ? response.state.position : state;
                                The.area.curPage = The.area.pages[state.page];
                                The.player.position.global.x = serverState.global.x;
                                The.player.position.global.y = serverState.global.y;
                                The.player.updatePosition();

                                The.player.path = null;
                                The.player.sprite.idle();
                                ui.updatePages();
                            })
                            .catch(errorInGame);
                    });

                    initialListening = false;
                }
            };

            // Connected/Disconnected from server
            // TODO: Should abstract unloading/unhooking routines to something more automated (eg. registering modules
            // which need to be unloaded)
            this.connected = function() {};
            this.disconnected = () => {
                The.player.unload();
                The.area.unload();
                The.scriptmgr.unload();

                if ('unhookAllHooks' in this) this.unhookAllHooks();

                isGameRunning = false;
            };

            // We've received our player information from the server. Need to create our player and pass in the details
            this.loadedPlayer = (player) => {
                The.player          = true; // NOTE: this is used to help the initiatilization of Movable below to
                                            // determine that it is our player (The.player === true)
                                            // TODO: This is a HORRIBLE hack. Find a better way to do this
                The.player          = new Movable('player');
                The.player.id       = player.id;
                The.player.playerID = player.id;
                The.player.name     = player.name;

                The.player.position = {
                    tile: {
                        x: player.position.tile.x,
                        y: player.position.tile.y },
                    global: {
                        x: player.position.tile.x * Env.tileSize,
                        y: player.position.tile.y * Env.tileSize }
                };

                The.player._character = player._character;
            };

            // Initialize the game client
            this.initialize = (evt, _server) => {

                isGameRunning = true;

                this.Log("Initializing area");
                The.area = new Area();
                The.area.loadArea(evt.area);
                The.area.addPages(evt.pages);

                server = _server;
                The.camera = new Camera();
                The.camera.initialize();

                listenToPlayer();

                reloadScripts().then(callbacksReady);

                callbackWhenReady(() => {
                    server.runBufferedMessages();
                });
            };

            // ------------------------------------------------------------------------------------------------------ //
            // ------------------------------------------------------------------------------------------------------ //

            this.start = () => {

                // Find the current page
                // NOTE: We've received our player information after logging in, then requested our area and then started
                // the game. Hence, we still need to set our page within the area
                const playerPosition = The.area.localFromGlobalCoordinates(The.player.position.tile.x, The.player.position.tile.y, true);
                The.area.curPage = playerPosition.page;
                The.player.page = The.area.curPage;

                if (!The.area.curPage.movables[The.player.id]) throw Err("Player has not yet been added to page!");

                this.Log("Initializing FX");
                window.FX = new FXMgr();
                FX.initialize(Resources.fx).then(() => {
                    FX.event('login');
                });

                this.Log("Initializing UI");
                The.UI = new UI();
                ui     = The.UI;
                if (!Env.isBot) {
                    // TODO: Should find a better way to do this
                    ui.initialize(document.getElementById('entities'));

                    ui.entityMenu.addOption('Examine', (entity) => {
                        ui.postMessage(`Here's a few stats on: ${entity.spriteID} ${entity.id}`);
                        ui.postMessage(`     Health: ${entity.npc.stats.health}`);
                        ui.postMessage(`     Strength: ${entity.npc.stats.str}`);
                        ui.postMessage(`     Constitution: ${entity.npc.stats.con}`);
                    });

                    ui.entityMenu.addOption('Admin Examine', (entity) => {
                        ui.postMessage(`Here's a few ADMIN stats on: ${entity.spriteID} ${entity.id}`);
                        ui.postMessage(`     Health: ${entity.npc.stats.health}`);
                        ui.postMessage(`     Strength: ${entity.npc.stats.str}`);
                        ui.postMessage(`     Constitution: ${entity.npc.stats.con}`);
                    }, true);

                    ui.entityMenu.addOption('Damage Entity (null source)', (entity) => {
                        server.makeRequest(CMD_ADMIN_DAMAGE_ENTITY, {
                            id: entity.id,
                            amount: 20,
                            source: null
                        }).then((data) => {
                            ui.postMessage("Damage Entity Command: Success");
                        }, (data) => {
                            ui.postMessage("Damage Entity Command: Failed");
                        })
                        .catch(errorInGame);
                    }, true);

                    ui.entityMenu.addOption('Damage Entity (from me)', (entity) => {
                        server.makeRequest(CMD_ADMIN_DAMAGE_ENTITY, {
                            id: entity.id,
                            amount: 1,
                            source: The.player.id
                        }).then((data) => {
                            ui.postMessage("Damage Entity Command: Success");
                        }, (data) => {
                            ui.postMessage("Damage Entity Command: Failed");
                        })
                        .catch(errorInGame);
                    }, true);

                }
                ui.postMessage("Initializing game..", MESSAGE_PROGRAM);
                ui.camera = The.camera;
                ui.updatePages();

                this.Log("Initializing Renderer");
                The.renderer = new Renderer();
                renderer     = The.renderer;
                if (!Env.isBot) {
                    // TODO: Should find a better way to do this
                    renderer.canvasEntities       = document.getElementById('entities');
                    renderer.canvasBackground     = document.getElementById('background');
                    renderer.ctxEntities          = renderer.canvasEntities.getContext('2d');
                    renderer.ctxBackground        = renderer.canvasBackground.getContext('2d');
                    renderer.backgroundsContainer = document.getElementById('backgrounds');
                }
                renderer.camera = The.camera;
                renderer.ui     = ui;
                renderer.setArea(The.area);
                renderer.initialize();

                // Each browser offers their own requestAnimFrame
                // TODO: This may not be necessary anymore
                let requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                                  window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

                if (Env.isBot) {
                    requestAnimationFrame = function(){}; // TODO: Find a way to abstract this
                }

                // Start Game
                const startGame = () => {
                    const gameLoopSpeed       = 30, // TODO: What is the best speed to run at?
                        profilerReportTime    = 20; // How frequently should we report from the profiler? (in terms of
                                                    // ticks)
                    let profilerReportElapsed = 0;

                    const gameLoop = () => {

                        if (!isGameRunning) return;

                        // NOTE: Need to try/catch here since setTimeout calls here and we lose the try/catch from
                        // main.js (ie. this is the top of the stack)
                        try {

                            Profiler.profile('gameStep');
                            const time = now();

                            // Step Area
                            Profiler.profile('areaStep');
                            The.area.step(time);
                            Profiler.profileEnd('areaStep');

                            // Step Scripts
                            Profiler.profile('scrptMgr');
                            The.scriptmgr.step(time);
                            Profiler.profileEnd('scrptMgr');

                            // Step UI
                            The.UI.step(time);

                            FX.step(time);

                            this.gameStep(time);

                            // Update again
                            setTimeout(gameLoop, gameLoopSpeed);
                            Profiler.profileEnd('gameStep');


                            // Report profile
                            (++profilerReportElapsed);
                            if (profilerReportElapsed >= profilerReportTime) {
                                Profiler.report();
                                profilerReportElapsed = 0;
                            }

                        } catch(e) {
                            errorInGame(e);
                        }
                    };

                    const render = () => {

                        if (!isGameRunning) return;

                        Profiler.profile('renderStep');
                        const time = now();

                        // TODO: Should the camera/UI be stepped here?
                        The.camera.step(time);
                        renderer.ui.step(time);
                        renderer.step(time);

                        renderer.render();

                        // Update again
                        requestAnimationFrame(render);
                        //setTimeout(render, 30);

                        Profiler.profileEnd('renderStep');
                    };

                    ui.fadeIn();
                    render();


                    // Can we teleport entity to the path position?
                    // If the entity is out of view and the beginning of his path is also out of view then we can safely
                    // teleport him to his path state. This helps with preventing needless out of sync issues, and
                    // needless performance loss.
                    //
                    // Though, more importantly it helps with odd cases where the entity may have a path which goes from
                    // page A -> B, where page B is out of our view; then part way through the path he changes his mind
                    // and remains in page A. If we've already processed him as entering page B, then we no longer have
                    // his current state and can't safely find a path from his current position to the new path state.
                    // Since he's out of view we shouldn't even have to worry about that anyways
                    const canJumpTeleportEntityToPath = (entity, startTile) => {

                        if (The.camera.canSeeTile(entity.position.tile) ||
                            The.camera.canSeeTile(startTile)) {

                            return false;
                        }

                        return true;
                    };


                    // ---------------------------------------------------------------------------------------------- //
                    // ---------------------------------------------------------------------------------------------- //
                    //                                      Server Messaging
                    //
                    // ---------------------------------------------------------------------------------------------- //

                    server.shouldQueueMessage = (msg) => {
                        if (server.processingQueuedEvents) return true;
                        if (!ready) {
                            const isLoadingMessage = msg.initialization || msg.zone || msg.zoneArea || msg.respawn;
                            return !isLoadingMessage;
                        }

                        return false;
                    };

                    // Entity was added to a page
                    server.onEntityAdded = (page, addedEntity) => {

                        assert(!_.isNaN(addedEntity.id), `Expected valid entity id: ${addedEntity.id}`);
                        assert(page in The.area.pages, `Adding entity (${addedEntity.id}) to a page (${page}) which we don't have. We are in ${The.area.curPage.index} and have pages (${Object.keys(The.area.pages)})`);

                        // We handle all zoning for ourselves locally
                        if (addedEntity.id === The.player.id) {
                            return;
                        }

                        
                        // TODO: Find a better way to copy over the entity (duplicate code found in area initialization &
                        // zoning into area)
                        if (The.area.movables[addedEntity.id]) {

                            const entity = The.area.movables[addedEntity.id],
                                newPage = The.area.pages[page],
                                oldPage = entity.page;
                            if (oldPage === newPage) {
                                // It looks like we already have your page set correctly
                                return;
                            }

                            this.Log(`Zoning entity [${entity.id}] from (${oldPage.index}) to page (${newPage.index})`, LOG_DEBUG);
                            oldPage.zoneEntity(newPage, entity);

                            entity.triggerEvent(EVT_ZONE, oldPage, newPage);
                            The.area.triggerEvent(EVT_ZONE, entity, oldPage, newPage);
                            return;
                        }

                        // Since we retain entities even after they leave our PVS, we could run into a situation where a
                        // player leaves our PVS, disconnects, then connects back and enters our PVS again. In this case
                        // they have a new movable ID, but should still have the same playerID
                        if (addedEntity.playerID) {
                            let stalePlayer = _.find(The.area.movables, (m) => m.playerID === addedEntity.playerID);
                            if (stalePlayer !== undefined) {
                                this.Log(`Removing Entity: ${stalePlayer.id}`, LOG_DEBUG);
                                The.area.removeEntity(stalePlayer);
                            }
                        }

                        const entity = new Movable(addedEntity.spriteID, The.area.pages[page], { id: addedEntity.id });

                        // Copy over entity properties
                        this.Log(`Adding Entity: ${addedEntity.id}  (page ${page})`, LOG_DEBUG);
                        entity.id                = addedEntity.id;
                        entity.sprite.state      = addedEntity.state;
                        entity.zoning            = addedEntity.zoning;
                        entity._character        = addedEntity._character;

                        entity.position.global.y = addedEntity.position.global.y;
                        entity.position.global.x = addedEntity.position.global.x;
                        entity.updatePosition();

                        if (addedEntity.name) {
                            entity.name = addedEntity.name;
                        }

                        if (addedEntity.playerID) {
                            entity.playerID = addedEntity.playerID;
                        }

                        // Add path if necessary
                        // TODO: This extra parse is probably unecessary. Find a way to not have to do it
                        if (addedEntity.path) {

                            // FIXME: Abstract this (perhaps path.fromJSON(..))
                            const movPath = JSON.parse(addedEntity.path),
                                path      = new Path();

                            path.id        = movPath.id;
                            path.flag      = movPath.flag;
                            path.walkIndex = movPath.walkIndex;
                            path.walked    = movPath.walked;

                            movPath.walks.forEach((walk) => {
                                // FIXME: This used to have walk.started as false, is it okay to ignore
                                // that now?
                                // walk.started = false; // in case walk has already started on server
                                path.walks.push(walk);
                            });

                            entity.addPath(path);
                            entity.recordNewPath(path);
                        }

                        // Throw entity into the wild
                        // TODO: Find a way to abstract the watch/add/pageSet/updatePos routine
                        The.area.watchEntity(entity);
                        The.area.pages[page].addEntity(entity);
                        entity.page = The.area.pages[page];
                    };

                    // Entity was removed from the area
                    server.onEntityRemoved = (page, removedEntity) => {

                        assert(!_.isNaN(removedEntity.id), `Expected valid entity id: ${removedEntity.id}`);

                        // Was it just us? Redundant information
                        if (removedEntity.id === The.player.id) return;

                        this.Log(`Removing Entity: ${removedEntity.id}`, LOG_DEBUG);

                        const entity = The.area.pages[page].movables[removedEntity.id];
                        if (!entity) throw Err(`Entity not found in area: ${removedEntity.id}`);

                        The.area.removeEntity(entity);
                    };

                    // Entity was removed from a page
                    server.onEntityLeavePage = (page, removedEntity, newPage) => {

                        assert(!_.isNaN(removedEntity.id), `Expected valid entity id: ${removedEntity.id}`);

                        // Was it just us? Redundant information
                        if (removedEntity.id === The.player.id) return;

                        this.Log(`Entity zoned between pages: ${removedEntity.id}  from ${page} -> ${newPage}`, LOG_DEBUG);

                        const entity = The.area.pages[page].movables[removedEntity.id];

                        // We may not have the entity if we've already removed them locally (eg. teleported)
                        if (!entity) {
                            this.Log(`Entity not found in area: ${removedEntity.id}`, LOG_DEBUG);
                            return;
                        }

                        // NOTE: Entities will zone between pages locally when we receive an EVT_ENTITY_ADDED event to
                        // the new page; however we may not have the new page that they've zoned to, which is what this
                        // event solves
                        if (!The.area.pages[newPage]) {
                            The.area.removeEntity(entity);
                        }
                    };

                    server.onEntityNetserialize = (page, entityId, netSerialize) => {
                        const entity = The.area.movables[entityId];
                        if (!entity) throw Err(`Entity not found in area: ${entityId}`);

                        entity.character.netUpdate(netSerialize, false);
                    };

                    server.registerHandler(EVT_NETSERIALIZE_OWNER);
                    server.handler(EVT_NETSERIALIZE_OWNER).set((evt, data) => {
                        The.player.character.netUpdate(data.serialize, true);
                    });

                    // Path Cancelled
                    server.onEntityPathCancelled = (page, event) => {

                        assert(!_.isNaN(event.id), `Expected valid entity id: ${event.id}`);

                        if (!(page in The.area.pages)) {
                            this.Log(`server.onEntityPathCancelled(${page}) from a page which is not loaded`, LOG_DEBUG);
                            return;
                        }

                        const entity = The.area.movables[event.id],
                            pathId   = event.path.id,
                            pathFlag = event.path.flag,
                            state    = event.state;

                        if (!entity) throw Err(`Entity not found in area: ${event.id}`);

                        assert(The.area.hasTile(state.position.tile) && The.area.isTileOpen(state.position.tile), "Tile is not open!");

                        // Are we currently on this cancelled path?
                        //
                        // Mismatching Path: This could occur if the entity is us and we've already cancelled the path
                        // (and potentially started a new one) before receiving this, or if lag is a factor and we
                        // haven't received this path yet before it was quickly cancelled. Its also possible that the
                        // path was created and immediately cancelled before it was even delivered.
                        //
                        //      Remote Entity - If the cancelled path came from someone else then this is new
                        //              information (since the game does not have deterministic path decision making).
                        //              Need to figure out where the server sees this entity and move him there (if
                        //              necessary).
                        //
                        //      Local Entity - If the cancelled path is a mismatch from our current path then check if
                        //              its old or new. If its new then we'll need to cancel our path and go to that
                        //              position. A new path may be our current path or a path created by the server
                        //              which we haven't received or processed yet (eg. created/cancelled on the server
                        //              before it had a chance to send).

                        let moveToCancelledPosition = true;

                        // Is this our own path which was cancelled?
                        if (event.id === The.player.id) {

                            // Have we already added this path?
                            // NOTE: This includes if its our current path
                            moveToCancelledPosition = false;
                            if (!entity.hasHadPath({ id: event.path.id, flag: event.path.flag }) ||
                                (entity.path && entity.path.id === pathId && entity.path.flag === pathFlag)) {
                                // Either we haven't added this path yet (which means it was created/cancelled on the
                                // server), or its our current path which has been cancelled. In either case this is new
                                // information and we need to catch up to the server's current position
                                moveToCancelledPosition = true;
                            }
                        }

                        // Do we need to move to the server's current position?
                        if (moveToCancelledPosition) {

                            this.Log(`Entity ${event.id} Path (${pathFlag},${pathId}) cancelled`, LOG_DEBUG);

                            // If we can't see the entity moving from his local state to the beginning of the path then we
                            // may as well teleport him there
                            if (canJumpTeleportEntityToPath(entity, state.position.tile)) {

                                The.area.teleportEntity(entity, state.position.global);

                                if (entity.path) {
                                    entity.cancelPath();
                                }
                                return;
                            }

                            // Already in cancelled position?
                            if (entity.position.global.x === state.position.global.x &&
                                entity.position.global.y === state.position.global.y) {

                                // Wow.. surprisingly we're already at the exact same position as the server when
                                // the path stopped
                                if (entity.path) {
                                    entity.cancelPath();
                                }

                                return;
                            }



                            // Recalibrate to stopped position
                            {

                                const playerX = entity.position.global.x,
                                    playerY   = entity.position.global.y,
                                    toX       = state.position.global.x,
                                    toY       = state.position.global.y,
                                    fromTiles = [new Tile(Math.floor(playerX / Env.tileSize), Math.floor(playerY / Env.tileSize))],
                                    toTiles   = [new Tile(Math.floor(toX / Env.tileSize), Math.floor(toY / Env.tileSize))];


                                The.area.pathfinding.workerHandlePath({
                                    movableID: entity.id,
                                    startPt: { x: playerX, y: playerY },
                                    endPt: { x: toX, y: toY }
                                }).then((data) => {

                                    if (data.path.ALREADY_THERE) {

                                        assert(false, "This shouldn't be possible, we already checked if we're there to early-out");
                                        return;
                                    }

                                    const path = data.path;
                                    path.id   = pathId;
                                    path.flag = pathFlag;

                                    if (event.id === The.player.id) {
                                        // Do not send this path to the server (obviously, since we're receiving the
                                        // path from the server)
                                        // TODO: Should find a cleaner way to store dontSendToServer than placing it on
                                        // every walk
                                        path.walks.forEach((walk) => {
                                            walk.dontSendToServer = true;
                                        });
                                    }


                                    // NOTE: Don't include path state here since we're running the path relative to our
                                    // current position
                                    entity.path = null;
                                    entity.addPath(path);
                                    entity.recordNewPath(path);
                                }).catch((data) => {
                                    console.error("Could not find path!");
                                });
                            }
                        }

                        entity.debugging._serverPosition = {
                            tile: {
                                x: state.position.tile.x,
                                y: state.position.tile.y },
                            toTile: {
                                x: state.position.tile.x,
                                y: state.position.tile.y },
                            global: {
                                x: state.position.global.x,
                                y: state.position.global.y },
                            toGlobal: {
                                x: state.position.global.x,
                                y: state.position.global.y }
                        };
                    };

                    // Entity Path Progress
                    // When the entity starts a new path this progress event is broadcasted. Sometimes those paths are
                    // far too long to than is necessary to broadcast (eg. npc walking across the area to go back to his
                    // spawn point), in which case only part of that path may be broadcasted. In other words, this path
                    // may or may not represent the entire length of the path from the entity. This can also be
                    // beneficial to prevent people from sniffing received paths and determining where the AI or other
                    // players are walking to.
                    server.onEntityPathProgress = (page, event) => {

                        assert(!_.isNaN(event.id), `Expected valid entity id: ${event.id}`);

                        // Its possible that we're receiving an event from a page which we were previously in but
                        // locally not in anymore.
                        // eg. we've just zoned to another page, however the server is slightly behind and sees us in
                        // the previous page and sends us an event from a previously viewable page
                        if (!(page in The.area.pages)) {
                            this.Log(`server.onEntityPathProgress(${page}) from a page which is not loaded`, LOG_DEBUG);
                            return;
                        }

                        page = The.area.pages[page];

                        const entity   = The.area.movables[event.id],
                            reqState = event.state;

                        // Do we have this entity?
                        // Its possible that we recently witnessed the entity zoning to an out-of-view page, and this is
                        // an old path progress update for the same entity which we've already removed. Simply disregard
                        // the path
                        // TODO: Is there any possible danger in discarding the update? Should we instead queue it for a
                        // short while in case we simply haven't received/loaded the movable yet? (eg. what if the
                        // server moves us into another page, and at the same time an entity which we couldn't see
                        // before moves somewhere and we receive that path progress?)
                        this.Log(`Entity ${event.id} onEntityPathProgress`, LOG_DEBUG);
                        if (!entity) {
                            this.Log("  Entity not found", LOG_DEBUG);
                            return;
                        }

                        const entPage  = entity.page;

                        const movableState = {
                                position: {
                                    global: {
                                        x: entity.position.global.x,
                                        y: entity.position.global.y },
                                    tile: {
                                        x: entity.position.tile.x,
                                        y: entity.position.tile.y }
                                }
                            },
                            pathState = {
                                position: {
                                    global: {
                                        x: reqState.position.global.x,
                                        y: reqState.position.global.y },
                                    tile: {
                                        x: reqState.position.tile.x,
                                        y: reqState.position.tile.y }
                                },

                                destination: {
                                    global: {},
                                    tile: {}
                                }
                            };

                        const path = new Path();
                        path.id = event.path.id;
                        path.flag = event.path.flag;

                        // Make sure the recalibration for to this walk's state won't take too long. If there's too much
                        // of a noticable delay then simply teleport entity to its state position
                        let maxWalk = Env.game.client.maxWalkDelay / entity.moveSpeed; // delayTime / moveSpeed = distance

                        // Build our new path
                        // We're also trying to find where this path will lead us (destination)
                        const walks = event.path.walks;
                        pathState.destination.global.x = pathState.position.global.x;
                        pathState.destination.global.y = pathState.position.global.y;
                        walks.forEach((evtWalk) => {
                            const walk     = new Walk();
                            walk.direction = evtWalk.direction;
                            walk.distance  = evtWalk.distance;
                            walk.walked    = 0; // walks[i].walked; TODO: Do we want this part?

                            path.walks.push(walk);

                            const walkDist = evtWalk.distance - evtWalk.walked;

                            const isNorth = (walk.direction === NORTH || walk.direction === NORTHWEST || walk.direction === NORTHEAST),
                                isSouth   = (walk.direction === SOUTH || walk.direction === SOUTHWEST || walk.direction === SOUTHEAST),
                                isWest    = (walk.direction === WEST || walk.direction === NORTHWEST || walk.direction === SOUTHWEST),
                                isEast    = (walk.direction === EAST || walk.direction === NORTHEAST || walk.direction === SOUTHEAST);

                                 if (isNorth) pathState.destination.global.y -= walkDist;
                            else if (isSouth) pathState.destination.global.y += walkDist;

                                 if (isWest)  pathState.destination.global.x -= walkDist;
                            else if (isEast)  pathState.destination.global.x += walkDist;

                            walk.destination = { x: pathState.destination.global.x, y: pathState.destination.global.y };
                        });

                        const destTileX = Math.floor(pathState.destination.global.x / Env.tileSize),
                            destTileY = Math.floor(pathState.destination.global.y / Env.tileSize);

                        pathState.destination.tile = new Tile(destTileX, destTileY);

                        entity.debugging._serverPosition = {
                            tile: {
                                x: reqState.position.tile.x,
                                y: reqState.position.tile.y },
                            toTile: {
                                x: pathState.destination.tile.x,
                                y: pathState.destination.tile.y },
                            global: {
                                x: reqState.position.global.x,
                                y: reqState.position.global.y },
                            toGlobal: {
                                x: pathState.position.global.x,
                                y: pathState.position.global.y },
                        };


                        // If this is a path that we've initiated then discard it
                        if
                        (
                            entity === The.player && // The player is me
                            entity.hasHadPath({ id: event.path.id, flag: event.path.flag }) && // Already added path
                            event.path.flag === 0 // And the path is a regular path (as opposed to one that could only
                                                  // be created by the server)
                        )
                        {
                            return; // Discard path
                        }

                        // If this is some progress on a path for an entity which we already have, then its possible
                        // that this path is redundant
                        if
                        (
                            entity.path && // Entity has a path
                            entity.path.id === event.path.id && event.path.flag === event.path.flag // And its the same path
                        )
                        {
                            const currentDestination = {
                                x: entity.position.global.x,
                                y: entity.position.global.y
                            };

                            entity.path.walks.forEach((walk) => {
                                const walkDist = walk.distance - walk.walked;

                                const isNorth = (walk.direction === NORTH || walk.direction === NORTHWEST || walk.direction === NORTHEAST),
                                    isSouth   = (walk.direction === SOUTH || walk.direction === SOUTHWEST || walk.direction === SOUTHEAST),
                                    isWest    = (walk.direction === WEST || walk.direction === NORTHWEST || walk.direction === SOUTHWEST),
                                    isEast    = (walk.direction === EAST || walk.direction === NORTHEAST || walk.direction === SOUTHEAST);


                                     if (isNorth) currentDestination.y -= walkDist;
                                else if (isSouth) currentDestination.y += walkDist;

                                     if (isWest)  currentDestination.x -= walkDist;
                                else if (isEast)  currentDestination.x += walkDist;
                            });

                            if (currentDestination.x === pathState.destination.global.x && currentDestination.y === pathState.destination.global.y) {
                                // This is the same path and its information is redundant. We can discard it
                                return; // Discard path
                            }
                        }


                        this.Log(`Entity ${event.id} Adding Path (${path.id}, ${path.flag})`, LOG_DEBUG);
                        this.Log(event.state, LOG_DEBUG);
                        this.Log(event.path, LOG_DEBUG);

                        // There's an issue with movables sending paths to go in one direction and then immediately
                        // changing their mind to go in another direction. Before we receive the next path we will have
                        // already processed some of the old path and would have to recalibrate to the beginning of the
                        // new path, putting us far out of sync. However, in some cases it could be completely
                        // unecessary to go to the beginning of the path
                        //
                        // Path 1
                        //
                        //                       The server sends us a path from @ to X, and we're currently
                        //                       on @ so we can immediately start down the path
                        //   @ ---------> X
                        //
                        //
                        //
                        // Path 2
                        //                       The server changed its mind part way through the path. By the
                        //       /--> X          time we receive the new path we're already further along the old
                        //       |               path and closer to the new destination than the start of the new
                        //    ***@**%            path
                        //
                        //
                        //
                        // The best solution seems to be creating an alternative path and using that one if its distance
                        // is less than the provided path. One problem however is if the new path happens to be
                        // intentionally longer and our alternate path takes us there faster than the server gets there.
                        // More importantly, however, is the problem of taking a separate path and then part way through
                        // the server's path the entity changes route to a place which will take us much longer to reach
                        //
                        //
                        // Path 1
                        //
                        //          X
                        //      ####^
                        //      #  #|            The server sends us a path from @ to X. Notice the walls #
                        //         #|
                        //         #|
                        //         #|
                        //      ####|
                        //  @-------/
                        //
                        //
                        // Path 2
                        //
                        //     X.....
                        //     ^####.
                        //     |#  #.            The server changed the path part way through. Now we have a new
                        //     |#  #.            destination, however its faster for us to take another direction to
                        //     |#  #.            catch up to the new position.
                        //     |   #.
                        //     |####%
                        //  ***@*****
                        //
                        //
                        // Path 3
                        //
                        //     ......
                        //     .####.            The server has changed route again; however at this point we're far
                        //     .# X#%            enough along our new path that it would take far too long to turn
                        //     .# ^#*            back. At this point we have to continue along the new path and take
                        //     .# |#*            much longer to catch up. What's worse is if we introduce dynamic tiles
                        //     *@-/#*            which close off before we have a chance to catch up (eg. door closing).
                        //     *####*            At this point we would be forced to teleport the entity to his
                        //                       position.
                        //
                        //
                        //
                        // Problems:
                        // ---------
                        //
                        //  TODO: Look into these problems and fix them (teleport and flagging path as irreplacable)
                        //
                        //  - Changing route more than once, and getting much further away from our destination (forced
                        //    to teleport)
                        //
                        //  - Missing critical tiles along the original path. Say some trigger that the entity
                        //    intentionally wanted to hit along a certain path. We could fix this by flagging the path
                        //    as irreplaceable, forcing us to take that path
                        //
                        //  - Getting to our destination faster than the server does (ie. intentionally longer route)
                        //
                        //
                        // Path out of view
                        // -----------------------
                        //
                        // The path could go along some tiles which are outside of our view.
                        //
                        //
                        //    +----------+----------+----------+
                        //    |     ##   |          |          |   The viewable area consists of the bottom-left 4 pages
                        //    |     ##   |          |          |   This restricts us to only being able to see part of
                        //    |     ##   |          |          |   the path, but potentially also the destination.
                        //    |     #####|###.......|.         |
                        //    |     #####|###. #####|.         |   Once the entity leaves our viewable area, he'll be
                        //    +----------+----------+----------+   removed from the area/page without problem. If we
                        //  [ |          |  #| #    |.         |   zone into a neighbour page before that happens then
                        //  [ |          |  #X #    |.         |   we'll continue to see him go along the same path.
                        //  [ |          |  ####    |.         |   Note that we are unable to provide an alternative
                        //  [ |          |     @----|.         |   path if at the time of a path being received the
                        //  [ |          |          |          |   destination was not reachable from our viewable area
                        //  [ +----------+----------+----------+
                        //  [ |          |          |          |   If we zone into the page after he's been removed,
                        //  [ |          |          |          |   he'll simply be added back as a new entity with the
                        //  [ |          |          |          |   corresponding path
                        //  [ |          |          |          |
                        //  [ |          |          |          |
                        //    +----------+----------+----------+
                        //
                        //     ^^^^^^^^^^^^^^^^^^^^^


                        // Adjust maxWalk so that we're only considering the recalibration delay
                        path.walks.forEach((walk) => { maxWalk += walk.distance; });

                        this.Log(`Entity [${entity.id}] adding Path: from (${movableState.position.tile.x}, ${movableState.position.tile.y})  ====>  (${pathState.position.tile.x}, ${pathState.position.tile.y})`, LOG_DEBUG);
                        this.Log(`                   (REAL) from (${movableState.position.global.x}, ${movableState.position.global.y})   ====>  (${pathState.position.global.x}, ${pathState.position.global.y})`, LOG_DEBUG);


                        // If we can't see the entity moving from his local state to the beginning of the path then we
                        // may as well teleport him there
                        if (canJumpTeleportEntityToPath(entity, pathState.position.tile)) {

                            The.area.teleportEntity(entity, pathState.position.global);
                            entity.addPath(path);
                            entity.recordNewPath(path, pathState);
                            return;
                        }

                        // Look for an alternative path, but also recalibrate the provided path. Given the two optional
                        // paths determine what the best option is
                        const playerX = entity.position.global.x,
                            playerY   = entity.position.global.y,
                            toX       = pathState.destination.global.x,
                            toY       = pathState.destination.global.y,
                            fromTiles = [new Tile(Math.floor(playerX / Env.tileSize), Math.floor(playerY / Env.tileSize))],
                            toTiles   = [new Tile(Math.floor(toX / Env.tileSize), Math.floor(toY / Env.tileSize))];

                        entity.cancelPath();
                        if (playerX === toX && playerY === toY) {
                            // Already there
                            // This could happen if the path happens to back track to an old position, and locally we
                            // still have the npc at that position
                            return;
                        }


                        The.area.pathfinding.workerHandlePath({
                            movableID: entity.id,
                            startPt: { x: playerX, y: playerY },
                            endPt: { x: toX, y: toY }
                        }).then((data) => {

                            if (data.path.ALREADY_THERE) {

                                // We're already there anyways
                                entity.path = null;
                                assert(false, "We checked for path when we're already there!");
                            } else {
                                // FIXME: Just use alternative path for now until we can come up with a fast/high
                                // priority recalibrate for provided server path, and then compare alternative path
                                // (which could take some time and we may walk down the existing path further before
                                // this)



                                let alternativePath = data.path;
                                //let alternativePath = new Path();
                                //data.path.walks.forEach((walk) => {
                                //    alternativePath.walks.push(walk);
                                //});
                                //alternativePath.start = { x: playerX, y: playerY };
                                alternativePath.id   = path.id;
                                alternativePath.flag = path.flag;

                                if (event.id === The.player.id) {
                                    // Do not send this path to the server (obviously, since we're receiving the path from
                                    // the server)
                                    alternativePath.walks.forEach((walk) => { walk.dontSendToServer = true; });
                                }



                                //delete entity.tilePath;
                                //entity.tilePath = alternativePath;
                                //entity.tilePath.destination = entity.tilePath.walks[entity.tilePath.walks.length - 1].destination;


                                // movable state may be stale by now
                                movableState.position.global.x = entity.position.global.x;
                                movableState.position.global.y = entity.position.global.y;
                                movableState.position.tile.x = entity.position.tile.x;
                                movableState.position.tile.y = entity.position.tile.y;

                                this.Log("Adding alternative path", LOG_DEBUG);
                                entity.addPath(alternativePath);
                                entity.recordNewPath(alternativePath, movableState);
                            }
                        }).catch((data) => {
                            // find end path and jump movable to there
                            //this.Log("COULD NOT MOVE ENTITY THROUGH PATH!! Teleporting entity directly to path start", LOG_WARNING);
                            //The.area.teleportEntity(entity, pathState.position.global);
                            //entity.addPath(path);
                            //entity.recordNewPath(path, pathState);
                        });
                    };


                    server.onEntityPathFinished = (page, event) => {

                        assert(!_.isNaN(event.id), `Expected valid entity id: ${event.id}`);

                        // Its possible that we're receiving an event from a page which we were previously in but
                        // locally not in anymore.
                        // eg. we've just zoned to another page, however the server is slightly behind and sees us in
                        // the previous page and sends us an event from a previously viewable page
                        if (!(page in The.area.pages)) {
                            this.Log(`server.onEntityPathFinished(${page}) from a page which is not loaded`, LOG_DEBUG);
                            return;
                        }

                        page = The.area.pages[page];

                        const entity   = The.area.movables[event.id],
                            reqState = event.state;

                        this.Log(`Entity ${event.id} onEntityPathProgress`, LOG_DEBUG);
                        if (!entity) {
                            this.Log("  Entity not found", LOG_DEBUG);
                            return;
                        }

                        const entPage  = entity.page;

                        const movableState = {
                                position: {
                                    global: {
                                        x: entity.position.global.x,
                                        y: entity.position.global.y },
                                    tile: {
                                        x: entity.position.tile.x,
                                        y: entity.position.tile.y }
                                }
                            },
                            pathState = {
                                position: {
                                    global: {
                                        x: reqState.position.global.x,
                                        y: reqState.position.global.y },
                                    tile: {
                                        x: reqState.position.tile.x,
                                        y: reqState.position.tile.y }
                                },

                                destination: {
                                    global: {},
                                    tile: {}
                                }
                            };

                        entity.debugging._serverPosition = {
                            tile: {
                                x: reqState.position.tile.x,
                                y: reqState.position.tile.y },
                            toTile: {
                                x: reqState.position.tile.x,
                                y: reqState.position.tile.y },
                            global: {
                                x: reqState.position.global.x,
                                y: reqState.position.global.y },
                            toGlobal: {
                                x: reqState.position.global.x,
                                y: reqState.position.global.y },
                        };
                    };

                    // We've just teleported somewhere
                    server.onTeleported = (pageId, tile) => {

                        // Will our teleport result in us zoning? If so then we should anticipate this by fading out
                        // until we've received our new zone pages
                        const localCoords = The.area.localFromGlobalCoordinates(tile.x, tile.y);
                        if (!localCoords.page || localCoords.page !== The.area.curPage) {
                            The.UI.fadeToBlack();
                            The.UI.pause();
                            The.renderer.pause();
                        }

                        const globalPos = {
                            x: tile.x * Env.tileSize,
                            y: tile.y * Env.tileSize
                        };
                        The.player.updatePosition(globalPos.x, globalPos.y);
                    };

                    // An entity that was either in our view, or is now in our view, has just teleported
                    server.onEntityTeleport = (pageId, data) => {

                        const entity = The.area.movables[data.entityId];

                        console.log("ENTITY HAS TELEPORTED");
                        console.log(entity.position.tile);

                        // If the entity is us, then ignore this message. We've already handled this from onTeleported
                        if (entity === The.player)
                        {
                            return;
                        }
                        
                        // TODO: When we ensure that we aren't receiving wasted teleports, we can simply get rid of
                        // oldPage and newPage (wasted bandwidth)
                        const oldPage = The.area.pages[data.oldPage],
                            newPage = The.area.pages[data.newPage],
                            tile = data.tile;
                        assert(oldPage || newPage, "Received teleport event for an entity between two pages that we don't have");

                        const globalPos = {
                            x: tile.x * Env.tileSize,
                            y: tile.y * Env.tileSize
                        };
                        entity.updatePosition(globalPos.x, globalPos.y);
                        entity.triggerEvent(EVT_MOVED_TO_NEW_TILE);

                        entity.triggerEvent(EVT_TELEPORT, newPage.index, { x: tile.x, y: tile.y });

                        The.area.checkEntityZoned(entity);
                    };

                    server.onEntityDied = (page, data) => {

                        const entity = data.entity,
                            advocate = data.advocate;

                        assert(!_.isNaN(entity.id), `Expected valid entity id: ${entity.id}`);

                        this.Log(`Entity ${entity.id} died`, LOG_DEBUG);

                        const deadEntity = The.area.movables[entity.id];

                        deadEntity.character.die(advocate);

                        FX.event('died', entity);

                        deadEntity.character = null;
                        deadEntity.sprite.idle();
                        The.renderer.addRagdoll(deadEntity);
                    };

                    // TODO: We should abstract this to UI
                    The.player.character.hook('die', this).after(function(){
                        ui.fadeToBlack();
                        ui.pause();
                        renderer.pause();
                    });

                    // Entity Damaged
                    // Entity took some damage
                    // NOTE: Health change is handled in netUpdate (health netvar), onEntityDamaged is used for handling
                    // effects/animations/messages/etc. to react to the damage (includes damage amount and damage
                    // source)
                    server.onEntityDamaged = (page, data) => {

                        const attackerEntity = data.attackerEntity,
                            damagedEntity    = data.damagedEntity,
                            amount           = data.amount;

                        assert(!attackerEntity || !_.isNaN(attackerEntity.id), `Expected valid entity id: ${attackerEntity ? attackerEntity.id : 0}`);
                        assert(!_.isNaN(damagedEntity.id), `Expected valid entity id: ${damagedEntity.id}`);

                        this.Log(`Entity ${damagedEntity.id} damaged by ${attackerEntity ? attackerEntity.id : "null source"}`, LOG_DEBUG);

                        const entity = The.area.movables[damagedEntity.id];
                        let attacker = null;

                        // This damage could come from a null source
                        if (attackerEntity) {

                            // NOTE: We could receive this event if the target or instigator are not in our line of sight.
                            attacker = The.area.movables[attackerEntity.id];
                            if (attacker) {
                                FX.event('attacked', attacker, { amount });

                                // NOTE: We've been attacked from a particular direction, but for now the best direction
                                // would be where we're currently facing
                                attacker.sprite.dirAnimate('atk');

                                // Is this a ranged attack? Spawn a projectile
                                // FIXME: Find a better way to fetch ranged flag and projectile id
                                if (attacker.npc.attackInfo.ability === "range") {
                                    const projectileSprite = 1960;
                                    The.renderer.addProjectile(attacker, entity, projectileSprite);
                                }
                            }
                        }


                        // TODO: We should abstract this to the UI
                        let styleType = MESSAGE_INFO;
                        if (attacker === The.player) {
                            styleType = MESSAGE_GOOD;
                        } else if (entity === The.player) {
                            styleType = MESSAGE_BAD;
                        }

                        const health = entity.health;

                        FX.event('damaged', entity, { amount, health });

                        if (attacker) {
                            ui.postMessage(`${attacker.npc.name} attacked ${entity.npc.name} for ${amount} damage (${entity.character.health} / ${entity.character.stats.health.curMax})`, styleType);
                        } else {
                            ui.postMessage(`${entity.npc.name} damaged for ${amount} by a null source (${entity.character.health} / ${entity.character.stats.health.curMax})`, styleType);
                        }
                    };

                    // Page Zoning
                    // This occurs when we enter another page
                    server.onZone = (page, pages, pageList) => {

                        // Zoning information (new pages)
                        this.Log(`I just zoned page (${page}): ${Object.keys(pages).toString()}`, LOG_DEBUG);

                        // unload previous pages which are NOT neighbours to this page
                        // NOTE: Our current page is not the same as the new page, so we need to pull from the provided
                        // pageList which defines all of the pages that we now are connected to
                        const existingPages = _(The.area.pages)
                            .keys()
                            .without(...Object.keys(pages))
                            .pull(The.area.curPage.index.toString())
                            .pull
                            (
                                ...pageList
                            )
                            .value();

                        this.Log(`   Picking out pages: ${existingPages.toString()}`, LOG_DEBUG);

                        // We *should* only receive pages which we don't already own
                        Object.keys(pages)
                            .filter((pageI) => pageI in The.area.pages)
                            .forEach((pageI) => {
                                this.Log(`Server gave us a page which we already have! What a waste of latency: ${pageI}`, LOG_WARNING);
                                delete pages[pageI];
                            });

                        _(The.area.pages)
                            .pick(existingPages)
                            .forIn((page, _pageI) => {
                                const pageI = parseInt(_pageI, 10);
                                The.area.removePage(page, pageI);
                            });

                        // Zoning into one of the new pages
                        The.area.addPages(pages, true);

                        // WARNING: This zone could be stale, since we zone across pages locally before receiving onZone
                        // from server. We could zone across a page, then backtrack to the previous page, then receive
                        // the (stale) onZone from the server
                        if (The.area.curPage.index !== page) {
                            The.area.zone(The.area.pages[page]);

                            // FIXME: Also need to zone entity across pages in some way. Is this the best way?
                            The.area.checkEntityZoned(The.player);
                        }

                        The.UI.updatePages();
                        The.renderer.updatePages();

                        The.UI.fadeIn();
                        The.UI.resume();
                        The.renderer.resume();
                    };

                    // Used when a new area is loaded. Scripts need to be reloaded and the player event listeners need to
                    // be rebuilt
                    const loadAreaIntoGame = (area, pages, player) => {

                        const oldArea = The.area;
                        oldArea.unload();

                        The.area = new Area();
                        The.area.loadArea(area);
                        The.area.addPages(pages);

                        The.area.curPage = The.area.pages[player.page];
                        ui.clear();
                        ui.updatePages();

                        The.player.page = The.area.curPage;
                        The.player.sprite.idle();
                        listenToPlayer();

                        The.player.position = {
                            tile: { x: player.position.tile.x, y: player.position.tile.y },
                            global: { x: player.position.global.x, y: player.position.global.y },
                        };

                        reloadScripts().then(callbacksReady);

                        callbackWhenReady(() => {
                            // TODO: had to put this in twice since listenToPlayer doesn't have character defined yet.
                            // Need to abstract this to UI!
                            The.player.character.hook('die', this).after(function(){
                                ui.fadeToBlack();
                                ui.pause();
                                renderer.pause();
                            });
                        });

                        callbackWhenReady(() => {
                            server.processQueuedEvents();
                            server.runBufferedMessages();
                        });

                        The.camera.updated = true;

                        renderer.setArea(The.area);
                        ui.updateAllMovables();
                        ui.showMovable( The.player );
                    };

                    server.onLoadedArea = (newArea, pages, player) => {
                        this.Log("Zoned to new area", LOG_DEBUG);
                        loadAreaIntoGame(newArea, pages, player);
                    };

                    server.onRespawn = (area, pages, player) => {

                        Log("Respawning..", LOG_DEBUG);
                        The.player._character = player._character;
                        The.player.physicalState.transition(STATE_ALIVE);

                        loadAreaIntoGame(area, pages, player);

                        // TODO: Abstract to UI
                        ui.fadeIn();
                        ui.resume();
                        renderer.resume();
                    };

                    // ---------------------------------------------------------------------------------------------- //
                    // ---------------------------------------------------------------------------------------------- //


                    // Start gameloop
                    gameLoop();

                    // TODO: Abstract to package/game script file
                    ui.postMessage("This game is under heavy development", MESSAGE_PROGRAM);
                    ui.postMessage("Updates are committed regularly to Github but uploaded only occasionally", MESSAGE_PROGRAM);
                    ui.postMessage("What's supported right now?", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ Zoning (pages/areas)", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ NPCs & AI", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ Combat", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ Items, Buffs", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ Interaction", MESSAGE_PROGRAM);
                    ui.postMessage("What's on the TODO list?", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ New Maps", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ More NPCs", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ Quests", MESSAGE_PROGRAM);
                    ui.postMessage("\t→ XP/Leveling", MESSAGE_PROGRAM);
                    ui.postMessage(" ", MESSAGE_PROGRAM);
                    ui.postMessage(" ", MESSAGE_PROGRAM);
                    ui.postMessage(" ", MESSAGE_PROGRAM);
                    ui.postMessage("Game has started.. Welcome to MyQuest!..", MESSAGE_PROGRAM);
                    ui.postMessage(`
                 __  __        ____                  _   
                |  \\/  |      / __ \\                | |  
                | \\  / |_   _| |  | |_   _  ___  ___| |_ 
                | |\\/| | | | | |  | | | | |/ _ \\/ __| __|
                | |  | | |_| | |__| | |_| |  __/\\__ \\ |_ 
                |_|  |_|\\__, |\\___\\_\\\\__,_|\\___||___/\__|
                         __/ |                           
                        |___/                            `, MESSAGE_PROGRAM);
                    ui.postMessage("\t\t A simple web based multiplayer RPG game", MESSAGE_PROGRAM);

                    this.onStarted();
                };


                // TODO: setup The.scripting interface
                The.scripting.player = The.player;
                The.scripting.UI = ui;
                The.scripting.user = The.user;
                The.scripting.server = {
                    request: server.makeRequest.bind(server),
                    registerHandler: server.registerHandler.bind(server),
                    handler: server.handler.bind(server)
                };
                The.scripting.Rules  = Resources.rules;
                The.scripting.Buffs  = Resources.buffs;
                The.scripting.Items  = Resources.items.list;
                The.scripting.Quests = Resources.quests;
                The.scripting.Interactions = Resources.interactions;
                The.scripting.TestingData  = Resources.testing;


                // -------------------------------------------------------------------------------------------------- //
                // -------------------------------------------------------------------------------------------------- //

                let lastMouseMoveRepath = 0;
                const onMouseMove = function(mouse, evt) {
                    //ui.tileHover = new Tile(mouse.x, mouse.y);
                    ui.tileHover = { x: mouse.canvasX, y: mouse.canvasY };

                    // New move to position
                    // NOTE: Provide some delay between repaths otherwise the user may "click" and start moving before
                    // onMouseUp comes in, so that we repath again after moving already, and end up somewhere else
                    let timeSinceRepath = now() - lastMouseMoveRepath;
                    if (evt && evt.buttons && (evt.buttons & 1) === 1 && The.player.character && The.player.character.canMove() && timeSinceRepath > 150) {
                        lastMouseMoveRepath = now();

                        const globalPos = {
                            x: parseInt(mouse.canvasX + The.camera.offsetX + The.area.curPage.x * Env.tileSize, 10),
                            y: parseInt(mouse.canvasY - The.camera.offsetY + The.area.curPage.y * Env.tileSize, 10)
                        };

                        const toTile = new Tile( parseInt(globalPos.x / Env.tileSize, 10), parseInt(globalPos.y / Env.tileSize, 10) );
                        The.user.clickedTile(toTile, globalPos, mouse);

                        ui.updateCursor();
                        return;
                    }

                    // Display the JumpPoints here (for testing purposes)
                    let _x     = (The.camera.offsetX / Env.tileSize) + The.area.curPage.x + ui.tileHover.x,
                        _y     = -(The.camera.offsetY / Env.tileSize) + The.area.curPage.y + ui.tileHover.y,
                        _xI    = Math.floor(_x / Env.pageWidth),
                        _yI    = Math.floor(_y / Env.pageHeight),
                        _pageI = _yI * The.area.pagesPerRow + _xI,
                        _page  = The.area.pages[_pageI],
                        _JP, _JPn, _JPw, _JPs, _JPe;
                    _JP = 4*(_y*The.area.areaWidth+_x);
                    _x = _x % Env.pageWidth;
                    _y = _y % Env.pageHeight;

                    if (Env.game.useJPS) {
                        if (The.area.jumpPoints) {
                            renderer.showJumpPoint = [The.area.jumpPoints[_JP], The.area.jumpPoints[_JP+1], The.area.jumpPoints[_JP+2], The.area.jumpPoints[_JP+3]];
                        } else {
                            renderer.showJumpPoint = ['N','W','S','E'];
                        }
                    }


                    // Hovering Entity?
                    ui.hoveringEntity = false;
                    for (const pageID in The.area.pages) {
                        const page = The.area.pages[pageID],
                            offY = (The.area.curPage.y - page.y) * Env.tileSize - The.camera.offsetY,
                            offX = (The.area.curPage.x - page.x) * Env.tileSize + The.camera.offsetX;
                        for (const movableID in page.movables) {
                            const movable = page.movables[movableID],
                                localX    = movable.position.global.x % Env.pageRealWidth,
                                localY    = movable.position.global.y % Env.pageRealHeight,
                                px        = localX - offX,
                                py        = localY - offY;

                            if (movable.npc.killable) {
                                if (movable.playerID) continue;
                                if (inRange(mouse.canvasX, px, px + movable.sprite.sprite_w / (2 * Env.tileScale)) &&
                                    inRange(mouse.canvasY, py - movable.sprite.sprite_h / Env.tileScale + Env.tileSize, py + Env.tileSize)) {

                                    // Hovering movable
                                    ui.hoveringEntity = movable;
                                    break;
                                }
                            }
                        }
                        if (ui.hoveringEntity) break;
                    }

                    // Hovering Item?
                    ui.hoveringItem = false;
                    for (const pageID in The.area.pages) {
                        const page = The.area.pages[pageID],
                            offY = (The.area.curPage.y - page.y) * Env.tileSize - The.camera.offsetY,
                            offX = (The.area.curPage.x - page.x) * Env.tileSize + The.camera.offsetX;
                        for (const itemCoord in page.items) {
                            const item = page.items[itemCoord],
                                localY = parseInt(itemCoord / Env.pageWidth, 10),
                                localX = itemCoord - localY * Env.pageWidth,
                                px     = localX * Env.tileSize - offX,
                                py     = localY * Env.tileSize - offY;

                            if (inRange(mouse.canvasX, px, px + Env.tileSize) &&
                                inRange(mouse.canvasY, py, py + Env.tileSize)) {

                                // Hovering item
                                ui.hoveringItem = item;
                                break;
                            }
                        }
                        if (ui.hoveringItem) break;
                    }

                    // Hovering Interactable?
                    ui.hoveringInteractable = false;
                    for (const pageID in The.area.pages) {
                        const page = The.area.pages[pageID],
                            offY = (The.area.curPage.y - page.y) * Env.tileSize - The.camera.offsetY,
                            offX = (The.area.curPage.x - page.x) * Env.tileSize + The.camera.offsetX,
                            localY = ui.tileHover.y + parseInt(offY / Env.tileSize, 10),
                            localX = ui.tileHover.x + parseInt(offX / Env.tileSize, 10);

                        // Hovering within page
                        if (inRange(localX, 0, Env.pageWidth) &&
                            inRange(localY, 0, Env.pageHeight)) {

                            const localCoord = localY * Env.pageWidth + localX;
                            if (page.interactables[localCoord]) {
                                ui.hoveringInteractable = page.interactables[localCoord];
                                break;
                            }
                        }
                    }

                    ui.updateCursor();
                };

                // Event Listeners
                // TODO: abstract event listeners to call "tryPath" or "hoverArea"
                ui.onMouseMove = onMouseMove;


                ui.onMouseDown = (mouse, buttonCode) => {

                    onMouseMove(mouse, { buttons: buttonCode });

                    if (buttonCode === 2) {
                        The.user.rightClicked(mouse);
                        return;
                    }

                    if (buttonCode === 4) { // Middle mouse
                        The.user.middleMouseDown(mouse);
                        return;
                    }

                    if (!The.player.character || !The.player.character.canMove()) {
                        return;
                    }

                    // Attack the enemy we're currently hovering
                    if (ui.hoveringEntity) {
                        if (buttonCode == 2) {
                            The.user.rightClickedEntity(ui.hoveringEntity, mouse);
                        } else {
                            The.user.clickedEntity(ui.hoveringEntity, mouse);
                        }
                        return;
                    }

                    // Pickup item we're currently hovering
                    if (ui.hoveringItem) {
                        The.user.clickedItem(ui.hoveringItem, mouse);
                        return;
                    }

                    // Pickup item we're currently hovering
                    if (ui.hoveringInteractable) {
                        The.user.clickedInteractable(ui.hoveringInteractable, null, mouse);
                        return;
                    }


                    // If there's a buttonCode then we've already moved in onMouseMove
                    if (!buttonCode) {
                        const globalPos = {
                            x: parseInt(mouse.canvasX + The.camera.offsetX + The.area.curPage.x * Env.tileSize, 10),
                            y: parseInt(mouse.canvasY - The.camera.offsetY + The.area.curPage.y * Env.tileSize, 10)
                        };

                        const toTile = new Tile( parseInt(globalPos.x / Env.tileSize, 10), parseInt(globalPos.y / Env.tileSize, 10) );
                        The.user.clickedTile(toTile, globalPos, mouse);
                    }
                };

                ui.onMouseUp = (mouse, buttonCode) => {

                    if (buttonCode === 4) {
                        The.user.middleMouseUp(mouse);
                        return;
                    }
                };

                The.user.hook('rightClickedEntity', The.user).after((entity, mouse) => {
                    ui.entityMenu.display(entity, mouse);
                });

                // ------------------------------------------------------------------------------------------------- //
                // ------------------------------------------------------------------------------------------------- //

                // Load testing tools
                // TODO: Need to find a better place to put this stuff

                Ext.extend(this, 'game');

                // Compile the list of JPs in a page and send to the server for checking and confirming a match
                const checkPageJPS = (page) => {

                    return new Promise((succeeded, failed) => {

                        const JPS = new Int16Array(4 * Env.pageWidth * Env.pageHeight);

                        const x = page.x;
                        for (let y = page.y; y < (page.y + Env.pageHeight); ++y) {
                            const row = The.area.jumpPoints.subarray
                            (
                                4 * (y * The.area.areaWidth + x),
                                4 * (y * The.area.areaWidth + x + Env.pageWidth)
                            );

                            JPS.set(row, 4 * (y - page.y) * Env.pageWidth);
                        }

                        server.makeRequest(TEST_CHECKJPS, { JPS: JPS }).then((data) => {

                            if (data.success !== true) {
                                failed(data);
                            } else {
                                succeeded();
                            }

                        }).catch(errorInGame);
                    });
                };

                const checkNewPages = (pages) => {

                    const pagesToCheck = Object.keys(pages);

                    const checkNextPage = () => {

                        if (pagesToCheck.length === 0) return;

                        const pageI = pagesToCheck.shift();
                        checkPageJPS(The.area.pages[pageI]).then(() => {
                            this.Log(`Page [${pageI}] Matches server`);
                            checkNextPage();
                        }, (data) => {
                            this.Log(`Page [${pageI}] Mismatch JPS`, LOG_ERROR);
                            this.Log(data, LOG_ERROR);
                            checkNextPage();
                        }).catch(errorInGame);
                    };

                    checkNextPage();
                };

                window.checkPageJPS   = checkPageJPS;
                window.checkNewPages  = checkNewPages;


                callbackWhenReady(startGame);
            };


            const reloadScripts = () => {

                ready = false;
                return new Promise((loaded, failed) => {

                    this.Log("Reloading scripts..");
                    The.scripting.area = The.area;

                    let unloadedSettings = {};
                    if (The.scriptmgr) {
                        unloadedSettings = The.scriptmgr.unload();
                    }

                    let loading = 1; // TODO: Don't do this..

                    Resources.loadComponents().then(() => {

                        Resources.loadScripts(Resources._scriptRes).then(() => {

                            The.scriptmgr = new ScriptMgr(unloadedSettings);

                            // Load items
                            if ('items-not-loaded' in Resources.items) {
                                delete Resources.items['items-not-loaded'];
                                Resources.loadItemScripts().then(() => {
                                    if (--loading === 0) loaded();
                                }, errorInGame)
                                .catch(errorInGame);
                            } else {
                                --loading;
                            }

                            if (loading === 0) {
                                loaded();
                            }
                        }, () => {
                            throw Err("Could not load scripts~");
                        })
                        .catch(errorInGame);
                    })
                    .catch(errorInGame);
                });
            };
        };

        return Game;
    });
