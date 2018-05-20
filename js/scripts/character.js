
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
            this.isPlayer = (entity.playerID ? true : false);

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


            // We send an initial netSerialize of the character's state to players, and then send updates/changes every
            // frame. Each item that changes (raw data type) serializes a pair (propKey, newValue), where propKey is the
            // key of the property that changed (synced key between server/client). We append all of these pairs in the
            // array and flush the entire array during the movables update
            //
            // NOTE: netSerialize updates are specific to a page, and have to be flushed when the entity zones to a new
            // page
            // NOTE: We need netSerialize events to be received in order with respect to page broadcasted events (eg.
            // damage netSerialize event handled BEFORE EVT_DIED event, and EVT_ADDED_ENTITY event handled before
            // netSerialize regen event). For this reason we need to keep track of where our netSerialize cursor fits
            // within the page eventsBuffer, and provide some indicator of ordering. We can do that by appending offsets
            // w/in the netSerialize array to indicate how many events have occured between the previous netSerialize
            // set of properties and the next set.
            const netIndices = [];
            if (Env.isServer) {
                this.netUpdateArr = []; // Things that have changed since we last sent out an update
                this.netUpdateEvtOffset = 0; // Where does cursor in netUpdateArr fit within array of events in page

                // Specific to owner
                if (this.isPlayer) {
                    this.netUpdateOwnerArr = [];
                    this.netUpdateOwnerEvtOffset = 0;
                }

                this.pushNetUpdateEvt = (propKey, value, forOwner) => {

                    const arr = forOwner ? this.netUpdateOwnerArr : this.netUpdateArr;

                    // Have there been any broadcasted events since our last netUpdate? If so then we need to indicate
                    // how many so that the client can order events/netSerialize updates accordingly
                    const eventsSinceLastUpdate = this.netUpdateEvtOffset - this.entity.page.eventsBuffer.length;
                    assert(eventsSinceLastUpdate <= 0);
                    if (eventsSinceLastUpdate !== 0) {
                        arr.push(eventsSinceLastUpdate);
                    }

                    if (forOwner) {
                        this.netUpdateOwnerEvtOffset += eventsSinceLastUpdate;
                    } else {
                        this.netUpdateEvtOffset += eventsSinceLastUpdate;
                    }

                    if (!_.isFinite(value)) DEBUGGER();
                    arr.push(propKey);
                    arr.push(value);
                };

                this.flushNetUpdate = (forOwner, overridePage) => {

                    let page = overridePage ? overridePage : this.entity.page;
                    if (forOwner) {
                        if (this.netUpdateOwnerArr.length) {
                            this.entity.player.send(EVT_NETSERIALIZE_OWNER, {
                                serialize: this.netUpdateOwnerArr,
                                entityId: _character.entity.id,
                                page: page.index
                            });

                            this.netUpdateOwnerArr = [];
                            this.netUpdateOwnerEvtOffset = 0;
                        }
                    } else {
                        if (this.netUpdateArr.length) {
                            page.broadcast(EVT_NETSERIALIZE, {
                                serialize: this.netUpdateArr,
                                entityId: _character.entity.id,
                                page: page.index
                            });

                            this.netUpdateArr = [];
                            this.netUpdateEvtOffset = 0;
                        }
                    }
                };
            } else {

                // The server may send a netSerialize of the character's state while there's items already in the
                // netUpdateArr, so when the player receives the first netUpdate for this character, they'll already
                // have its state ahead of the netUpdate state. This could be a problem w/ callbacks. The netSerialize
                // will send a cursor for the netUpdateArr length, so we can skip ahead to this position when we receive
                // the first netUpdate
                this.netUpdateCursor = 0;
                this.netUpdateCursorOwner = 0;
            }

            // Are we currently serializing netVars? NOTE: We may want to turn this on/off if we plan to modify a
            // variable and broadcast it through some other event
            let netSerializeEnabled = false;
            this.setNetSerializeEnabled = (enabled) => {
                netSerializeEnabled = enabled;
            };

            this.addProperty = (propName, propKey, obj, initialValue, shouldNetSerialize, callback, ownerOnly) => {

                assert(_.isFinite(propKey), `Passed bad property key: ${propKey} for property ${propName}`);

                if (!obj.props) {
                    Object.defineProperty(obj, 'props', {
                        enumerable: false,
                        value: {}
                    });
                }

                if (!this.isPlayer && ownerOnly) return;

                // FIXME: This is disgusting! Lets see if we can string build our function instead  (new Function("..."))
                let propSet_Own_Net_CB = (value) => {
                                    const oldVal = obj.props[propName];
                                    if (value === oldVal) return;

                                    obj.props[propName] = value;
                                    callback(oldVal, value);

                                    if (netSerializeEnabled) {
                                        this.pushNetUpdateEvt(propKey, value, true);
                                    }
                                },
                    propSet_Net_CB = (value) => {
                                    const oldVal = obj.props[propName];
                                    if (value === oldVal) return;

                                    obj.props[propName] = value;
                                    callback(oldVal, value);

                                    if (netSerializeEnabled) {
                                        this.pushNetUpdateEvt(propKey, value, false);
                                    }
                                },
                    propSet_Own_Net = (value) => {
                                    const oldVal = obj.props[propName];
                                    if (value === oldVal) return;

                                    obj.props[propName] = value;
                                    if (netSerializeEnabled) {
                                        this.pushNetUpdateEvt(propKey, value, true);
                                    }
                                },
                    propSet_Net = (value) => {
                                    const oldVal = obj.props[propName];
                                    if (value === oldVal) return;

                                    obj.props[propName] = value;
                                    if (netSerializeEnabled) {
                                        this.pushNetUpdateEvt(propKey, value, false);
                                    }
                                },
                    propSet_CB = (value) => {
                                    const oldVal = obj.props[propName];
                                    if (value === oldVal) return;

                                    obj.props[propName] = value;
                                    callback(oldVal, value);
                                },
                    propSet = (value) => {
                                    obj.props[propName] = value;
                                };

                obj.props[propName] = initialValue;
                Object.defineProperty(obj, propName, {

                    "get": function() {
                        return obj.props[propName];
                    },

                    "set": (shouldNetSerialize ? 
                            (
                                (ownerOnly && Env.isServer) ?
                                    (callback ? propSet_Own_Net_CB : propSet_Own_Net) :
                                    (callback ? propSet_Net_CB : propSet_Net)
                            )
                            :
                            (callback ? propSet_CB : propSet)
                        )

                });

                if (shouldNetSerialize) {
                    if (netIndices[propKey]) throw Err(`Added duplicated property: ${propKey}`);
                    netIndices[propKey] = {
                        obj,
                        propName
                    };
                }
            };




            // FIXME: Scripts have a components property, should rename that to scriptComponents so that we can rename
            // this to components
            this._charComponents = entity.npc.components;
            this.charComponents = [];

            this.loadComponents = function() {
                for (let i = 0; i < this._charComponents.length; ++i) {
                    const componentName = this._charComponents[i],
                        componentRes    = Resources.components[componentName];

                    // Some components are restricted to their owners only. Don't bother creating/initializing
                    // components which don't belong to us (client)
                    if (!Env.isServer) {
                        if (this.entity !== The.player && componentRes.forOwnerOnly) {
                            continue;
                        }
                    }

                    const component = componentRes.flyweight.newInstance(this);
                    component.replicateOwnerOnly = component.forOwnerOnly;
                    
                    this.charComponents.push( component );
                    component.initialize();
                    // NOTE: Component will be restored later, either by restore (server/client) or netRestore (client)
                }
            };

            this.charComponent = function(name) {
                return this.charComponents.find((c) => c.name === name);
            };

            this.delta = 0;

            this.registerHook('healthChanged');
            this.onHealthChanged = (oldVal, newVal) => {
                if (!this.doHook('healthChanged').pre()) return;

                if (!Env.isServer) {
                    if (this.entity.ui) {
                        this.entity.ui.healthChanged();
                    }
                }

                this.doHook('healthChanged').post();
            };


            // Setup stats from npc
            this.stats = {};
            this.loadStats = () => {
                let addStat = (statName, stat, cbCur, cbMax, cbCurMax) => {

                    if (this.stats[statName]) {
                        // We're reloading this stat
                        this.stats[statName].max = stat;
                        this.stats[statName].curMax = stat;
                        this.stats[statName].cur = stat;
                        return;
                    }

                    const statIndexPrefix = 'N_' + statName.toUpperCase(),
                        statIndexCur      = `${statIndexPrefix}_CUR`,
                        statIndexMax      = `${statIndexPrefix}_MAX`,
                        statIndexCurMax   = `${statIndexPrefix}_CURMAX`;

                    this.addProperty(statName, N_NULL, this.stats, {}, false);
                    this.addProperty('cur', global[statIndexCur], this.stats[statName], stat, true, cbCur);
                    this.addProperty('max', global[statIndexMax], this.stats[statName], stat, true, cbMax);
                    this.addProperty('curMax', global[statIndexCurMax], this.stats[statName], stat, true, cbCurMax);
                };

                for (const statName in entity.npc.stats) {
                    const stat = entity.npc.stats[statName];

                    if (!Env.isServer && statName == 'health') {
                        addStat(statName, stat, this.onHealthChanged, null, null);
                    } else {
                        addStat(statName, stat);
                    }
                }
            };

            this.serializeStats = () => {

                const stats = {};
                for (const statName in this.stats.props) {
                    stats[statName] = {
                        cur: this.stats[statName].cur,
                        max: this.stats[statName].max,
                        curMax: this.stats[statName].curMax
                    };
                }

                return stats;
            };

            this.loadStats();

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

            // Get damaged by some amount, and possibly by somebody
            this.registerHook('damaged');
            this.damage = (amount, from, damageData) => {
                assert(Env.isServer, "Damage is handled on server; client should simply react to EVT_DAMAGED, and update from netUpdate health");

                if (!this.doHook('damaged').pre()) return;

                // Server side only needs to provide the amount of damage
                // NOTE: health is provided for client side in case of any inconsistencies
                this.health -= amount;

                this.Log(`Just a scratch.. ${this.health} / ${this.stats.health.curMax}   (${amount} dmg)`, LOG_DEBUG);

                this.triggerEvent(EVT_DAMAGED, from, amount);

                if (from) {
                    damageData.attackerEntity = { page: from.entity.page.index, id: from.entity.id };
                }

                damageData.damagedEntity = { page: this.entity.page.index, id: this.entity.id };
                damageData.amount = amount;

                this.entity.page.broadcast(EVT_DAMAGED, damageData);

                if (this.health <= 0) {
                    this.die(from);
                    return; // do not post damaged since we've died
                }

                // FIXME: Abstract where we check if an effect is proc'd and how its applied
                // NOTE: We want to process effects AFTER handling damage/death, otherwise our effect could activate and
                // instantly kill the entity before we've processed the original damage source
                if (damageData.effects) {
                    chance = Math.random();
                    damageData.effects.forEach((effect) => {
                        if (chance < effect.chance) {
                            // Effect has proc'd
                            if (effect.type === "buff") {
                                assert(effect.buffres in Buffs, `Unexpected buffres: ${effect.buffres}`);
                                this.Log(`Giving you a buff: ${effect.buffres}`);
                                this.doHook('BuffEvt').post({
                                    buff: Buffs[effect.buffres]
                                });
                            } else {
                                throw Err(`Unexpected damageData effect type: ${effect.type}`);
                            }
                        }
                    });
                }

                this.doHook('damaged').post();
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

                if (Env.isServer) {
                    const deathData = {
                        entity: { page: this.entity.page.index, id: this.entity.id }
                    };

                    if (advocate) {
                        deathData.advocate = advocate.id;
                    }

                    // Before dying we need to flush out any netSerialize updates
                    this.flushNetUpdate(false);
                    if (this.isPlayer) {
                        this.flushNetUpdate(true);
                    }

                    this.entity.page.broadcast(EVT_DIED, deathData);
                }

                this.doHook('die').post({
                    advocate: advocate
                });
            };

            this.registerHook('respawning');
            this.respawning = () => {
                if (!this.doHook('respawning').pre()) return;

                // Since we may have some leftover netSerialize stuff (which won't have sent since this character is
                // dead) we would send that when it respawns. The problem is that we will respawn and send leftover
                // netSerialize data in the same frame, and the priority manager will handle netSerialize data (eg.
                // setting its health to 0 from when it died) before its created and respawned on the client. Since the
                // old netSerialize data is stale and null by now, lets just clear it
                this.netUpdateArr = [];
                netSerializeEnabled = false;

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

                netSerializeEnabled = true;

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

            // FIXME: See scripts/game.js for why we have to respawning -> respawned -> page.addEntity; need to fix that
            // up so that we can addEntity inside of respawned, then get rid of this hacky shit
            this.registerHook('finishedRespawn');
            this.finishedRespawn = () => {
                if (!this.doHook('finishedRespawn').pre()) return;

                this.Log("Finished Respawned");

                this.doHook('finishedRespawn').post();
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

            this.listenTo(this.entity, EVT_ZONE_OUT, (movable, oldArea, oldPage, area, page) => {
                this.triggerEvent(EVT_ZONE_OUT);

                if (Env.isServer) {
                    // Entity has zoned to another page, and since netSerialize updates are specific to each page then
                    // we need to flush all of our netUpdate events to the page
                    this.flushNetUpdate(false, oldPage);
                    if (this.isPlayer) {
                        this.flushNetUpdate(true, oldPage);
                    }
                }
            });

            this.listenTo(this.entity, EVT_UNLOADED, () => {
                this.triggerEvent(EVT_UNLOADED);

                // Triggers when player disconnects
                if (Env.isServer) {
                    // Entity has zoned to another page, and since netSerialize updates are specific to each page then
                    // we need to flush all of our netUpdate events to the page
                    this.flushNetUpdate(false);
                    if (this.isPlayer) {
                        this.flushNetUpdate(true);
                    }
                }
            });

            this.listenTo(this.entity, EVT_ZONE, (movable, oldPage, newPage) => {

                if (Env.isServer) {
                    // Entity has zoned to another page, and since netSerialize updates are specific to each page then
                    // we need to flush all of our netUpdate events to the page
                    this.flushNetUpdate(false, oldPage);
                    if (this.isPlayer) {
                        this.flushNetUpdate(true, oldPage);
                    }
                }
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

                    if (Env.isServer) {
                        this.flushNetUpdate(false);
                        if (this.isPlayer) {
                            this.flushNetUpdate(true);
                        }
                    }

                    // Long step (things we don't need to update very often)
                    if (this.delta > 16000) {

                        if (Env.isServer) {
                            if (!this.state && !this.isPlayer) {
                                // Wandering around

                                // FIXME:
                                //  - Find a point nearby w/ a path that isn't long (not over a cliff where we have to walk all the way around)
                                //  - Add path there
                                //  - Can we use slower walking speed?
                                //  - Only need to do this if there's a player nearby that can witness this (in PVS of player)

                                if (Math.random() < 0.1) {


                                    // Find an open, nearby tile
                                    const filterOpenTiles = (tile) => {
                                        const localCoords = area.localFromGlobalCoordinates(tile.x, tile.y),
                                            distFromPos   = Math.abs(tile.x - curTile.x) + Math.abs(tile.y - curTile.y);
                                        return (localCoords.page && distFromPos >= 2);
                                    };


                                    const respawn  = this.respawnPoint,
                                        sourceTile = new Tile(respawn.tile.x, respawn.tile.y),
                                        area       = this.entity.page.area,
                                        curTile    = new Tile(this.entity.position.tile.x, this.entity.position.tile.y),
                                        openTiles  = area.findOpenTilesAbout(sourceTile, 25, filterOpenTiles, 1000);

                                    if (openTiles.length > 0) {
                                        const openTileIdx = Math.floor(Math.random() * (openTiles.length - 1)),
                                            openTile      = openTiles[openTileIdx];

                                        this.brain.instincts.movement.goToTile(openTile, 0).then(() => {
                                            this.standGuard();
                                        });
                                    }


                                }
                            }
                        }

                        this.delta = 0;
                    }
                });
            };


            this.unloadComponents = () => {

                // Unload all char components
                for (let i = 0; i < this.charComponents.length; ++i) {
                    const component = this.charComponents[i];
                    component.unload();
                }

                this.charComponents = [];
            };

            this.unload = () => {
                this.Log("Unloading");
                this.unloadComponents();
                this.unloadListener();
                this.entity.handler('step').unset();
                delete this.entity.character;
            };

            this.commonSerialize = () => {

                const _character = {
                    components: {},
                    inventory: null
                };

                for (let i = 0; i < this.charComponents.length; ++i) {
                    const component         = this.charComponents[i],
                        componentName       = entity.npc.components[i],
                        serializedComponent = component.serialize();
                    _character.components[componentName] = serializedComponent;
                }

                _character.inventory = this.inventory.serialize();
                _character.stats = this.serializeStats();

                return _character;
            };

            this.commonRestore = (_character) => {

                this.inventory = new Inventory(this, _character.inventory);

                _.each(_character.stats, (stat, statName) => {
                    this.stats[statName].cur = stat.cur;
                    this.stats[statName].curMax = stat.curMax;
                    this.stats[statName].max = stat.max;
                });

                for (let i = 0; i < this.charComponents.length; ++i) {
                    const component      = this.charComponents[i],
                        componentName    = entity.npc.components[i],
                        restoreComponent = _character.components[componentName];

                    if (restoreComponent) {
                        component.restore(restoreComponent);
                    } else {
                        component.firstTimeSetup();
                    }
                }

                this.initialized = true;
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

                    // NPCs have finished loading at this point. Player will need to restore their components/etc. from
                    // db restore
                    if (!this.isPlayer) {
                        netSerializeEnabled = true;
                    }
                },

                // Serialize character (saving)
                // Used for saving character to DB
                serialize: () => {
                    const _character = this.commonSerialize();
                    return _character;
                },

                // Restore character from earlier state (load from DB)
                restore: (_character) => {
                    this.commonRestore(_character);
                    netSerializeEnabled = true;
                },

                // NetSerialize character (serialized to users)
                // Owner: This only occurs on respawn (not on login)
                netSerialize: (forOwner) => {

                    const _character = {
                        health: this.health
                    };

                    if (forOwner) {
                        _character.components = [];
                        for (let i = 0; i < this.charComponents.length; ++i) {
                            const component = this.charComponents[i];

                            if (component.replicateOwnerOnly && !forOwner) continue;

                            const netSerializedComponent = component.netSerialize();
                            netSerializedComponent.name = component.name; // FIXME: THere's got to be a better way
                            _character.components.push(netSerializedComponent);
                        }

                        _character.stats = this.serializeStats();
                        _character.inventory = this.inventory.serialize();

                        if (this.netUpdateOwnerArr && this.netUpdateOwnerArr.length) {
                            _character.netUpdateCursorOwner = this.netUpdateOwnerArr.length;
                        }
                    }

                    // We may netSerialize while there's still netVars in the netUpdate buffer waiting to be sent out.
                    // This means that the person receiving this netSerialize will initialize the character with data
                    // that's ahead of the netUpdateArr time. When they receive the netUpdate they can skip ahead to
                    // this cursor position
                    if (this.netUpdateArr.length) {
                        _character.netUpdateCursor = this.netUpdateArr.length;
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

                        const interactionMgr = _character.charComponent('interactionmgr');
                        const result = interactionMgr.interact(data.interactable, data.key);

                        player.respond(evt.id, true, result);
                    };

                    player.registerHandler(EVT_INTERACT);
                    player.handler(EVT_INTERACT).set((evt, data) => {
                        interact(evt, data);
                    });

                    player.registerHandler(CMD_ADMIN_RAND_HEALTH);
                    player.handler(CMD_ADMIN_RAND_HEALTH).set((evt, data) => {

                        const newHealth = parseInt(_character.stats.health.curMax * Math.random());
                        _character.health = newHealth;

                        player.respond(evt.id, true);
                    });


                    player.registerHandler(CMD_ADMIN_HEAL);
                    player.handler(CMD_ADMIN_HEAL).set((evt, data) => {

                        const newHealth = _character.stats.health.curMax;
                        _character.health = newHealth;

                        // FIXME: There should be a better (more abstract) broadcast than regenerate
                        _character.entity.page.broadcast(EVT_REGENERATE, {
                            entityId: _character.entity.id,
                            health: newHealth
                        });

                        player.respond(evt.id, true);
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
                        // Initialize for our player, but only restore for character
                        // FIXME: Would be nice to get rid of netInitialize later
                        if (this.entity === The.player && this.entity._character.init === true) {
                            this.netInitialize(this.entity._character);
                        } else {
                            this.netRestore(this.entity._character);
                        }
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
                    const _character = this.commonSerialize();
                    return _character;
                },

                // Restore local character from previous state
                // See serialize for more information
                restore: (_character) => {
                    this.commonRestore(_character);
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

                    if (_character.components) {
                        for (let i = 0; i < _character.components.length; ++i) {
                            const restoreComponent = _character.components[i],
                                componentName = restoreComponent.name,
                                component = this.charComponents.find((c) => c.name === componentName);
                            component.netRestore(restoreComponent);
                        }
                    }

                    if (_character.netUpdateCursor) {
                        this.netUpdateCursor = _character.netUpdateCursor;
                        this.netUpdateCursorOwner = _character.netUpdateCursorOwner;
                    }

                    this.initialized = true;
                },

                // Initialize Character on login
                // FIXME: This sucks to separate this from netRestore; especially since we use netRestore for respawn.
                // We should fix the server login flow to create your character before sending your character to you,
                // which allows the server to netSerialize your character
                netInitialize: (_character) => {

                    this.inventory = new Inventory(this, _character.inventory);

                    _.each(_character.stats, (stat, statName) => {
                        this.stats[statName].cur = stat.cur;
                        this.stats[statName].curMax = stat.curMax;
                        this.stats[statName].max = stat.max;
                    });

                    for (let i = 0; i < this.charComponents.length; ++i) {
                        const component      = this.charComponents[i],
                            componentName    = entity.npc.components[i],
                            restoreComponent = _character.components[componentName];


                        if (restoreComponent) {
                            component.netInitialize(restoreComponent);
                        } else {
                            component.firstTimeSetup();
                        }
                    }

                    this.initialized = true;

                },

                netUpdate: (netUpdateArr, owner) => {

                    assert(netUpdateArr.length % 2 === 0, "netUpdate received w/ an odd number of elements: every item changed should include a pair of items (key,value)");
                    let cursor = owner ? this.netUpdateCursorOwner : this.netUpdateCursor;
                    for (let i = cursor; i < netUpdateArr.length; i += 2) {
                        const propKey = netUpdateArr[i],
                            propValue = netUpdateArr[i+1],
                            netIndex  = netIndices[propKey],
                            propName  = netIndex.propName;

                        assert(netIndex, `netUpdate received w/ propKey ${propKey} not included in indices list`);
                        netIndex.obj[propName] = propValue;
                    }

                    if (owner) {
                        this.netUpdateCursorOwner = 0;
                    } else {
                        this.netUpdateCursor = 0;
                    }
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
