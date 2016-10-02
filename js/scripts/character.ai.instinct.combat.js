
// Combat System
define(
    [
        'SCRIPTINJECT', 'eventful', 'hookable', 'dynamic', 'loggable',
        'scripts/character', 'scripts/character.ai.instinct'
    ],
    (
        SCRIPTINJECT, Eventful, Hookable, Dynamic, Loggable,
        Character, Instinct
    ) => {

        // TODO: FIXME: EVT_ZONE_OUT happens on entity; have the entity trigger character EVT_ZONE_OUT so that we can listen to it

        // FIXME: Move server/client player EVT_ATTACK into Strategy (player melee strategy)

        /* SCRIPTINJECT */

        addKey('COMBAT_TARGET_ACTIVE');
        addKey('COMBAT_TARGET_ZONED_OUT');

        const Combat = function(game, brain) {
            Instinct.call(this, game, brain);

            extendClass(this).with(Eventful);
            extendClass(this).with(Hookable);
            extendClass(this).with(Dynamic);
            extendClass(this).with(Loggable);

            this.setLogGroup('Instinct');
            this.setLogPrefix(`Combat (${brain.character.entity.id})`);

            this.name = "combat";

            const _combat  = this,
                _character = brain.character;

            let _script    = null;

            this.target          = null;
            this.targetsToForget = [];

            this.distractedTime  = null;

            this.strategy        = null;

            // Registered Callbacks
            //
            // A list of event => [callback, ..] pairs
            // Since combat strategy is dynamic, different strategies/situation require listening to different events.
            // Simply keep a list of all events and the array of callbacks; then when a target is set listen to those
            // events and loop through all callbacks handling each separately. To keep priorities in order, handle
            // combat system callbacks first, then strategy callbacks.
            //
            // Since we want to continue listening to a target after he's zoned out (in case he comes back), we need to
            // switch between listening modes. If our target has zoned out then we should only be concerned about
            // checking if he's zoned back
            //
            this.registeredCallbacks = {};
            this.registeredCallbacks[COMBAT_TARGET_ACTIVE] = {};
            this.registeredCallbacks[COMBAT_TARGET_ZONED_OUT] = {};

            this.setAbilities = (_abilities) => {

                this.abilities = {};
                _.each(_abilities, (_ability) => {
                    let ability = Resources.scripts.ai.instincts[this.name].components[_ability];
                    if (ability.script) ability = ability.script;
                    const script = _script.addScript(new ability(game, this, _character));
                    this.abilities[_ability] = script;
                });
            };

            this.onEnter = (instinct, data) => {
                this.state = this.strategy;
                this.isActive = true;
                this.setTarget(data.enemy);
                this.state.target(data.enemy);
            };

            this.onLeave = () => {
                // TODO: cleanup, leave state

                if (this.state) {
                    this.state.reset();
                    this.state = null;
                }

                if (this.target) {
                    this.target = null;
                }

                // FIXME: I can't imagine why we'd be leaving the combat when there's available targets, but at the very
                // least we need to forget the currently active targets
                // NOTE: Need to keep the zoned_out targets in case they zone back and we can attack them again
                for (const id in brain.neuralNet.neurons) {
                    const neuron = brain.neuralNet.neurons[id],
                        target   = neuron.character;

                    if (neuron.targetMode === COMBAT_TARGET_ACTIVE) {
                        this.forgetTarget(target);
                    }
                }

                this.isActive = false;
            };

            this.reset = () => {

                for (const id in brain.neuralNet.neurons) {
                    const neuron = brain.neuralNet.neurons[id],
                        target   = neuron.character;

                    this.forgetTarget(target);
                }
            };

            this.registerHook('update');
            this.update = () => {

                this.handlePendingEvents();
                if (!this.doHook('update').pre()) return true;
                let result = false;
                if (this.state) {
                    this.state.step();
                    result = true;
                }

                // Have we lost our target? If so then try to find another target
                if (!this.target) {

                    // TODO: Find a new target (find the best target)
                    const area = _character.entity.page.area;
                    for (const id in brain.neuralNet.neurons) {
                        const neuron = brain.neuralNet.neurons[id];
                        if (neuron.character.entity.page.area === area) {
                            this.target = neuron.character;
                            this.state.target(this.target);
                            break;
                        }
                    }

                    if (!this.target) {
                        result = false;
                    }
                }

                this.doHook('update').post();
                return result;
            };

            // Set combat strategy
            this.setStrategy = (_strategy) => {
                let strategy = Resources.scripts.ai.instincts[this.name].components[_strategy];
                if (strategy.script) strategy = strategy.script;
                const script = _script.addScript(new strategy(strategyInterface, _character));
                this.strategy = script;
            };

            // Anytime we were attacked by someone, make note of it here. If we're not already in combat mode, then this
            // will post to the brain that we were hit and activate combat. The target will be added (or updated) to our
            // neural network, and in the case that we have a different target, our current target will be reconsidered.
            this.attackedBy = (enemy, amount) => {

                // TODO: add enemy to neural network

                if (!this.isActive) {

                    // We're not yet attacking, let the brain know that we were attacked by somebody so that we can
                    // enter combat mode
                    const news = {
                        instinct: 'combat',

                        enemy, amount
                    };

                    brain.postNews(news);
                } else {

                    // TODO: not attacking this guy? reconsider targets
                }
            };

            // Set our current enemy target. If we're not in combat mode yet, then post the brain that we're going to
            // enter combat mode. This does not affect the neural network
            //
            // NOTE: NPCs aggro should affect the neural network elsewhere, and simply set the target here
            this.setTarget = (target) => {

                this.Log("Setting Target");

                assert(target instanceof Character, "Target is not a character");

                if (this.isActive) {

                    if (this.target !== target) {
                        this.target = target;
                    }
                } else {

                    // We're not in combat mode yet. Tell the brain we'd like to attack now
                    const news = {
                        instinct: 'combat',
                        enemy: target,
                        aggro: true
                    };

                    brain.postNews(news);
                }
            };

            this.stopListeningToTarget = (target) => {

                assert(target instanceof Character, "Target not a Character");

                this.stopListeningTo(target);
                this.stopListeningTo(target.entity);

                for (const targetMode in this.registeredCallbacks) {
                    for (const evt in this.registeredCallbacks[targetMode]) {
                        this.registeredCallbacks[targetMode][evt].listening = false;
                    }
                }
            };

            this.forgetTarget = (target) => {

                this.stopListeningToTarget(target);

                brain.neuralNet.remove(target.entity.id);

                for (let i = 0; i < this.targetsToForget.length; ++i) {
                    if (this.targetsToForget === target) {
                        this.targetsToForget.splice(i, 1);
                        break;
                    }
                }

                // FIXME: what if we have news items regarding this character? Need to remove those, or have a setTarget
                // check that the target has died?
                if (this.target === target) {
                    this.target = null;

                    if (this.state) {
                        this.state.lostTarget();
                    }
                }

                // FIXME: DONT DO THIS! What if there's more baddies that we're forgetting?
                // this.state.reset();
            };

            this.forgetTargetAfter = (target, time) => {

                assert(target instanceof Character, "Target is not a character");

                let foundHim = false;
                for (let i = 0; i < this.targetsToForget.length; ++i) {
                    if (this.targetsToForget[i] === target) {
                        foundHim = true;
                        break;
                    }
                }

                if (!foundHim) {
                    this.targetsToForget.push(target);
                }

                const neuron = brain.neuralNet.find(target.entity.id);
                if (!neuron) throw Err("Attempting to update target who isn't in our neuralnet!");

                neuron.forgetTime = Date.now() + time;
            };

            this.stopForgettingTarget = (target) => {

                let foundHim = false;
                for (let i = 0; i < this.targetsToForget.length; ++i) {
                    if (this.targetsToForget[i] === target) {
                        this.targetsToForget.splice(i, 1);
                        foundHim = true;
                        break;
                    }
                }

                if (!foundHim) throw Err(`Could not find target`, this.targetsToForget, brain.neuralNet);

                const neuron = brain.neuralNet.find(target.entity.id);
                if (!neuron) throw Err("Attempting to update target who isn't in our neuralnet!");
                delete neuron.forgetTime;
            };

            this.forgetOldTargets = () => {
                const now = Date.now();

                // TODO: This is written poorly..make it better
                this.targetsToForget = this.targetsToForget.filter((target) => {

                    const neuron = brain.neuralNet.find(target.entity.id);
                    if (!neuron) throw Err("Attempting to update target who isn't in our neuralnet!");

                    if (neuron.forgetTime <= now) {
                        this.forgetTarget(target);
                        return false;
                    } else {
                        return true;
                    }
                });
            };

            this.listenToTargetEvent = (target, evt, targetMode) => {

                // TODO: FIXME: What if already listening to this event? (assert)
                this.listenTo(target, evt, (target) => {
                    const callbacks = this.registeredCallbacks[targetMode][evt];
                    for (let i = 0; i < callbacks.combat.length; ++i) {
                        callbacks.combat[i](target);
                    }

                    for (let i = 0; i < callbacks.strategy.length; ++i) {
                        callbacks.strategy[i](target);
                    }
                });

                this.registeredCallbacks[targetMode][evt].listening = true;
            };

            this.listenToTarget = (target, targetMode) => {

                assert(target instanceof Character, "Target not a Character");

                if (!brain.neuralNet.has(target.entity.id)) {
                    this.Log("Adding entity to our neural net");
                    brain.neuralNet.add(target);
                }

                const neuron = brain.neuralNet.neurons[target.entity.id];

                // Are we already listening to the target with this target mode?
                if (neuron.targetMode === targetMode) {
                    return;
                }

                neuron.targetMode = targetMode;

                for (const evt in this.registeredCallbacks[targetMode]) {
                    this.listenToTargetEvent(target, evt, targetMode);
                }
            };

            // If we get distracted by something (eg. user clicks to walk somewhere) then leave combat and forget all
            // targets from the neural network
            this.distracted = () => {
                // TODO: only listen to distraction event when combat is active, then unlisten to it when we leave
                // combat mode

                if (this.isActive) {
                    this.Log("Distracted");
                    this.distractedTime = Date.now() + 4000; // FIXME: Env this
                    // TODO: Leave combat; forget neural network of enemies
                    brain.leaveState('combat');
                    brain.neuralNet.reset();
                }
            };

            this.isBusy = () => {
                return true;
            };

            this.getInstinct = (instinct) => brain.instincts[instinct];
            this.getAbility = (ability) => this.abilities[ability];

            this.registerTargetCallback = (evt, callback, isCombatSystem, targetMode) => {

                let callbacks = null;
                if (!targetMode) {
                    callbacks = this.registeredCallbacks[COMBAT_TARGET_ACTIVE];
                } else {
                    callbacks = this.registeredCallbacks[targetMode];
                }

                if (!(evt in callbacks)) {
                    callbacks[evt] = {
                        combat: [],
                        strategy: [],
                        listening: false
                    };
                }

                const callbackContext = isCombatSystem ? 'combat' : 'strategy';
                callbacks[evt][callbackContext].push(callback);

                // If we already have a target set (eg. just loaded up strategy after setting target), but we
                // aren't yet listening to this specific evt then start listening to evt
                if (this.target) {
                    const neuron = brain.neuralNet.neurons[this.target.entity.id];
                    if (!callbacks[evt].listening && neuron.targetMode === targetMode) {
                        this.listenToTargetEvent(this.target, evt, targetMode);
                    }
                }
            };

            this.clearStrategyTargetCallbacks = () => {
                for (const targetMode in this.registeredCallbacks) {
                    for (const evt in this.registeredCallbacks[targetMode]) {
                        this.registeredCallbacks[targetMode][evt].strategy = [];
                    }
                }
            };

            this.setTargetCallbacks = () => {

                // listen to entity
                this.registerTargetCallback(EVT_DIED, (target) => {
                    this.Log("You died :(");
                    this.forgetTarget(target);
                }, true, COMBAT_TARGET_ACTIVE);

                // TODO: Clean this up.. duplicate functionality
                this.registerTargetCallback(EVT_DIED, (target) => {
                    this.Log("You died :(");
                    this.forgetTarget(target);
                }, true, COMBAT_TARGET_ZONED_OUT);

                this.registerTargetCallback(EVT_UNLOADED, (target) => {
                    this.Log("You've been removed from the area");
                    this.forgetTarget(target);
                }, true, COMBAT_TARGET_ACTIVE);

                this.registerTargetCallback(EVT_UNLOADED, (target) => {
                    this.Log("You've been removed from the area");
                    this.forgetTarget(target);
                }, true, COMBAT_TARGET_ZONED_OUT);

                // TODO: FIXME: EVT_ZONE_OUT happens on entity; have the entity trigger character EVT_ZONE_OUT so that
                // we can listen to it
                this.registerTargetCallback(EVT_ZONE_OUT, (target) => {
                    this.Log("Aww you ran away! :(");

                    this.stopListeningToTarget(target);
                    if (target.entity.page.area !== _character.entity.page.area) {
                        // Zoned to another area
                        const neuron = brain.neuralNet.neurons[target.entity.id];
                        if (neuron.targetMode === COMBAT_TARGET_ACTIVE) {
                            this.listenToTarget(target, COMBAT_TARGET_ZONED_OUT);
                            neuron.targetMode = COMBAT_TARGET_ZONED_OUT;
                            this.forgetTargetAfter(target, 10000); // FIXME: Env forgetting time

                            if (this.target === target) {
                                this.target = null;

                                if (this.state) {
                                    this.state.lostTarget();
                                }
                            }
                        }
                    }
                }, true, COMBAT_TARGET_ACTIVE);

                this.registerTargetCallback(EVT_ZONE_OUT, (target) => {
                    this.Log("Zomg you just zoned! Back here?");

                    this.stopForgettingTarget(target);
                    this.stopListeningToTarget(target);
                    if (target.entity.page.area === _character.entity.page.area) {
                        this.Log("   Yes!! Get over here!");
                        // Zoned back into same area
                        const neuron = brain.neuralNet.neurons[target.entity.id];
                        if (neuron.targetMode === COMBAT_TARGET_ZONED_OUT) {
                            this.attackedBy(target, 0);
                            this.listenToTarget(target, COMBAT_TARGET_ACTIVE);
                            neuron.targetMode = COMBAT_TARGET_ACTIVE;
                        }
                    }
                }, true, COMBAT_TARGET_ZONED_OUT);

            };

            const strategyInterface = {
                registerCallback: this.registerTargetCallback,
                require: this.getInstinct,
                ability: this.getAbility,

                forgetTarget: this.forgetTarget
            };


            this.globalUnload = () => {
                this.unloadListener();
            };


            this.server = {
                initialize() {
                    _script = this;
                    _combat.combatInit();
                },

                combatInit: () => {

                    this._abilities = [];// TODO: fetch this from NPC
                    if (!_character.isPlayer) {
                        this._abilities = ['melee', 'range', 'sight'];
                    } else {
                        this._abilities = ['melee'];
                    }

                    this.setAbilities(this._abilities);

                    game.hook('longStep', this).after(() => {

                        const l = this.targetsToForget.length;
                        this.forgetOldTargets();

                        if (this.targetsToForget.length !== l) {
                            this.Log("I forgot some targets..");
                            brain.neuralNet.print();
                        }
                    });

                    // Sight/Aggro
                    if (!_character.isPlayer) {
                        const sight = this.abilities['sight'];
                        sight.onReady = () => {
                            sight.hook('see', this).after((character) => {
                                if (character.isPlayer) {
                                    this.Log("I WANT TO ATTACK YOU!!!", LOG_DEBUG);

                                    // TODO: fix this; should be a better way to enable aggro
                                    if (!this.target) {
                                        this.attackedBy(character, 0);
                                        this.listenToTarget(character, COMBAT_TARGET_ACTIVE);
                                    }
                                }
                            });
                        };
                    }

                    // TODO: upstream to listen to character
                    _script.listenTo(_character, EVT_ATTACKED).after((_character, enemy, amount) => {

                        if (this.distractedTime && this.distractedTime > Date.now()) {
                            this.Log("Nope! I'm just going to ignore it..");
                            return;
                        }

                        this.attackedBy(enemy, amount);

                        if (_character.isPlayer) {
                            this.listenToTarget(enemy, COMBAT_TARGET_ACTIVE);
                        } else {
                            this.listenToTarget(enemy, COMBAT_TARGET_ACTIVE);
                        }
                    });

                    _script.listenTo(_character, EVT_DISTRACTED).after(() => {
                        this.distracted();
                    });

                    if (_character.isPlayer) {
                        this.Log("You are a player", LOG_DEBUG);
                        const player = _character.entity.player;

                        this.requests = [];


                        this.setStrategy('strategy.player.basic_melee');
                        this.setTargetCallbacks();

                        // FIXME: Is there a better way than overriding update?
                        this.update = () => {

                            this.handlePendingEvents();
                            if (!this.doHook('update').pre()) return false;

                            let result = false;
                            if (this.state) {
                                this.state.step();
                                result = true;
                            }

                            this.doHook('update').post();

                            if (!this.target) {
                                result = false;
                            }

                            return result;
                        };


                        // Player initiating attack request
                        player.registerHandler(EVT_ATTACK);
                        player.handler(EVT_ATTACK).set((evt, data) => {
                            this.Log("Player attempting to attack someone..", LOG_DEBUG);
                            this.Log(`Target: ${data.target}`, LOG_DEBUG);

                            const target = _character.entity.page.area.movables[data.target];
                            let err      = null;

                            if (!target) err = "No target currently";
                            else if (!_.isObject(target)) err = "Target not found";
                            else if (!(target.character instanceof Character)) err = "Target does not have a character reference";

                            if (!err) {
                                if (!target.character.isAttackable()) err = "Character is not attackable";
                            }

                            if (err) {
                                this.Log("Disallowing user attack", LOG_ERROR);
                                player.respond(evt.id, false, {
                                    reason: err
                                });
                                return;
                            }

                            if (!this.isActive) {

                                const news = {
                                    instinct: 'combat',
                                    enemy: target.character,
                                    aggro: true
                                };

                                brain.postNews(news);
                            }

                            player.respond(evt.id, true);
                        });

                    } else {
                        // NPC

                        // Set combat strategy for NPC
                        // TODO: Get this from NPC info
                        this.setStrategy('strategy.basic_melee');
                        this.setTargetCallbacks();
                    }
                },

                unload: () => {
                    if (!_.isUndefined(_character.entity.player)) _character.entity.player.handler(EVT_ATTACK).unset();
                    this.globalUnload();
                }
            };

            this.client = {
                initialize() {
                    _script = this;
                    _combat.combatInit();
                },

                combatInit: () => {
                    this.setTargetCallbacks();
                },

                setToUser: () => {

                    this._abilities = []; // TODO: fetch this from NPC
                    if (_character.isUser) {
                        this._abilities = ['melee'];
                        this.setAbilities(this._abilities);
                    }

                    for (const abilityID in this.abilities) {
                        const ability = this.abilities[abilityID];
                        if (ability.setToUser) {
                            ability.setToUser();
                        }
                    }

                    this.setStrategy('strategy.player.basic_melee');

                    // TODO: upstream from characer
                    _script.listenTo(_character, EVT_ATTACKED).after((_character, enemy, amount) => {

                        if (this.distractedTime && this.distractedTime > Date.now()) {
                            this.Log("Nope! I'm just going to ignore it..");
                            return;
                        }

                        this.attackedBy(enemy, amount);
                        this.listenToTarget(enemy, COMBAT_TARGET_ACTIVE);
                    });

                    _script.listenTo(_character, EVT_DISTRACTED).after(() => {
                        this.distracted();
                    });

                    user.hook('clickedEntity', user).after((entity) => {

                        if (entity.character.isPlayer) {
                            // TODO: follow player
                            return;
                        }

                        // this.listenToTarget(entity.character, COMBAT_TARGET_ACTIVE);
                        // this.setTarget(entity.character);


                        // Tell the server we're now attacking this entity. The server handles player movement &
                        // attacking, so all that we need to do is send this target attack request
                        server.request(EVT_ATTACK, {
                            target: entity.id
                        }).then(() => {
                            this.Log("Success in attacking target..", LOG_DEBUG);
                        }, (e) => {
                            this.Log("Error in attacking target", LOG_ERROR);
                            this.Log(e, LOG_ERROR);
                        })
                        .catch(errorInGame);

                    });

                    user.hook('clickedTile', user).after(() => {
                        this.distracted();
                    });

                    this.update = () => {
                        this.handlePendingEvents();
                        if (!this.doHook('update').pre()) return true;

                        // NOTE: The player combat system doesn't utilize any strategy since strategies are handled
                        // entirely on the server

                        let result = true;
                        if (!this.target) {
                            result = false;
                        }

                        this.doHook('update').post();
                        return result;
                    };

                },

                unload: () => {
                    if (!_.isUndefined(user)) user.unhook(this);
                    this.globalUnload();
                }
            };
        };

        Combat.prototype = Object.create(Instinct.prototype);
        Combat.prototype.constructor = Combat;

        return Combat;
    });
