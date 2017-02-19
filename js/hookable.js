define(() => {

    const AlwaysTrue = () => true;

    const Hook = function(name) {

        this.name      = name;
        this.preHooks  = [];
        this.postHooks = [];
        this.pre       = AlwaysTrue;
        this.post      = AlwaysTrue;


        // FIXME: before hook is removed, we must remove ourselves from objects which have hooked us. This is EXTREMELY
        // inefficient, there must be a better way!
        this.remove = function() {
            if (this.preHooks.length === 0 && this.postHooks.length === 0) return;
            let removed = false;
            for (let i = 0; i < this.preHooks.length; ++i) {
                const hookList = this.preHooks[i].listener._hookedInto[this.name]['pre'];
                if (hookList) {
                    for (let j = 0; j < hookList.length; ++j) {
                        if (hookList[j]._hooks[this.name] === this) {
                            hookList.splice(j, 1);
                            --j;
                            removed = true;
                        }
                    }
                }
            }

            for (let i = 0; i < this.postHooks.length; ++i) {
                const hookList = this.postHooks[i].listener._hookedInto[this.name]['post'];
                if (hookList) {
                    for (let j = 0; j < hookList.length; ++j) {
                        if (hookList[j]._hooks[this.name] === this) {
                            hookList.splice(j, 1);
                            --j;
                            removed = true;
                        }
                    }
                }
            }

            if (!removed) {
                throw Err(`Hook being removed but couldn't remove self from another hookable! (${this.name})`);
            }
        };

        this.setAHook = function(hookList, listener, handler) {
            for (let i = 0; i < hookList.length; ++i) {
                if (hookList[i].listener === listener) {
                    if (!handler) {
                        // Remove this hook
                        hookList.splice(i, 1);
                    } else {
                        hookList[i].handler = handler;
                    }
                    return;
                }
            }

            hookList.push({ listener, handler });
        };

        this.removeHooks = function(hookList, listener) {
            let removed = false;
            for (let i = 0; i < hookList.length; ++i) {
                if (hookList[i].listener === listener) {
                    hookList.splice(i, 1);
                    --i;
                    removed = true;
                }
            }
            return removed;
        };

        this.setPreHook = function(listener, handler) { this.setAHook(this.preHooks, listener, handler); };
        this.setPostHook = function(listener, handler) { this.setAHook(this.postHooks, listener, handler); };

        this.remPreHook = function(listener) { this.removeHooks(this.preHooks, listener); };
        this.remPostHook = function(listener) { this.removeHooks(this.postHooks, listener); };

        this.rebuildHandlers = function() {

            if (this.preHooks.length) {
                var self = this;
                this.pre = function() {
                    let result   = true,
                        numHooks = self.preHooks.length;
                    for (let i = 0; i < self.preHooks.length; ++i) {
                        const hooked = self.preHooks[i];
                        result &= hooked.handler.apply(hooked.listener, arguments); // FIXME: Avoid apply by using arrow functions
                        if (self.preHooks.length !== numHooks) {
                            // In case self listener spliced the hooks
                            numHooks = self.preHooks.length;
                            --i;
                        }
                    }
                    return result;
                };
            } else {
                this.pre = AlwaysTrue;
            }

            if (this.postHooks.length) {
                var self = this;
                this.post = function() {
                    let result   = true,
                        numHooks = self.postHooks.length;
                    for (let i = 0; i < self.postHooks.length; ++i) {
                        const hooked = self.postHooks[i];
                        result &= hooked.handler.apply(hooked.listener, arguments); // FIXME: Avoid apply by using arrow functions
                        if (self.postHooks.length !== numHooks) {
                            // In case self listener spliced the hooks
                            numHooks = self.postHooks.length;
                            --i;
                        }
                    }
                    return result;
                };
            } else  {
                this.post = AlwaysTrue;
            }
        };
    };

    const Hookable = {

        _hooks: {},

        // Emitting a hook that doesn't exist, or registering a hook twice can cause the hook system to throw exceptions
        // given the unexpected nature of not treating the hookable object exactly as intended. This can be a problem
        // for objects where we're more relaxed over these callbacks,
        //  eg. Character has a Levelling component which hooks the onKilled event to give XP. But if the Character is
        //      an NPC then he wouldn't have a levelling component, and may not have the hook onKilled registered.
        //      However we could still emit onKilled for characters regardless
        //
        // Relaxed mode prevents exceptions from being thrown when registering/unregistering hooks, or calling hooks
        _hookRelaxedMode: false,

        registerHook(name) {
            if (this._hooks[name]) {
                if (this._hookRelaxedMode) return;
                throw Err(`Hook (${name}) already registered`);
            }

            this._hooks[name] = new Hook(name);
        },

        unregisterHook(name) {
            if (!this._hooks[name]) return;

            this._hooks[name].remove();
            delete this._hooks[name];
        },

        unregisterAllHooks() {
            for (const name in this._hooks) {
                this.unregisterHook(name);
            }
        },

        // If Y is Hookable, and I hook one of Y's hooks, then I am a Hooker. This allows for automatically keeping
        // track of current hooks and automatically unloading those hooks when necessary
        //
        // NOTE: the Hookable is responsible for turning another object into a Hooker and appending to its hookedInto
        //          list
        setListenerFromHook(name, type, listener, hookable) {

            if (!(listener._hookedInto && listener.unhookAllHooks)) {
                listener._hookedInto = {};
                listener.unhookAllHooks = function() {
                    for (const hookName in listener._hookedInto) {
                        const hookableTypeList = listener._hookedInto[hookName];
                        for (const type in hookableTypeList) {
                            const hookableList = hookableTypeList[type];
                            for (let i = 0; i < hookableList.length; ++i) {
                                const hookable = hookableList[i];
                                hookable.hook(hookName, listener).remove();
                            }
                        }
                    }
                };
            }

            if (!listener._hookedInto.name) {
                listener._hookedInto[name] = {};
            }

            if (!listener._hookedInto[name].type) {
                listener._hookedInto[name][type] = [];
            }

            listener._hookedInto[name][type].push(hookable);
        },

        removeListenerFromHook(name, type, listener, hookable) {

            assert(listener._hookedInto || !listener.unhookAllHooks, `Listener wasn't extended to be a hooker with this hook: (${name})`);

            const hookTypes = listener._hookedInto[name];
            if (!hookTypes) throw Err(`Listener didn't have hook (${name}) already in _hookedInto list`);

            const hooks = listener._hookedInto[name][type];
            if (!hooks) throw Err(`Listener didn't have hook/type (${name}, ${type}) already in _hookedInto list`);

            for (let i = 0; i < hooks.length; ++i) {
                if (hooks[i] === hookable) {
                    hooks.splice(i, 1);
                    if (hooks.length === 0) {
                        delete listener._hookedInto[name][type];

                        if (_.isEmpty(listener._hookedInto[name])) {
                            delete listener._hookedInto[name];

                            if (_.isEmpty(listener._hookedInto)) {
                                delete listener._hookedInto;
                                delete listener.unhookAllHooks;
                            }
                        }
                    }
                    return;
                }
            }

            throw Err(`Listener didn't have me in hook list (${name})`);
        },

        hook(name, listener) {
            if (!this._hooks[name]) {
                if (this._hookRelaxedMode) {
                    this.registerHook(name);
                } else {
                    throw Err(`Hook (${name}) not registered`);
                }
            }

            if (!listener) listener = arguments.callee.caller; // TODO: is this a ptr to the object?
            const _hook = this._hooks[name],
                _hookable = this,

                setPreHook = function(handler) {

                    _hook.setPreHook(listener, handler);
                    _hook.rebuildHandlers();
                    _hookable.setListenerFromHook(name, 'pre', listener, _hookable);
                    return {
                        after: setPostHook
                    };
                },  setPostHook = function(handler) {
                    _hook.setPostHook(listener, handler);
                    _hook.rebuildHandlers();
                    _hookable.setListenerFromHook(name, 'post', listener, _hookable);
                },  remPreHook = function() {
                    const removed = _hook.remPreHook(listener);
                    _hook.rebuildHandlers();
                    if (removed) {
                        _hookable.removeListenerFromHook(name, 'pre', listener, _hookable);
                    }
                },  remPostHook = function() {
                    const removed = _hook.remPostHook(listener);
                    _hook.rebuildHandlers();
                    if (removed) {
                        _hookable.removeListenerFromHook(name, 'post', listener, _hookable);
                    }
                },  remBothHooks = function() {
                    remPreHook();
                    remPostHook();
                };

                return {
                    before: setPreHook,
                    after: setPostHook,

                    removePre: remPreHook,
                    removePost: remPostHook,
                    remove: remBothHooks
                };

        },

        doHook(name) {

            const _hook = this._hooks[name];
            if (!_hook) {
                // FIXME: Should we throw instead?
                if (this._hookRelaxedMode) {
                    return {
                        pre: function() {},
                        post: function() {},
                    };
                }

                console.error("NO HOOK REGISTERED AS ("+name+")");
                return; // NOTE: this will break anything attempting to call doHook without a registered hook
            }

            // FIXME: Can we do this without using apply?
            const callPreHook = function() {
                return _hook.pre.apply(_hook, arguments);
            },  callPostHook = function() {
                return _hook.post.apply(_hook, arguments);
            };

            return {
                pre: callPreHook,
                post: callPostHook
            };
        },

        // Completely remove this listener from any hooks they may have registered with us
        unhook(listener) {

            for (const id in this._hooks) {
                const hook = this._hooks[id];
                hook.remPreHook(listener);
                hook.remPostHook(listener);
                hook.rebuildHandlers();
            }
        },

        setHookRelaxedMode(enabled) {
            this._hookRelaxedMode = enabled;
        }
    };

    return Hookable;
});
