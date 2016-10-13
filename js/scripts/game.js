
// Game Script
define(
    [
        'SCRIPTINJECT', 'eventful', 'hookable', 'loggable', 'scripts/character'
    ],
    (
        SCRIPTINJECT, Eventful, Hookable, Loggable, Character
    ) => {

        /* SCRIPTINJECT */

        const Game = function() {

            extendClass(this).with(Hookable);
            extendClass(this).with(Loggable);
            this.setLogGroup('Game');
            this.setLogPrefix('Game');

            this.name         = "game";
            this.static       = true;
            this.keys         = [];
            this.components   = {};
            this._hookInto     = HOOK_INTO_MAP;

            let _game         = this,
                area          = null,
                _script       = null;

            this.characters   = {};
            this.players      = {};
            this.respawning   = {};
            this.delta        = 0;  // delta time since last update

            this.droppedItems = [];


            // Longstep (deltaSecond)
            //
            // same as delta, but this is used to update things which need updates every 1 second rather than every
            // step..
            // TODO: probably a better way to handle this than having 2 deltas..
            this.deltaSecond = 0;
            this.registerHook('longStep');
            this.longStep = () => {
                if (!this.doHook('longStep').pre()) return;

                this.decayItems();

                this.doHook('longStep').post();
            };

            // Active Tiles
            //
            // Tiles which scripts are listening to (eg. characters listening to certain tiles)
            // TODO: This is a terrible approach for handling watching/triggering tiles because of object lookup time.
            // Find a better approach
            this.activeTiles = {};
            this.hashTile = (x, y) => y * area.areaWidth + x;

            this.tile = (x, y) => {
                const hash = this.hashTile(x, y),
                    hookName = `tile-${hash}`,
                    listenToTile = (context, callback) => {
                        if (!this.activeTiles.hasOwnProperty(hash)) {
                            this.activeTiles[hash] = 0;
                            this.registerHook(hookName);
                        }

                        ++this.activeTiles[hash];
                        this.hook(hookName, context).after(callback);
                    },
                    stopListeningToTile = (context) => {
                        if (!this.activeTiles.hasOwnProperty(hash)) return;

                        // If 0 listeners then remove hook
                        this.hook(hookName, context).remove();
                        if (--this.activeTiles[hash] === 0) {
                            this.unregisterHook(hookName);
                            delete this.activeTiles[hash];
                        }
                    },
                    triggerTile = (args) => {
                        if (!this.activeTiles.hasOwnProperty(hash)) return;
                        if (!this.doHook(hookName).pre(args)) return;
                        this.doHook(hookName).post(args);
                    };

                return {
                    listen: listenToTile,
                    forget: stopListeningToTile,
                    trigger: triggerTile
                };
            };



            this.createCharacter = (entity) => {
                assert(!this.characters[entity.id], `Character already exists for entity (${entity.id})`);
                const character = _script.addScript(new Character(this, entity));
                _.last(_script.children).initialize(); // FIXME: this isn't the safest way to go..; NOTE: if game script is currently initializing, it will attempt to initialize all children afterwards; this child script will already have been initialized, and will not re-initialize the child
                return character;
            };

            this.addCharacter = (entity) => {
                const character = entity.character;

                assert(character instanceof Character, "Entity is not a character");

                if (this.characters.hasOwnProperty(entity.id)) return;
                if (!this.doHook('addedcharacter').pre(entity)) return;
                this.characters[entity.id] = character;

                if (!Env.isServer && entity.hasOwnProperty('_character')) {
                    character.health = entity._character.health;
                    delete entity._character;
                }

                character.hook('die', this).after(() => {
                    if (Env.isServer) {
                        if (!character.isPlayer) {
                            this.handleLoot(character);
                        }
                    }

                    // NOTE: removeEntity hooks 'removeentity' which is hooked here to removeCharacter & removePlayer
                    character.entity.page.area.removeEntity(character.entity);

                    if (Env.isServer) {
                        if (this.respawning.hasOwnProperty(character.entity.id)) throw Err(`Character (${character.entity.id}) already respawning`);
                        this.respawning[character.entity.id] = character;
                    }

                    character.hook('die', this).remove();
                });

                character.hook('moved', this).after(() => {
                    const pos = character.entity.position.tile;
                    this.tile(pos.x, pos.y).trigger(character);
                });

                this.doHook('addedcharacter').post(entity);
            };

            this.removeCharacter = (entity) => {
                const entityID = entity.id,
                    character  = entity.character;

                assert(character instanceof Character, "Entity is not a character");

                if (!(this.characters[entityID])) throw Err(`Character (${entityID}) not found`);
                if (!this.doHook('removedcharacter').pre(entity)) return;

                if (!Env.isServer && !this.respawning[entityID]) {
                    // Only unload the character if we're respawning; this is because in a respawning case, we're going
                    // to keep the same character and simply turn him back alive after respawning. Unloading only occurs
                    // on client side since there's no point to delete and recreate a character on server side
                    this.characters[entityID].unload();
                }

                delete this.characters[entityID];

                // TODO: UI Should subscribe to Character unload and be removed there
                if (!Env.isServer) {
                    if (character.entity.ui) {
                        character.entity.ui.remove();
                    }
                }

                character.hook('die', this).remove();
                character.hook('moved', this).remove();
                _script.removeScript(character._script);

                this.Log(`Removed character from Game: ${entityID}`);
                this.doHook('removedcharacter').post(entity);
            };

            this.addPlayer = (entity) => {

                assert(entity.character instanceof Character, "Entity is not a character");
                assert(entity.playerID, "Entity does not have a playerID");

                const playerID = entity.playerID;
                if (this.players[playerID]) throw Err(`Player (${playerID}) already added`);

                if (!this.doHook('addedplayer').pre(entity)) return;

                this.players[playerID] = entity;
                entity.character.setAsPlayer();

                this.Log(`Added player to Game: ${playerID}`);
                this.doHook('addedplayer').post(entity);
            };

            this.removePlayer = (entity) => {

                assert(entity.character instanceof Character, "Entity is not a character");
                assert(entity.playerID, "Entity does not have a playerID");

                const playerID = entity.playerID;
                if (!this.players[playerID]) throw Err(`Player (${playerID}) doesn't exist`);

                if (!this.doHook('removedplayer').pre(entity)) return;

                delete this.players[playerID];
                this.Log(`Removed player from Game: ${playerID}`);
                this.doHook('removedplayer').post(entity);
            };

            this.detectEntities = () => {
                this.registerHook('addedcharacter');
                this.registerHook('removedcharacter');

                this.registerHook('addedplayer');
                this.registerHook('removedplayer');

                area.hook('addedentity', this).after((entity) => {

                    // Create a new character object for this entity if one hasn't been created yet
                    if (!(entity.character instanceof Character)) {
                        this.createCharacter(entity);
                    } else {
                        // NOTE: entity could be a user, and may be zoning between areas. The character script has
                        // already been created, but now its context needs to be switched from 1 area to the other
                        _script.addScript(entity.character._script);

                        // FIXME: is there a point to re-initializing the script? On the server this caused duplication
                        // issues
                        if (!Env.isServer) {
                            _.last(_script.children).initialize(); // FIXME: this isn't the safest way to go..; NOTE: if game script is currently initializing, it will attempt to initialize all children afterwards; this child script will already have been initialized, and will not re-initialize the child
                        }
                    }

                    this.addCharacter(entity);
                    if (entity.playerID) {
                        this.addPlayer(entity);
                    }

                });

                area.hook('removedentity', this).after((entity) => {

                    // NOTE: If this player is us its okay
                    if (entity.playerID) {
                        this.removePlayer(entity);
                    }

                    this.removeCharacter(entity);
                });
            };

            this.server = {

                initialize() {
                    extendClass(_game).with(Eventful);

                    _script = this;
                    area = this.hookInto;
                    _game.detectEntities();

                    area.game = _game; // For debugging purposes..
                    _game.initGame();
                },

                initGame() {


                    // When an entity is initially created, they don't have a Character attached to them.  Currently
                    // there's no better place to hook onto an entity being created initially, perhaps this could be
                    // fixed with a Factory pattern for entities in the area? So instead when the page adds a new entity
                    // it checks if the entity has a character property, otherwise hooks the addcharacterlessentity hook
                    // which propagates into the area and into here where we can create and attach a character. Note
                    // that we're still listening to entities being added/moved across pages, so we do NOT add
                    // character/player to our character list here.
                    area.hook('addcharacterlessentity', this).before((entity) => {
                        _game.createCharacter(entity);
                    });

                    // The game (this) is a script run under the script manager, while the page/area is initialized
                    // immediately at startup. Since we need a character object associated with each entity,
                    // including initial spawns, we have to delay the area spawning until the scriptmgr is finished
                    // initializing the game.
                    area.initialSpawn();

                    /*
                    // TODO: add all current characters in area
                    _.each(area.movables, function(entity, entityID){
                    _game.createCharacter.call(_game, entity);
                    _game.addCharacter(entity);
                    if (entity.playerID) {
                    _game.addPlayer(entity);
                    }
                    });
                    */

                    area.registerHandler('step');
                    area.handler('step').set((delta) => {
                        this.delta += delta;
                        this.deltaSecond += delta;

                        while (this.delta >= 100) {
                            this.delta -= 100;
                            this.handlePendingEvents();

                            for (const entid in this.respawning) {
                                const character = this.respawning[entid];
                                assert(character instanceof Character, `Respawning character (${entid}) not a character`);

                                character.respawnTime -= 100; // FIXME: shouldn't hardcode this, but can't use delta
                                if (character.respawnTime <= 0) {
                                    delete this.respawning[entid];

                                    character.respawning();

                                    const areaID = character.respawnPoint.area,
                                        pageID   = character.respawnPoint.page;

                                    assert(world.areas[areaID],`No area (${areaID})`);
                                    const respawnArea = world.areas[areaID];

                                    assert(respawnArea.pages[pageID], `No page (${pageID}) in area (${areaID})`);
                                    const page = respawnArea.pages[pageID];

                                    // NOTE: Have to set the page and respawn before adding entity to page; otherwise
                                    // the event is triggered and broadcasted before the entity's position is set
                                    character.entity.page = page;
                                    character.respawned();

                                    respawnArea.watchEntity(character.entity);
                                    page.addEntity(character.entity);

                                    if (character.isPlayer) {
                                        character.entity.player.respawn();
                                    }
                                }
                            }
                        }

                        while (this.deltaSecond >= 1000) {
                            this.deltaSecond -= 1000;
                            this.longStep();
                        }

                    });
                },

                unload: () => {
                    this.unloadListener();
                    area.handler('step').unset();
                    area.unhook(this);
                },

                handleLoot: (character) => {
                    if (Math.random() > 0.0) { // FIXME: handle this based off of loot details from NPC
                        assert(character instanceof Character, `character not a Character`);

                        const page   = character.entity.page,
                            position = character.entity.position.tile,
                            itm_id   = "itm_potion"; // FIXME: Hardcoded loot

                        page.broadcast(EVT_DROP_ITEM, {
                            position: { x: position.x, y: position.y },
                            item: itm_id,
                            page: page.index
                        });

                        const item = {
                            id: itm_id,
                            sprite: Resources.items.list[itm_id].sprite,
                            coord: { x: position.x, y: position.y },
                            page: page.index
                        };

                        const decay = {
                            coord: { x: position.x, y: position.y },
                            page: page.index,
                            decay: now() + 20000 // FIXME: put this somewhere.. NOTE: have to keep all decay rates the same, or otherwise change decayItems structure
                        };

                        page.items[(position.y - page.y) * Env.pageWidth + (position.x - page.x)] = item;
                        this.droppedItems.push(decay);
                    }
                },

                decayItems: () => {

                    let index = 0;
                    for (; index < this.droppedItems.length; ++index) {
                        const item = this.droppedItems[index];
                        if (item.decay < now()) {
                            const page = area.pages[item.page],
                                coord  = (item.coord.y - page.y) * Env.pageWidth + (item.coord.x - page.x);

                            // TODO: Find a better event than this to decay the item
                            page.broadcast(EVT_GET_ITEM, {
                                coord,
                                page: item.page
                            });

                            delete page.items[coord];
                        } else {
                            break;
                        }
                    }

                    if (index) {
                        this.droppedItems.splice(0, index);
                    }
                },

                removeItem: (page, coord) => {
                    // Already removed this item from area/page, just need to remove from droppedItems list

                    for (let index = 0; index < this.droppedItems.length; ++index) {
                        if (this.droppedItems[index].coord === coord &&
                            this.droppedItems[index].page === page) {

                            this.droppedItems.splice(index, 1);
                            break;
                        }
                    }
                }
            };

            this.client = {

                initialize() {

                    _script = this;
                    area = this.hookInto;
                    _game.detectEntities();

                    // We need to re-create the character for the player; so copy over certain attributes here which
                    // will be loaded into the new character
                    if (The.player.character && !The.player._character) {
                        The.player._character = {
                            health: The.player.character.health
                        };
                    }
                    _game.addUser();

                    // Add all current characters in area
                    _.each(area.movables, function(entity, entityID) {
                        if (entityID == The.player.id) return; // NOTE: comparing str key to int
                        _game.createCharacter(entity);
                        _game.addCharacter(entity);
                        if (entity.playerID) {
                            _game.addPlayer(entity);
                        }
                    });

                    _game.handleMoving();
                    _game.handleItems();
                    _game.handleInteractables();
                },

                addUser: () => {
                    const entity = The.player;

                    assert(entity instanceof Movable, "Player not a movable");
                    this.createCharacter(entity);
                    this.addCharacter(entity);
                    this.addPlayer(entity);
                    this.characters[entity.id].setToUser();
                },

                handleMoving: () => {

                    user.hook('clickedTile', this).after((toTile) => {

                        if (!(The.area.hasTile(toTile) && The.area.isTileOpen(toTile))) return;

                        //  click to move player creates path for player
                        const playerX    = The.player.position.global.x,
                            playerY      = The.player.position.global.y,
                            nearestTiles = The.area.findNearestTiles(playerX, playerY);

                        let path = The.area.findPath(nearestTiles, [toTile]);

                        if (path && path.path) {

                            // inject walk to beginning of path depending on where player is relative to start tile
                            const startTile    = path.start.tile,
                                playerPosition = {
                                    global: {
                                        x: The.player.position.global.x,
                                        y: The.player.position.global.y
                                    }
                                };

                            let recalibrateX   = false,
                                recalibrateY   = false;

                            path = path.path;

                            if (playerPosition.global.y - startTile.y * Env.tileSize !== 0) recalibrateY = true;
                            if (playerPosition.global.x - startTile.x * Env.tileSize !== 0) recalibrateX = true;

                            path.splitWalks();

                            if (recalibrateY) {
                                // Inject walk to this tile
                                const distance = -1 * (playerPosition.global.y - startTile.y * Env.tileSize),
                                    walk       = new Walk((distance < 0 ? NORTH : SOUTH), Math.abs(distance), startTile.offset(0, 0));
                                this.Log(`Recalibrating Walk (Y): steps (${distance})`, LOG_DEBUG);
                                path.walks.unshift(walk);
                            }

                            if (recalibrateX) {
                                // Inject walk to this tile
                                const distance = -1 * (playerPosition.global.x - startTile.x * Env.tileSize),
                                    walk       = new Walk((distance < 0 ? WEST : EAST), Math.abs(distance), startTile.offset(0, 0));
                                this.Log(`Recalibrating Walk (X): steps (${distance})`, LOG_DEBUG);
                                // this.Log("   steps: "+distance+" FROM ("+The.player.position.global.x+") TO ("+startTile.x*Env.tileSize+")", LOG_DEBUG);
                                path.walks.unshift(walk);
                            }

                            path.walks[0].time = now();

                            for (let i = 0; i < path.walks.length; ++i) {
                                const walk = path.walks[i];
                                this.Log(`Walk: (${walk.direction}, ${walk.distance}, ${walk.steps})`, LOG_DEBUG);
                            }

                            if (path.walks.length) {
                                The.player.addPath(path, true);
                                The.player.recordNewPath(path);
                            }

                            The.UI.tilePathHighlight = toTile;
                            The.UI.tilePathHighlight.step = 0; // FIXME: UI.setTilePathHighlight(...) to copy the tile, and also set the 'step' property for fading in/out

                        } else if (path) {
                            // Already there
                        } else {
                            this.Log("Bad path :(", LOG_ERROR);
                        }
                    });
                },

                handleItems: () => {

                    user.hook('clickedItem', this).after((item) => {
                        const page     = area.pages[item.page],
                            x          = item.coord.x,
                            y          = item.coord.y,
                            tile       = new Tile(x, y),
                            path       = area.pathfinding.findPath(The.player, tile),
                            pickupItem = () => {
                                server.request(EVT_GET_ITEM, {
                                    coord: (item.coord.y - page.y) * Env.pageWidth + (item.coord.x - page.x),
                                    page: item.page
                                })
                                .then(() => {
                                    // Got item
                                    this.Log("Got item!");
                                }, () => {
                                    // Couldn't get item
                                    this.Log("Couldn't get item", LOG_ERROR);
                                })
                                .catch(errorInGame);
                            };

                        if (path === false) {
                            throw Err("Could not find path to item");
                        } else if (path === ALREADY_THERE) {
                            pickupItem();
                        } else {
                            The.player.addPath(path).finished(pickupItem, () => {
                                this.Log("Awww I couldn't get the item :(");
                            });
                            The.player.recordNewPath(path);
                        }
                    });

                    server.registerHandler(EVT_GET_ITEM);
                    server.handler(EVT_GET_ITEM).set((evt, data) => {
                        const page = The.area.pages[data.page];

                        assert(page.items[data.coord], "Item does not exist in page");
                        delete page.items[data.coord];
                    });

                    server.registerHandler(EVT_USE_ITEM);
                    server.handler(EVT_USE_ITEM).set((evt, data) => {
                        const base    = Resources.items.base[data.base],
                            character = The.area.movables[data.character].character;

                        base.invoke(data.name, character, data);
                    });

                    server.registerHandler(EVT_DROP_ITEM);
                    server.handler(EVT_DROP_ITEM).set((evt, data) => {

                        const position = data.position,
                            page       = The.area.pages[data.page],
                            item       = {
                                id: data.item,
                                sprite: Resources.items.list[data.item].sprite,
                                coord: position,
                                page: page.index
                            };

                        page.items[(position.y - page.y) * Env.pageWidth + (position.x - page.x)] = item;
                    });
                },

                handleInteractables: () => {

                    user.hook('clickedInteractable', this).after((interactableID) => {

                        assert(area.interactables[interactableID], `Interactable (${interactableID}) not found!`);

                        const interactable = area.interactables[interactableID],
                            path           = area.pathfinding.findPath(The.player, interactable.positions, { range: 1, adjacent: false });

                        if (!path) {
                            this.Log("No path found to interactable");
                            return;
                        }

                        let destination = null;
                        if (path === ALREADY_THERE) {
                            destination = The.player.position.tile;
                        } else {
                            destination = _.last(path.walks).destination; // The tile which we are going to walk to
                            if (!destination) return; // No destination provided from walk/path
                        }

                        // NOTE: we need to tell the server which tile in particular we've clicked. Since we're only
                        // walking up to the interactable (and not ontop of it), our destination tile is a neighbour
                        // tile. The server needs to know exactly which tile we're walking up to, so find that tile here
                        let nearestTile = null,
                            coord       = null;
                        for (let i = 0; i < interactable.positions.length; ++i) {
                            const tile  = interactable.positions[i],
                                page    = area.pages[tile.page],
                                globalX = tile.x + page.x,
                                globalY = tile.y + page.y;

                            if (inRange(destination.x, globalX - 1, globalX + 1) &&
                                inRange(destination.y, globalY - 1, globalY + 1)) {

                                nearestTile = tile;
                                coord = (globalY - page.y) * Env.pageWidth + (globalX - page.x); // local coordinate
                                break;
                            }
                        }

                        if (nearestTile === null) {
                            throw Err("Could not find tile of interactable");
                        }

                        const readyToInteract = () => {

                            const interactableDetails  = Resources.interactables.list[interactableID];
                            if (!interactableDetails || !interactableDetails.base) throw Err(`No type script found for interactable (${interactableID})`);

                            const args               = interactableDetails.args || {},
                                interactableScriptID = interactableDetails.base,
                                interactableRes      = Resources.interactables.base[interactableScriptID];
                            if (!interactableRes) throw Err(`No base script found for interactable script (${interactableScriptID})`);

                            if (interactableRes.handledBy === CLIENT_ONLY) {

                                const data = _.extend({
                                    base: interactableScriptID,
                                    character: The.player.id,
                                    name: interactableID
                                }, args);
                                interact(null, data);

                            } else {
                                server.request(EVT_INTERACT, {
                                    interactable: interactableID,
                                    tile: { x: nearestTile.x, y: nearestTile.y },
                                    coord,
                                    page: nearestTile.page
                                })
                                .then(() => {
                                    this.Log("Clicked the interactable!", LOG_DEBUG);
                                }, () => {
                                    this.Log("Couldn't click the interactable", LOG_DEBUG);
                                })
                                .catch(errorInGame);
                            }
                        };

                        if (path === ALREADY_THERE) {
                            readyToInteract(); // Already there
                        } else {
                            The.player.addPath(path).finished(readyToInteract, () => {
                                this.Log("Awww I couldn't interact with the interactable thingy :(");
                            });
                            The.player.recordNewPath(path);
                        }
                    });

                    const interact = (evt, data) => {

                        const base    = Resources.interactables.base[data.base],
                            character = The.area.movables[data.character].character;

                        base.invoke(data.name, character, data);
                    };

                    server.registerHandler(EVT_INTERACT);
                    server.handler(EVT_INTERACT).set(interact);

                },

                unload: () => {
                    area.unhook(this);
                    user.unhook(this);
                }
            };
        };

        return Game;
    });
