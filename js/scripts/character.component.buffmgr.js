define(['SCRIPTINJECT', 'loggable', 'component'], (SCRIPTINJECT, Loggable, Component) => {

    /* SCRIPTINJECT */

    const BuffEvt = 'BuffEvt';

    if (!Env.isServer) {
    }

    const Buff = function(buffRes) {
        this.buffRes  = buffRes;
        this.base     = new buffRes.base(); // FIXME: I wonder if we could get away with a completely static buff base?
        this.timer    = null;
        this.modified = null;
        this.id       = null;

        this.activate = (character, modified) => {

            this.modified = this.base.activate(character, buffRes.args, modified);

            // TODO: Find a better way to setup state of buff from options
            this.timer = buffRes.args.options.duration;
        };

        if (Env.isServer) {

            this.deactivate = (character) => {
                this.modified = this.base.deactivate(character, buffRes.args, this.modified);
            };
        } else {
            this.deactivate = (character, modified) => {
                this.modified = modified;
                this.base.deactivate(character, buffRes.args, this.modified);
            };

            // Pseudo Active
            // Since there could be some lag/delay for receiving the BUFF_REMOVED event, it would be nice to pseudo
            // remove it locally. Essentially removing the effect and hiding the buff
            this.pseudoActive = true;
            this.pseudoDeactivate = () => {
                this.pseudoActive = false;
            };
        }

        this.serialize = () => {
            const data = {
                buffRes: this.buffRes.id,
                id: this.id,
                timer: this.timer,
                modified: _.clone(this.modified)
            };

            // NOTE: We should be careful about serializing extra client-side stuff since in some cases they may not
            // transfer over (eg. respawning since we netInitialize instead).
            if (!Env.isServer) {

                // If this doesn't transfer over then we're netInitializing which means we're still active, so default
                // pseudoActive === true
                data.pseudoActive = this.pseudoActive;
            }

            return data;
        };

        this.restore = (component) => {
            this.id = component.id;
            this.timer = component.timer;
            this.modified = component.modified;

            if (!Env.isServer) {
                if ('pseudoActive' in component) {
                    this.pseudoActive = component.pseudoActive;
                }
            }
        };
    };

    // AddBuff (activate), Restore (don't activate), NetRestore (don't activate)
    const BuffMgr = function(character) {

        Component.call(this, 'buffmgr');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`BuffMgr: ${character.entity.id}`);

        this.buffs = [];

        let maxID = 0;

        // Common serialization
        this.commonSerialize = () => {

            const data = {
                buffs: []
            };

            for (let i = 0; i < this.buffs.length; ++i) {
                const buff = this.buffs[i];

                data.buffs.push(buff.serialize());
            }

            return data;
        };

        this.commonRestore = (component) => {

            let activeEffects = null;
            if (!Env.isServer) {
                activeEffects = UI.getEffects();
            }

            for (let i = 0; i < component.buffs.length; ++i) {
                const compBuff = component.buffs[i],
                    buffRes = Buffs[compBuff.buffRes];

                const buff = new Buff(buffRes);
                buff.restore(compBuff);

                this.buffs.push(buff);

                if (Env.isServer) {
                    // We're restoring our buffs, possibly (though this should never happen) out of order. We should
                    // update our maxID to what it could have been before
                    maxID = Math.max(maxID, buff.id + 1);

                    // TODO: What happens if we restore a buff with id === MAX_SAFE_INTEGER, we set our maxID to that.
                    // Our next buff restored is id === 0, so how do we determine that we've looped over? Perhaps its
                    // worth it to store our maxID as well
                } else {
                    // Client: this restored buff may or may not have been added before; in other words the effect
                    // associated with the buff may or may not have been activated. Check if we need to activate it here
                    let associatedEffect = null;
                    for (let i = 0; i < activeEffects.length; ++i) {
                        const effect = activeEffects[i];
                        if (_.isFinite(effect.data.buffID) && effect.data.buffID === buff.id) {
                            associatedEffect = effect;
                            break;
                        }
                    }

                    // No associated effect found for this buff? Its likely the buff was added while we didn't have this
                    // component running, and that we're hitting it in netInitialize
                    if (!associatedEffect) {

                        // FIXME: Should abstract effect adding
                        const effect = UI.addEffect({
                            effectType: EFFECT_BUFF,
                            data: {
                                effects: buffRes.effects,
                                buffID: buff.id
                            }
                        });
                    }
                }
            }
        };

        this.server = {

            initialize() {

                character.hook(BuffEvt, this).after(function(data){
                    const buff = new Buff(data.buff);

                    // TODO: What if we already have the buff? Should check if it stacks then stack accordingly
                    this.buffs.push(buff);
                    buff.activate(character);
                    buff.id = maxID;
                    ++maxID;

                    if (maxID >= Number.MAX_SAFE_INTEGER) {
                        maxID = 0;
                    }

                    // Forward Buff to player
                    if (character.entity.player && character.alive) {

                        // TODO: We could probably cleanup the modified stuff in buff (buff.netSerialize?) to send less
                        // data
                        character.entity.player.send(EVT_BUFFED_PRIVATE, {
                            buff: data.buff.id,
                            modified: buff.modified,
                            id: buff.id
                        });
                    }

                    // TODO: (Possibly?) Broadcast Buff to everyone else -- Could have this as a property on buff to
                    // determine whether or not its worth broadcasting. Also could send different information

                });
            },

            needsUpdate: true,

            step(delta) {

                for (let i = 0; i < this.buffs.length; ++i) {
                    const buff = this.buffs[i];
                    if ((buff.timer -= delta) <= 0) {
                        buff.deactivate(character);


                        // Forward Buff Removal to player
                        if (character.entity.player) {

                            // TODO: We could probably cleanup the modified stuff in buff (buff.netSerialize?) to send less
                            // data
                            character.entity.player.send(EVT_BUFF_REMOVED_PRIVATE, {
                                buff: buff.buffRes.id,
                                modified: buff.modified,
                                id: buff.id
                            });
                        }

                        this.buffs.splice(i, 1);
                        --i;
                    }
                }
            },

            netSerialize() {
                return this.commonSerialize();
            },

            serialize() {
                return this.commonSerialize();
            },

            restore(component) {
                this.commonRestore(component);
            }
        };

        this.client = {

            initialize() {

                character.hook(BuffEvt, this).after(function(data){
                    UI.postMessage(`Buffed`, MESSAGE_GOOD);
                });

                server.registerHandler(EVT_BUFFED_PRIVATE, 'character.buffmgr');
                server.handler(EVT_BUFFED_PRIVATE).set((evt, data) => {
                    UI.postMessage(`I have been Buffed`);

                    // NOTE: Adding buffs on the client works a little different than the server. To avoid any mismatch issues,
                    // we read the changes in from the server data, and change our current state to match that
                    const buffRes = Buffs[data.buff];
                    const buff = new Buff(buffRes);

                    // TODO: What if we already have the buff? Should check if it stacks then stack accordingly
                    this.buffs.push(buff);
                    buff.activate(character, data.modified);
                    this.buffs[this.buffs.length-1].id = data.id;

                    // FIXME: also need to include buff state (data.buff.state ? build state here?)
                    const effect = UI.addEffect({
                        effectType: EFFECT_BUFF,
                        data: {
                            effects: buffRes.effects,
                            buffID: buff.id
                        }
                    });
                });

                server.registerHandler(EVT_BUFF_REMOVED_PRIVATE, 'character.buffmgr');
                server.handler(EVT_BUFF_REMOVED_PRIVATE).set((evt, data) => {
                    UI.postMessage(`Buff has been removed`);

                    let localBuff = null;
                    for (let i = 0; i < this.buffs.length; ++i) {
                        if (this.buffs[i].id === data.id) {
                            localBuff = this.buffs[i];
                            this.buffs.splice(i, 1);
                            break;
                        }
                    }

                    localBuff.deactivate(character, data.modified);

                    const activeEffects = UI.getEffects();
                    for (let i = 0; i < activeEffects.length; ++i) {
                        const effect = activeEffects[i];
                        if (_.isFinite(effect.data.buffID) && effect.data.buffID === localBuff.id) {
                            UI.removeEffect(effect.effectID);
                        }
                    }
                });
            },

            needsUpdate: true,

            step(delta) {

                // For better responsiveness we should update buff timers here and run pseudo updates locally (eg.
                // pseudo remove buff after timer finishes)
                for (let i = 0; i < this.buffs.length; ++i) {
                    const buff = this.buffs[i];
                    if (buff.pseudoActive) {
                        if ((buff.timer -= delta) <= 0) {
                            buff.pseudoDeactivate(character);

                            const activeEffects = UI.getEffects();
                            for (let i = 0; i < activeEffects.length; ++i) {
                                const effect = activeEffects[i];
                                if (_.isFinite(effect.data.buffID) && effect.data.buffID === localBuff.id) {
                                    UI.removeEffect(effect.effectID);
                                }
                            }
                        }
                    }
                }
            },

            serialize() {
                return this.commonSerialize();
            },

            restore(component) {
                this.commonRestore(component);
            },

            netRestore(component) {
                this.commonRestore(component);
            },

            netInitialize(component) {
                this.netRestore(component);
            },

            unload() {
                server.handler(EVT_BUFF_REMOVED_PRIVATE).unset();
                server.handler(EVT_BUFFED_PRIVATE).unset();
            }
        };
    };


    BuffMgr.prototype = Object.create(Component.prototype);
    BuffMgr.prototype.constructor = BuffMgr;

    const initialState = {
        buffs: []
    };

    return {
        name: "BuffManager",
        newInstance: function(character){ return new BuffMgr(character); },
        initialState: initialState
    };
});
