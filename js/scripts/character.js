
// Character
define(
    [
        'SCRIPTINJECT', 'scripts/character.ai', 'eventful', 'hookable', 'loggable'
    ],
    (
        SCRIPTINJECT, AI, Eventful, Hookable, Loggable
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
            this._script     = null;

            this.entity.character = this;

            this.setLogPrefix(`char: ${entity.id}`);

            this.isPlayer = (entity.playerID ? true : false);
            this.delta = 0;

            // FIXME: get these stats from npc
            if (!_.isFinite(entity.npc.health) || entity.npc.health <= 0) throw Err("Bad health for NPC");
            this.health = entity.npc.health;
            this.alive  = true;
            this.respawnTime = null;
            this.respawnPoint = entity.respawnPoint || {
                area: entity.page.area.id,
                page: entity.page.index,
                tile: {
                    x: entity.position.tile.x,
                    y: entity.position.tile.y
                }
            };

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

                this.Log(`Just a scratch.. ${this.health} / ${this.entity.npc.health}   (${amount} dmg)`, LOG_DEBUG);
                this.triggerEvent(EVT_ATTACKED, from, amount);

                if (!Env.isServer) {
                    if (this.entity.ui) {
                        this.entity.ui.hurt();
                    }
                }

                if (this.health <= 0) {
                    this.die();
                    return; // do not post hurt since we've died
                }

                this.doHook('hurt').post();
            };

            this.registerHook('die');
            this.die = () => {
                if (!this.alive) throw Err("Dying when already died");
                if (!this.doHook('die').pre()) return;

                this.Log("Its time to die :(", LOG_DEBUG);
                this.alive = false;
                assert(this.entity.npc.spawn > 0, "NPC has bad respawn timer value");
                this.respawnTime = this.entity.npc.spawn;
                this.brain.die();
                this.triggerEvent(EVT_DIED);

                this.doHook('die').post();
            };

            this.registerHook('respawning');
            this.respawning = () => {
                if (!this.doHook('respawning').pre()) return;

                this.Log("Respawning", LOG_DEBUG);
                this.entity.path = null;
                this.entity.zoning = false;
                this.entity.lastMoved = now();
                this.entity.lastStep = 0;
                this.entity.sprite.idle();
                this.entity.pendingEvents = [];

                this.alive = true;
                assert(this.entity.npc.health > 0, "NPC has bad health value");
                this.health = this.entity.npc.health;
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
                this.canDisconnect = () => {
                    return !this.brain.isBusy();
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
                                confirm(data.coord && _.isFinite(data.coord), evt, "Bad coordinates given for item") &&
                                confirm(data.page && _.isFinite(data.page), evt, "Bad page given")
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
                        delete page.items[coord];
                        const result = itmBase.invoke(item.id, _character, itmRef.args);

                        if (_.isError(result))
                        {
                            confirm(false, evt, result.message);
                            return;
                        }

                        player.respond(evt.id, true);
                        page.broadcast(EVT_GET_ITEM, {
                            page: page.index,
                            coord: coord
                        });

                        page.area.game.removeItem(page.index, coord);
                    };

                    player.registerHandler(EVT_GET_ITEM);
                    player.handler(EVT_GET_ITEM).set(pickupItem);

                    const interact = (evt, data) => {

                        if
                        (
                            (

                                confirm(_.isObject(data), evt, "No args given") &&
                                confirm(data.coord && _.isFinite(data.coord), evt, "Bad coordinates given for item") &&
                                confirm(data.page && _.isFinite(data.page), evt, "Bad page given") &&
                                confirm(data.tile && _.isFinite(data.tile.x) && _.isFinite(data.tile.y), evt, "Bad tile given")
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
