
// Character
define(
    [
        'SCRIPTINJECT',
        'scripts/character.ai', 'scripts/character.inventory',
        'eventful', 'hookable', 'loggable'
    ],
    (
        SCRIPTINJECT, AI, Inventory, Eventful, Hookable, Loggable
    ) => {

        /* SCRIPTINJECT */

        const Character = function(game, entity) {

            extendClass(this).with(Eventful);
            extendClass(this).with(Hookable);
            extendClass(this).with(Loggable);
            this.setLogGroup('Character');

            this._instincts = ['movement', 'combat', 'boredom'];

            this.entity      = entity;
            this.brain       = null;
            this.inventory   = null;
            this._script     = null;

            this.entity.character = this;
            this.initialized = false;

            this.setLogPrefix(`char: ${entity.id}`);
            this.Log(`Setting character on entity ${entity.id}`, LOG_DEBUG);

            // Components/Buffs will listen to events being emitted on the character. However, it doesn't make sense to
            // register every possible hook for every character. Instead we should register them on a per-listener
            // basis, and allow modules to emit events regardless of whether or not a hook exists for that event yet
            this.setHookRelaxedMode(true);


            // Serialization/Restoration
            //
            // FIXME: Find a way to abstract serialize/restore here since server/client evidently use mostly the same
            // stuff. NOTE: The problem with just doing function(){ superSerialize.apply(..); localSerialize.apply(..);
            // }  in script.js is that serialize() returns a value, and we'd need a way to merge the two returned values



            // FIXME: Scripts have a components property, should rename that to scriptComponents so that we can rename
            // this to components
            this._charComponents = entity.npc.components;
            this.charComponents = [];

            this.loadComponents = function() {
                for (let i = 0; i < this._charComponents.length; ++i) {
                    const componentName = this._charComponents[i],
                        componentRes = Resources.components[componentName],
                        component = new componentRes(this);
                    
                    this.charComponents.push( component );
                    component.initialize();
                    // NOTE: Component will be restored later, either by restore (server/client) or netRestore (client)
                }
            };


            this.isPlayer = (entity.playerID ? true : false);
            this.delta = 0;


            // Setup stats from npc
            this.stats = {};

            {
                let addStat = (statName, stat) => {
                    this.stats[statName] = {
                        cur: stat,
                        curMax: stat,
                        max: stat
                    };
                };

                for (const statName in entity.npc.stats) {
                    const stat = entity.npc.stats[statName];
                    addStat(statName, stat);
                }

                assert(_.isFinite(entity.npc.health) && entity.npc.health > 0, `Bad health for NPC: ${entity.npc.health}`);
                addStat('health', entity.npc.health);
            }

            Object.defineProperties(this, {
                health: {
                    "get": function() { return this.stats['health'].cur; },
                    "set": function(hp) { this.stats['health'].cur = hp; }
                }
            });

            this.alive  = true;

            if (Env.isServer) {
                this.respawnTime = null;
                this.respawnPoint = entity.respawnPoint || {
                    area: entity.page.area.id,
                    page: entity.page.index,
                    tile: {
                        x: entity.position.tile.x,
                        y: entity.position.tile.y
                    }
                };
            }

            // Get hurt by some amount, and possibly by somebody
            this.registerHook('hurt');
            this.hurt = (amount, from, health) => {
                if (!this.doHook('hurt').pre()) return;

                // Server side only needs to provide the amount of damage
                // NOTE: health is provided for client side in case of any inconsistencies
                if (_.isUndefined(health)) {
                    this.health -= amount;
                } else {
                    assert(!Env.isServer, "Unexpected setting health on server");
                    this.health = health;
                }

                this.Log(`Just a scratch.. ${this.health} / ${this.stats.health.curMax}   (${amount} dmg)`, LOG_DEBUG);
                this.triggerEvent(EVT_ATTACKED, from, amount);

                if (!Env.isServer) {
                    if (this.entity.ui) {
                        this.entity.ui.hurt();
                    }
                }

                if (this.health <= 0) {
                    this.die(from);
                    return; // do not post hurt since we've died
                }

                this.doHook('hurt').post();
            };

            this.registerHook('die');
            this.die = (advocate) => {
                if (!this.alive) throw Err("Dying when already died");
                if (!this.doHook('die').pre()) return;

                this.Log("Its time to die :(", LOG_DEBUG);
                this.alive = false;
                assert(this.entity.npc.spawn > 0, "NPC has bad respawn timer value");
                this.respawnTime = this.entity.npc.spawn;
                this.brain.die();
                this.triggerEvent(EVT_DIED);

                this.doHook('die').post({
                    advocate: advocate
                });
            };

            this.registerHook('respawning');
            this.respawning = () => {
                if (!this.doHook('respawning').pre()) return;

                this.Log("Respawning", LOG_DEBUG);
                this.entity.cancelPath();
                this.entity.zoning = false;
                this.entity.lastMoved = now();
                this.entity.lastStep = 0;
                this.entity.sprite.idle();
                this.entity.pendingEvents = [];

                this.alive = true;
                this.health = this.stats.health.curMax;
                this.brain.reset();

                this.doHook('respawning').post();
            };

            this.registerHook('respawned');
            this.respawned = () => {
                if (!this.doHook('respawned').pre()) return;

                this.entity.position.global.y = this.respawnPoint.tile.y * Env.tileSize;
                this.entity.position.global.x = this.respawnPoint.tile.x * Env.tileSize;
                this.entity.updatePosition();
                this.characterHasMoved();
                this.Log("Respawned");
                this.standGuard();

                this.doHook('respawned').post();
            };


            // Note whenver the character has moved to a new tile
            this.registerHook('moved');
            this.characterHasMoved = () => {
                if (!this.doHook('moved').pre()) return;
                this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
                this.doHook('moved').post();
            };

            this.listenTo(this.entity, EVT_MOVED_TO_NEW_TILE, () => {
                this.characterHasMoved();
            });

            this.listenTo(this.entity, EVT_FINISHED_PATH, () => {
                if (!this.doHook('moved').pre()) return;
                this.triggerEvent(EVT_FINISHED_PATH);
                this.doHook('moved').post();
            });

            this.listenTo(this.entity, EVT_ZONE_OUT, () => {
                this.triggerEvent(EVT_ZONE_OUT);
            });

            this.listenTo(this.entity, EVT_UNLOADED, () => {
                this.triggerEvent(EVT_UNLOADED);
            });


            // When the character is standing around, stand guard to keep watch of the things around you
            this.registerHook('guard');
            this.standGuard = () => {
                if (!this.doHook('guard').pre()) return;

                this.doHook('guard').post();
            };

            if (this.isPlayer) {

                if (Env.isServer) {
                    this.listenTo(this.entity.player, EVT_USER_ADDED_PATH, () => {
                        this.triggerEvent(EVT_DISTRACTED);
                    });
                }

                // TODO: Check if character is busy in combat
                // TODO: If character isn't alive then he's in the middle of respawning. It would be dangerous to let
                // him d/c right now; however this would be really annoying for the user to have to wait until they
                // respawn
                this.canDisconnect = () => {
                    return !this.brain.isBusy() && this.alive;
                };
            }

            this.isAttackable = () => {
                if (this.health <= 0 || !this.alive) {
                    return false;
                }

                return true;
            };

            this.initListeners = () => {

                this.entity.registerHandler('step');
                this.entity.handler('step').set((delta) => {
                    if (!this.alive) return;
                    this.delta += delta;

                    // while (this.delta >= 50) {
                    //  this.delta -= 50;
                    this.handlePendingEvents();
                    this.brain.step();
                    // }

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        if (this.charComponents[i].needsUpdate) {
                            this.charComponents[i].step(delta);
                        }
                    }
                });
            };

            this.unload = () => {
                this.Log("Unloading");
                this.unloadListener();
                this.entity.handler('step').unset();
                delete this.entity.character;
            };

            const _character = this;
            this.server = {
                initialize() {
                    _character._script = this;
                    _character.characterInit();
                },

                characterInit: () => {
                    this.brain = this._script.addScript(new AI(game, _character)); // NOTE: brain will be initialized automatically after character is initialized
                    this.initListeners();
                    this.loadComponents();
                },

                // Serialize character (saving)
                // Used for saving character to DB
                serialize: () => {

                    const _character = {
                        health: this.health,
                        charComponents: [],
                        inventory: null
                    };

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component = this.charComponents[i],
                          serializedComponent = component.serialize();
                        _character.charComponents.push(serializedComponent);
                    }

                    _character.inventory = this.inventory.serialize();

                    return _character;
                },

                // Restore character from earlier state (load from DB)
                restore: (_character) => {

                    this.health = _character.health;

                    this.inventory = new Inventory(this, _character.inventory);

                    _.each(_character.stats, (stat, statName) => {
                        this.stats[statName].cur = stat.cur;
                        this.stats[statName].curMax = stat.curMax;
                        this.stats[statName].max = stat.max;
                    });

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component = this.charComponents[i],
                            restoreComponent = _character.charComponents[i];
                        component.restore(restoreComponent);
                    }

                    this.initialized = true;
                },

                // NetSerialize character (serialized to users)
                netSerialize: (forOwner) => {

                    const _character = {
                        health: this.health,
                        charComponents: []
                    };

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component = this.charComponents[i],
                          netSerializedComponent = component.netSerialize();
                        _character.charComponents.push(netSerializedComponent);
                    }

                    // Serialize inventory if we have one (NOTE: NPCs don't have an inventory)
                    if (this.inventory) {
                        _character.inventory = this.inventory.serialize();
                    }

                    if (forOwner) {
                        _character.stats = _.cloneDeep(this.stats);
                        console.log(this.stats);
                        console.log("Serializing Health: " + this.health);

                        if (this.health == 1500) process.exit();
                    }

                    return _character;
                },

                setAsPlayer: () => {

                    const player = _character.entity.player;

                    const confirm = (assertion, evt, errorMessage) => {
                        if (!assertion) {
                            player.respond(evt.id, false, {
                                msg: errorMessage
                            });
                            return false;
                        }

                        return true;
                    };

                    const pickupItem = (evt, data) => {

                        if
                        (
                            (
                                confirm(_.isObject(data), evt, "No args given") &&
                                confirm('coord' in data && _.isFinite(data.coord), evt, "Bad coordinates given for item") &&
                                confirm('page' in data && _.isFinite(data.page), evt, "Bad page given")
                            ) === false
                        )
                        {
                            return;
                        }
                        
                        const coord = parseInt(data.coord, 10),
                            page    = player.movable.page.area.pages[data.page];

                        if
                        (
                            (
                                confirm(page, evt, "Bad page given") &&
                                confirm(page.items[coord], evt, `No item found at ${coord}`)
                            ) === false
                        )
                        {
                            return;
                        }


                        const item = page.items[coord];

                        // Is character in range?
                        const y   = parseInt(coord / Env.pageWidth, 10),
                            x     = coord - y * Env.pageWidth,
                            myPos = player.movable.position.tile;

                        if (
                            (y + page.y) !== myPos.y ||
                            (x + page.x) !== myPos.x) {

                            if
                            (
                                confirm
                                (
                                    player.movable.path && !data.hasOwnProperty('retrying'),
                                    evt,
                                    `Player not in range of item (${x}, ${y}) -> (${myPos.x}, ${myPos.y})`
                                ) === false
                            )
                            {
                                return;
                            }

                            player.movable.path.onFinished = (() => {
                                this.Log("Character not near item.. Trying again after movable finishes path", LOG_DEBUG);
                                data.retrying = true;
                                pickupItem(evt, data);
                            });

                            player.movable.path.onFailed = (() => {
                                confirm(false, evt, "Player not near item");
                            });
                            return;
                        }

                        const itmRef = Resources.items.list[item.id];

                        if
                        (
                            (
                                confirm(itmRef.base, evt, "Item does not contain a base script") &&
                                confirm(Resources.items.base[itmRef.base], `Base script (${itmRef.base}) not found`)
                            ) === false
                        )
                        {
                            return;
                        }

                        const itmBase = Resources.items.base[itmRef.base];

                        if (confirm(itmBase.invoke, evt, "Base item script not prepared") === false) {
                            return;
                        }


                        this.Log("Requesting to pickup item", LOG_DEBUG);

                        let pickedUp = false;

                        // Are we adding the item to our inventory or invoking it?
                        if (itmRef.type & ITM_PICKUP) {

                            // Add item to inventory
                            const inventory = player.movable.character.inventory,
                                result = inventory.addItem(itmRef);

                            if (result !== false) {
                                this.Log(`Adding item to player's inventory (${result}) (coord ${coord})`, LOG_DEBUG);
                                player.respond(evt.id, true, {
                                  slot: result
                                });
                                pickedUp = true;
                            } else {
                                player.respond(evt.id, false);
                            }

                        } else {

                            // Invoke item
                            const result = itmBase.invoke(item.id, _character, itmRef.args);

                            if (_.isError(result))
                            {
                                confirm(false, evt, result.message);
                                return;
                            }

                            player.respond(evt.id, true);
                            pickedUp = true;
                        }

                        if (pickedUp) {
                            page.broadcast(EVT_GET_ITEM, {
                                page: page.index,
                                coord: coord
                            });

                            delete page.items[coord];
                            page.area.game.removeItem(page.index, coord);
                        }
                    };

                    player.registerHandler(EVT_GET_ITEM);
                    player.handler(EVT_GET_ITEM).set(pickupItem);

                    const interact = (evt, data) => {

                        if
                        (
                            (

                                confirm(_.isObject(data), evt, "No args given") &&
                                confirm('coord' in data && _.isFinite(data.coord), evt, "Bad coordinates given for item") &&
                                confirm('page' in data && _.isFinite(data.page), evt, "Bad page index given") &&
                                confirm('tile' in data && _.isFinite(data.tile.x) && _.isFinite(data.tile.y), evt, "Bad tile given")
                            ) === false
                        )
                        {
                            return;
                        }

                        const coord = parseInt(data.coord, 10),
                            page    = player.movable.page.area.pages[data.page];

                        if
                        (
                            (
                                confirm(page, evt, "Bad page given") &&
                                confirm(page.interactables[coord], evt, `No interactable found at ${coord}`)
                            ) === false
                        )
                        {
                            return;
                        }

                        const interactable = page.interactables[coord];

                        // Is character in range?
                        const myPos = player.movable.position.tile;
                        let y = parseInt(coord / Env.pageWidth, 10),
                            x = coord - y * Env.pageWidth;

                        y += page.y;
                        x += page.x;

                        if (!inRange(x, myPos.x - 1, myPos.x + 1) ||
                            !inRange(y, myPos.y - 1, myPos.y + 1)) {

                            if
                            (
                                confirm
                                (
                                    player.movable.path && !data.hasOwnProperty('retrying'),
                                    evt,
                                    `Player not in range of interactable: (${x}, ${y}) -> (${myPos.x}, ${myPos.y})`
                                ) === false
                            )
                            {
                                return;
                            }

                            // Not within range...lets retry when we're finished our current path
                            player.movable.path.onFinished = (() => {
                                this.Log("Character not near interactable.. Trying again after movable finishes path", LOG_DEBUG);
                                data.retrying = true;
                                interact(evt, data);
                            });

                            player.movable.path.onFailed = (() => {
                                confirm(false, evt, "Player not near interactable");
                            });
                            return;
                        }


                        const interactableRef = Resources.interactables.list[interactable];

                        if
                        (
                            (
                                confirm(interactableRef, evt, `No resource for interactable ${interactable}`) &&
                                confirm(interactableRef.base, evt, "Interactable does not contain a base script") &&
                                confirm(Resources.interactables.base[interactableRef.base], evt, `Base script (${interactableRef.base}) not found`)
                            ) === false
                        )
                        {
                            return;
                        }

                        const interactableBase = Resources.interactables.base[interactableRef.base];

                        if (confirm(interactableBase.invoke, evt, "Base interactable script not prepared") === false) {
                            return;
                        }


                        this.Log(`Requesting to interact with interactable (${interactable})`, LOG_DEBUG);
                        const result = interactableBase.invoke(interactable, _character, interactableRef.args);

                        if (_.isError(result)) {
                            confirm(false, evt, result.message);
                            return;
                        }

                        player.respond(evt.id, true);
                    };

                    player.registerHandler(EVT_INTERACT);
                    player.handler(EVT_INTERACT).set((evt, data) => {
                        interact(evt, data);
                    });

                    this.restore(player._character);
                }
            };

            this.client = {
                initialize() {
                    this.Log(`[${_character.entity.id}] Initializing character..`, LOG_DEBUG);
                    _character._script = this;
                    _character.characterInit();
                },

                characterInit: () => {
                    this.brain = this._script.addScript(new AI(game, _character)); // NOTE: brain will be initialized automatically after character is initialized
                    this.initListeners();
                    this.loadComponents();

                    if (this.entity._character) {
                        this.netRestore(this.entity._character);
                    } else {
                        // This character doesn't have a _character property for us to netRestore from.. The only reason
                        // this should happen is if we're restoring ourselves due to zoning
                        if (this.entity === The.player) {

                            if (The._character) {
                                // FIXME: Storing _character in The *sucks* find a better solution
                                this.restore(The._character);
                                delete The._character;
                            } else {
                                assert(false, "Initializing our local character without any _character to netRestore from, and The._character not set");
                            }
                        } else {
                            assert(false, "Initializing character without any _character to netRestore from");
                        }
                    }

                    // TODO: Is this a good idea? Currently we're only doing this because of the local player zoning out
                    // and using a stale _character
                    delete this.entity._character;
                },

                // Serialize character for restoring later
                // Since Character is a script, it is recreated everytime we run reloadScripts(). In some cases (eg.
                // respawning) we just depend on netRestore for restoring the character from the server, however that
                // seems unecessary for other cases (eg. zoning) where our local state likely hasn't changed. In this
                // case we serialize locally, store it, then restore
                serialize: () => {

                    const _character = {
                        health: this.health,
                        charComponents: [],
                        inventory: null
                    };

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component = this.charComponents[i],
                          serializedComponent = component.serialize();
                        _character.charComponents.push(serializedComponent);
                    }

                    _character.inventory = this.inventory.serialize();
                    _character.stats = _.cloneDeep(this.stats);

                    return _character;
                },

                // Restore local character from previous state
                // See serialize for more information
                restore: (_character) => {

                    this.health = _character.health;


                    this.inventory = new Inventory(this, _character.inventory);

                    _.each(_character.stats, (stat, statName) => {
                        this.stats[statName].cur = stat.cur;
                        this.stats[statName].curMax = stat.curMax;
                        this.stats[statName].max = stat.max;
                    });

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component = this.charComponents[i],
                            restoreComponent = _character.charComponents[i];
                        component.restore(restoreComponent);
                    }

                    this.initialized = true;
                },

                // Restore this component from state given by server
                netRestore: (_character) => {

                    this.health = _character.health;

                    if (_character.inventory) {
                        assert(this.entity === The.player, "We should only be netRestoring the inventory for ourselves");

                        this.inventory = new Inventory(this, _character.inventory);
                    }

                    if (_character.stats) {
                        assert(this.entity === The.player, "We should only be netRestoring character stats for ourselves");

                        _.each(_character.stats, (stat, statName) => {
                            this.stats[statName].cur = stat.cur;
                            this.stats[statName].curMax = stat.curMax;
                            this.stats[statName].max = stat.max;
                        });
                    }

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component = this.charComponents[i],
                            restoreComponent = _character.charComponents[i];
                        component.netRestore(restoreComponent);
                    }

                    this.initialized = true;
                },

                setToUser: () => {
                    this.isUser = true;
                    this.brain.setToUser();

                    if (The.player !== true) {

                        // FIXME: hook died
                        this.entity.listenTo(this, EVT_DIED, () => {
                            this.stopAllEventsAndListeners();
                        });
                    }
                },

                setAsPlayer: () => {
                    this.Log("I'm such a player", LOG_DEBUG);
                }
            };
        };

        return Character;
    });
