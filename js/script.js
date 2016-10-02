define(['loggable'], (Loggable) => {

    const Subscription = function() {
        this.object       = null;
        this.pre_handler  = null;
        this.post_handler = null;
        this.handler      = null;
        this.subscribers  = [];
        this.owner        = null;

        this.rebuildHandler = () => {
            let pre_handler  = this.pre_handler,
                post_handler = this.post_handler,
                subscribers  = this.subscribers;
            if (!pre_handler) pre_handler   = function(){};
            if (!post_handler) post_handler = function(){};

            // FIXME: Can we avoid apply somehow?
            this.handler = function() {
                pre_handler.apply(this.owner, arguments);
                let toHandle = 1;
                for (let i = 0; i < subscribers.length; ++i) {
                    toHandle &= subscribers[i].handler.apply(subscribers[i].script, arguments);
                }
                if (toHandle) post_handler.apply(this.owner, arguments);
            }.bind(this); // FIXME: Get rid of bind when we have a replacement answer for arguments
        };

        this.addSubscriber = (script, callback) => {
            this.subscribers.push({ script, handler: callback });
        };

        this.removeSubscriber = (script) => {
            if (script === this.owner) {
                this.pre_handler  = null;
                this.post_handler = null;
            } else {
                for (let i = 0; i < this.subscribers.length; ++i) {
                    if (this.subscribers[i].script === script) {
                        this.subscribers.splice(i, 1);
                    }
                }
            }
        };
    };

    const Script = function(scriptRes) {
        extendClass(this).with(Loggable);
        this.setLogGroup('Script');
        this.setLogPrefix('Script');

        this._script     = null;
        this.children    = [];
        this.components  = [];
        this.parent      = null;
        this.initialized = false;

        this.getSubscription = (obj, id) => {

            if (!this.subscriptions[id]) this.subscriptions[id] = [];
            const subID = this.subscriptions[id];
            for (let i = 0; i < subID.length; ++i) {
                if (subID[i].object === obj) {
                    return subID[i];
                }
            }

            const subscription = new Subscription();
            subscription.object = obj;
            subscription.owner = this;
            subID.push(subscription);
            return subscription;
        };

        this.listenTo = (obj, id) => {

            const subscription = this.getSubscription(obj, id),
                script = this,
                setPreHandler = function(callback) {

                    this.pre_handler = callback;
                    return { after: setHandler };
                },  setHandler = function(callback){

                    this.post_handler = callback;
                    this.rebuildHandler();
                    script.parent.subscribe(obj, id, script, this.handler);
                };

                return {
                    before: setPreHandler.bind(subscription),
                    after: setHandler.bind(subscription)
                };
        };

        this.stopListeningTo = (obj, id) => {
            this.unsubscribe(obj, id, this);
        };

        this.subscriptions = {};
        this.subscribe = (obj, id, script, callback) => {
            const subscription = this.getSubscription(obj, id);
            let newSubscription = false;
            if (!subscription.handler) {
                newSubscription = true;
            }
            subscription.addSubscriber(script, callback);
            subscription.rebuildHandler();

            this.parent.subscribe(obj, id, this, subscription.handler);
        };

        this.unsubscribe = (obj, id, script) => {

            // Find subscription
            if (this.subscriptions[id]) {
                const subID = this.subscriptions[id];
                for (let i = 0; i < subID.length; ++i) {
                    if (subID[i].object === obj) {
                        const subscription = subID[i];

                        // Remove script
                        subscription.removeSubscriber(script);

                        if (subscription.subscribers.length ||
                            subscription.pre_handler ||
                            subscription.post_handler) {

                            subscription.rebuildHandler();
                        } else {
                            // Nobody is using this (obj,id); remove the subscription
                            this.parent.unsubscribe(obj, id, this);
                            subID.splice(i, 1);
                            if (subID.length === 0) {
                                delete this.subscriptions[id];
                            }
                        }

                        return;
                    }
                }
            }

        };

        this.ancestor = (name) => {
            let _this = this;
            while (_this.parent) {
                if (_this.parent.name === name) return _this.parent;
                _this = _this.parent;
            }

            return null;
        };

        if (scriptRes) {
            // load script from script resource
            this._script = scriptRes;
            this.setLogPrefix(`script.${scriptRes.name}`);
            this.setLogColor('script');
        } else {
            this._script = (new function() {
                this.name       = "base",
                this.static     = true,
                this.keys       = [],
                this.components = { };
            });
            this.setLogPrefix('script.base');
            this.setLogColor('script');
        }

        this.addScript = (script) => {
            if (!(script instanceof Script)) {
                script = new Script(script);
            }
            this.children.push(script);
            script.parent = this;
            return script._script;
        };

        this.removeScript = (script) => {
            assert(script instanceof Script, "Provided script not a script");

            for (let i = 0; i < this.children.length; ++i) {
                if (this.children[i] === script) {
                    this.children.splice(i, 1);
                    return true;
                }
            }

            throw Err("Could not find script");
        };

        // Inject client/server specific functionality from the script into itself
        this.localizeScript = (script) => {
            const localPart = (Env.isServer ? script.server : script.client);
            if (localPart) {
                if (typeof localPart === 'object') {
                    for (const key in localPart) {
                        if (key === 'initialize' && script.hasOwnProperty(key)) {
                            const _preInitialize = script[key],
                                _postInitialize  = localPart[key];
                            script[key] = (function(){
                                _preInitialize.apply(this, arguments);
                                _postInitialize.apply(this, arguments);

                            });
                        } else {
                            script[key] = localPart[key];
                        }
                    }
                }
            }
            delete script.server;
            delete script.client;
        };

        this.initialize = () => {
            // initialize this script
            if (this.initialized) return true;
            this.localizeScript(this._script);
            if (this._script.initialize) {
                this._script.initialize.bind(this)();
            }

            for (const componentKey in this._script.components) {
                const component = (new this._script.components[componentKey]());
                this.localizeScript(component);
                if (component.initialize) {
                    const result = component.initialize.bind(this)();
                    if (result === false) return false;
                }
                this.components.push(component);
            }

            // initialize all child scripts
            for (let i = 0; i < this.children.length; ++i) {
                const result = this.children[i].initialize();
                if (result === false) return false;
            }

            // The script is initialized once itself and all of its children have been initialized. This is an
            // important ordering of operations, since children may be added later on (when the script has
            // already been initialized), and will need to be initialized manually
            this.initialized = true;
            return true;
        };

        this.unload = () => {

            for (let i = 0; i < this.components.length; ++i) {
                const component = this.components[i];
                if (component.unload) {
                    component.unload();
                }
            }

            for (let i = 0; i < this.children.length; ++i) {
                this.children[i].unload();
            }

            // TODO: unload subscriptions

            // TODO: unload script: hookable, eventful, dynamic

            if (this._script.unload) {
                this._script.unload();
            }
            //this.stopAllEventsAndListeners();
        };
    };

    return Script;
});
