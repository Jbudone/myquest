
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
                _.last(_script.children).initialize({}); // FIXME: this isn't the safest way to go..; NOTE: if game script is currently initializing, it will attempt to initialize all children afterwards; this child script will already have been initialized, and will not re-initialize the child
                return character;
            };

            this.addCharacter = (entity) => {
                const character = entity.character;

                assert(character instanceof Character, "Entity is not a character");

                if (this.characters.hasOwnProperty(entity.id)) return;
                if (!this.doHook('addedcharacter').pre(entity)) return;
                this.characters[entity.id] = character;

                character.hook('die', this).after((details) => {
                    if (Env.isServer) {
                        if (!character.isPlayer) {
                            this.handleLoot(character);

                            // FIXME: Should find a cleaner way to do this; perhaps a Group system (would need to allow
                            // 1 man groups) which hooks 'onKilled' and runs loot, experience, etc.

                            // NOTE: There may be no advocate, in cases where we suicide, or the killer has
                            // zoned out or died, etc.
                            if (details.advocate) {
                                const killer = details.advocate;
                                assert(killer instanceof Character, "The listed advocate is not a Character type");

                                // Give player XP
                                if (killer.isPlayer) {
                                    const XP = character.entity.npc.XP;
                                    assert(_.isNumber(XP), "A character was killed by somebody, yet he has no XP");

                                    // XP gained from an enemy is equal to its base XP if you have the same level as the
                                    // enemy. That amount is scaled accordingly if your level is higher or lower than the
                                    // enemy, and capped at a min (0) and max multiplier
                                    //
                                    // ReceivedXP = BaseXP * (2.0 * (8.0 + [yourLevel - myLevel]{-8,8}) / 16)
                                    // TODO: It may be worth modifying the scaler (8.0) based off of your level
                                    const yourLevel  = character.entity.npc.level,
                                        myLevel      = killer.charComponent('levelling').level,
                                        xpScaler     = 6.0,
                                        xpMultiplier = (Math.min(xpScaler, Math.max(-xpScaler, yourLevel - myLevel)) + xpScaler) / xpScaler,
                                        gainedXP     = Math.floor(xpMultiplier * XP);

                                    // FIXME: Store GainedXP symbol somewhere
                                    killer.doHook('GainedXP').post({
                                        XP: gainedXP
                                    });
                                }
                            }
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

                if (!Env.isServer && entityID === The.player.id) {
                    // If we're zoning out then we need to serialize and store our _character details somewhere
                    // This isn't strictly necessary since we could just netSerialize the character anytime we zone,
                    // however at this point that doesn't seem necessary, and we could save a little bandwidth by only
                    // local serializing
                    // FIXME: It sucks to serialize into The, find a better solution
                    The._character = this.characters[entityID].serialize();
                }

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

                // FIXME: Not sure why we're setting player here, this is character specific stuff. This happens
                // everytime we add the character to an area (eg. zoning, respawning). This makes sense on client, but
                // not on server since we retain the character between maps/respawning (should confirm this)
                if (!entity.character.initialized) {
                    entity.character.setAsPlayer();
                } else {
                    entity.character.initialized = true;
                }

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

                                    character.finishedRespawn();
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

                    assert(character instanceof Character, `character not a Character`);

                    // Loot is structured as follows:
                    //  Groups: [lootGroup1, lootGroup2, ..]
                    //  Group: { chance: 0.2, items: [item1, item2, ..] }
                    //
                    // Each loot group describes a list of items and their probability for dropping. The reason for a
                    // loot group is to avoid situations where two items should not drop together (eg. potion_smallHeal,
                    // potion_bigHeal; or  knife_rusted, knife_enchanted)
                    //
                    //
                    //  Item: { chance: 0.3, item: "itm_potion" }
                    //
                    // Each item has a probability for its drop chance and an item id


                    // Some npcs may not even have a loot list
                    const loot = character.entity.npc.loot;
                    if (!loot || !_.isArray(loot)) {
                        return;
                    }

                    // Find a loot group
                    let lootGroup   = null,
                        itemsToDrop = [],
                        diceRoll    = Math.random(),
                        accumulator = 0.0;
                    for (let i = 0; i < loot.length; ++i) {
                        if
                        (
                            diceRoll < (loot[i].chance + accumulator) &&
                            diceRoll > accumulator
                        )
                        {
                            lootGroup = loot[i];
                            break;
                        }
                    }

                    // Did we find a loot group?
                    // NOTE: Its possible to not get any loot group
                    if (lootGroup) {

                        // Find items that we should drop from this loot group
                        // NOTE: We can drop any or none of the items in this group (including all of them). Each item
                        // chance is completely independent of the rest
                        const itemList = lootGroup.items;
                        diceRoll = Math.random();
                        for (let i = 0; i < itemList.length; ++i) {
                            if (diceRoll <= itemList[i].chance) {
                                itemsToDrop.push(itemList[i].item);
                            }
                        }
                    }

                    this.Log(`Found items to drop: ${itemsToDrop}`, LOG_DEBUG);

                    // TODO: Would be nice to upgrade dropItem to dropItems
                    const entPosition = character.entity.position.tile;
                    let itemDropped = null;
                    for (let i = 0; i < itemsToDrop.length; ++i) {
                        itemDropped = this.dropItem(entPosition, itemsToDrop[i]);
                        if (!itemDropped) break;
                    }
                },

                dropItem: (sourceTile, itm_id) => {

                    const localCoord = area.localFromGlobalCoordinates(sourceTile.x, sourceTile.y),
                        sourcePage   = localCoord.page;

                    const filterItemDrops = (tile) => {
                        const localCoords = area.localFromGlobalCoordinates(tile.x, tile.y),
                            localHash     = localCoords.y * Env.pageWidth + localCoords.x;
                        return (localCoords.page && !localCoords.page.items[localHash]);
                    };

                    const freeTiles = area.findOpenTilesAbout(sourceTile, 1, filterItemDrops);
                    if (freeTiles.length !== 0) {

                        const position = freeTiles[0],
                            localPos   = area.localFromGlobalCoordinates(position.x, position.y),
                            page       = localPos.page;

                        page.broadcast(EVT_DROP_ITEM, {
                            position: { x: position.x, y: position.y },
                            item: itm_id,
                            page: page.index
                        });

                        const item = {
                            id: itm_id,
                            sprite: Resources.items.list[itm_id].sprite + 1,
                            coord: { x: position.x, y: position.y },
                            page: page.index
                        };

                        const localCoord = localPos.y * Env.pageWidth + localPos.x;

                        this.Log(`Dropping item ${itm_id} at (${position.x}, ${position.y}) ${localCoord}`, LOG_DEBUG);

                        const decay = {
                            coord: localCoord,
                            page: page.index,
                            decay: now() + 100000 // FIXME: put this somewhere.. NOTE: have to keep all decay rates the same, or otherwise change decayItems structure
                        };

                        page.items[localCoord] = item;
                        this.droppedItems.push(decay);
                        return true;
                    }

                    return false;
                },

                decayItems: () => {

                    let index = 0;
                    for (; index < this.droppedItems.length; ++index) {
                        const item = this.droppedItems[index];
                        if (item.decay < now()) {
                            const page = area.pages[item.page];

                            // TODO: Find a better event than this to decay the item
                            page.broadcast(EVT_GET_ITEM, {
                                coord: item.coord,
                                page: item.page
                            });

                            this.Log(`Decaying item from page ${item.page}, coord ${item.coord}`, LOG_DEBUG);
                            delete page.items[item.coord];
                        } else {
                            break;
                        }
                    }

                    if (index) {
                        this.Log(`Decaying ${index} / ${this.droppedItems.length} items`, LOG_DEBUG);
                        this.droppedItems.splice(0, index);
                        this.Log(`${this.droppedItems.length} items left`, LOG_DEBUG);
                    }
                },

                removeItem: (page, coord) => {
                    // Already removed this item from area/page, just need to remove from droppedItems list

                    for (let index = 0; index < this.droppedItems.length; ++index) {
                        if (this.droppedItems[index].coord === coord &&
                            this.droppedItems[index].page === page) {

                            this.Log(`Removing item ${coord} from ${page}`, LOG_DEBUG);
                            this.droppedItems.splice(index, 1);
                            return;
                        }
                    }

                    this.Log(`Items: ${Object.keys(this.droppedItems)}`, LOG_ERROR);
                    assert(false, `Couldn't find item to remove (${page}, ${coord})`);
                }
            };

            this.client = {

                initialize() {

                    _script = this;
                    area = this.hookInto;
                    _game.detectEntities();
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

                    // TODO: Its sort of weird to call UI queue full update here. We should probably have the UI
                    // listening to the script having finished loading insted. This is necessary since we won't have
                    // characters ready yet until this point, so we don't have access to health or anything yet
                    UI.queueFullUpdate();
                },

                addUser: () => {
                    const entity = The.player;

                    assert(entity instanceof Movable, "Player not a movable");
                    The.user.doHook('initializedUser').pre();
                    this.createCharacter(entity);
                    this.addCharacter(entity);
                    this.addPlayer(entity);
                    this.characters[entity.id].setToUser();
                    The.user.doHook('initializedUser').post();
                },

                handleMoving: () => {

                    user.hook('clickedTile', this).after((toTile, toGlobal, mouse) => {

                        if (!(The.area.hasTile(toTile) && The.area.isTileOpen(toTile))) return;

                        //  click to move player creates path for player
                        const playerX    = The.player.position.global.x,
                            playerY      = The.player.position.global.y,
                            nearestTiles = The.area.findNearestTiles(playerX, playerY); // FIXME: Nuke this once we swap to ptPath





                        {
                            const fromTiles = nearestTiles,
                                toTiles = [toTile];

                            The.area.pathfinding.workerHandlePath({
                                movableID: The.player.id,
                                startPt: { x: playerX, y: playerY },
                                endPt: { x: toGlobal.x, y: toGlobal.y },
                                immediate: true
                            }).then((data) => {

                                // FIXME: Need to recalibrate from curPos -> nearest point along path?
                                if (data.path.ALREADY_THERE) {

                                    console.log("No path to be created..we're already there!");
                                    return;
                                }

                                const path  = data.path,
                                    movable = data.movable;
                                movable.addPath(path);
                                movable.recordNewPath(path);

                            }).catch((data) => {
                                console.error("Could not find path!");
                            });

                            return;
                        }
                    });
                },

                handleItems: () => {

                    user.hook('clickedItem', this).after((item) => {
                        const page     = area.pages[item.page],
                            x          = item.coord.x,
                            y          = item.coord.y,
                            tile       = new Tile(x, y),
                            pickupItem = () => {
                                server.request(EVT_GET_ITEM, {
                                    coord: (item.coord.y - page.y) * Env.pageWidth + (item.coord.x - page.x),
                                    page: item.page
                                })
                                .then((result) => {
                                    // Got item
                                    this.Log("Got item!");

                                    // Have we picked up the item?
                                    const itmRef = Resources.items.list[item.id];
                                    if (itmRef.type & ITM_PICKUP) {
                                        // Add item to our inventory
                                        The.player.character.inventory.addItem(itmRef, result.slot);
                                    }
                                }, (e) => {
                                    // Couldn't get item
                                    this.Log(`Couldn't get item: ${e.msg}`, LOG_ERROR);
                                })
                                .catch(errorInGame);
                            };

                        const playerX = The.player.position.global.x,
                            playerY   = The.player.position.global.y,
                            toX       = x,
                            toY       = y,
                            fromTiles = [new Tile(Math.floor(playerX / Env.tileSize), Math.floor(playerY / Env.tileSize))],
                            toTiles   = [new Tile(Math.floor(toX / Env.tileSize), Math.floor(toY / Env.tileSize))];


                        The.player.cancelPath();
                        The.area.pathfinding.workerHandlePath({
                            movableID: The.player.id,
                            startPt: { x: playerX, y: playerY },
                            endPt: { x: toGlobal.x, y: toGlobal.y }
                        }).then((data) => {

                            if (data.path.ALREADY_THERE) {

                                pickupItem();
                                return;
                            }

                            const path = data.path;
                            The.player.addPath(path).finished(pickupItem, () => {
                                this.Log("Awww I couldn't get the item :(");
                            });
                            The.player.recordNewPath(path);

                        }).catch((data) => {
                            throw Err("Could not find path to item");
                        });
                    });

                    server.registerHandler(EVT_GET_ITEM);
                    server.handler(EVT_GET_ITEM).set((evt, data) => {
                        const page = The.area.pages[data.page];
                        this.Log(`Decaying item from page ${data.page}, coord ${data.coord}`, LOG_DEBUG);

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
                                sprite: Resources.items.list[data.item].sprite + 1,
                                coord: position,
                                page: page.index
                            };

                        page.items[(position.y - page.y) * Env.pageWidth + (position.x - page.x)] = item;
                    });
                },

                handleInteractables: () => {

                    user.hook('clickedInteractable', this).after((interactableID, key) => {

                        assert(area.interactables[interactableID], `Interactable (${interactableID}) not found!`);

                        const interactable  = area.interactables[interactableID],
                            //path            = area.pathfinding.findPath(The.player, interactable.positions, { range: 1, adjacent: false }),
                            interactableRes = Resources.interactables.list[interactableID];


                        const playerX = The.player.position.global.x,
                            playerY   = The.player.position.global.y,
                            toX       = interactable.positions[0].x * Env.tileSize, // TILE
                            toY       = interactable.positions[0].y * Env.tilesize,
                            fromTiles = [new Tile(Math.floor(playerX / Env.tileSize), Math.floor(playerY / Env.tileSize))],
                            toTiles   = [new Tile(Math.floor(toX / Env.tileSize), Math.floor(toY / Env.tileSize))];


                        The.player.cancelPath();
                        The.area.pathfinding.workerHandlePath({
                            movableID: The.player.id,
                            startPt: { x: playerX, y: playerY },
                            endPt: { x: toGlobal.x, y: toGlobal.y }
                        }).then((data) => {

                            let destination = null;
                            if (data.path.ALREADY_THERE) {

                                destination = The.player.position.tile;
                            } else {
                                destination = _.last(path.walks).destination; // The tile which we are going to walk to
                                if (!destination) return; // No destination provided from walk/path
                            }

                            const path = data.path;

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

                                const interaction = Resources.interactions[interactableID];
                                if (!interaction) {

                                    // Simple interaction, no FSM involved
                                    const interactionMgr = The.player.character.charComponent('interactionmgr');
                                    interactionMgr.simpleInteract(interactableID);

                                } else if (interaction.clientOnly === true) {

                                    const interactionMgr = The.player.character.charComponent('interactionmgr');
                                    interactionMgr.interact(interactableID, key);
                                } else {

                                    server.request(EVT_INTERACT, {
                                        interactable: interactableID,
                                        tile: { x: nearestTile.x, y: nearestTile.y },
                                        coord,
                                        page: nearestTile.page,
                                        key
                                    })
                                        .then((result) => {
                                            this.Log("Clicked the interactable!", LOG_DEBUG);
                                        }, (reply) => {
                                            this.Log(`Couldn't click the interactable: ${reply.msg}`, LOG_WARNING);
                                        })
                                        .catch(errorInGame);
                                }
                            };

                            if (interactableRes.notouch) {
                                readyToInteract(); // No need to walk up to ("touch") the interactable
                            } else if (data.path.ALREADY_THERE) {
                                readyToInteract(); // Already there
                            } else {
                                The.player.addPath(path).finished(readyToInteract, () => {
                                    this.Log("Awww I couldn't interact with the interactable thingy :(");
                                });
                                The.player.recordNewPath(path);
                            }

                        }).catch((data) => {
                            this.Log("No path found to interactable");
                        });
                    });

                },

                unload: () => {
                    area.unhook(this);
                    user.unhook(this);
                }
            };
        };

        return Game;
    });
