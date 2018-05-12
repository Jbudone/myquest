define(['loggable', 'eventful', 'script'], (Loggable, Eventful, Script) => {

    const ScriptMgr = function(restoreSettings) {

        extendClass(this).with(Eventful);
        extendClass(this).with(Loggable);

        this.setLogGroup('ScriptMgr');
        this.setLogPrefix('ScriptMgr');

        const Base = new Script();
        Base.parent = this;

        this.buildScript = (scriptData) => {
            const script = new scriptData.script();
            for (const componentID in scriptData.components) {
                script.components[componentID] = scriptData.components[componentID];
            }

            return new Script(script);
        };

        // Build script-tree
        for (const scriptKey in Resources.scripts) {
            const scriptRes = Resources.scripts[scriptKey];
            if (!scriptRes.script) continue;

            const _script = this.buildScript(scriptRes),
                hookInto  = _script._script._hookInto;

            if (hookInto === HOOK_INTO_MAP) {

                if (Env.isServer) {
                    for (const areaID in The.scripting.world.areas) {
                        const script = this.buildScript(scriptRes);
                        script.hookInto = The.scripting.world.areas[areaID];
                        Base.addScript(script);
                    }
                } else {
                    _script.hookInto = The.scripting.area;
                    Base.addScript(_script);
                }

            } else {
                Base.addScript(_script);
            }

        }

        this.step = (time) => {
            this.handlePendingEvents();
        };


        // Allow base script to subscribe to the ScriptMgr
        // We will listen to the (obj,id) and use Base script's callback
        this.subscriptions = {};
        this.subscribe = (obj, id, script, callback) => {
            // Are we already listening to (obj,id) ?
            if (this.subscriptions[id]) {
                const subID = this.subscriptions[id];
                for (let i = 0; i < subID.length; ++i) {
                    if (subID[i] === obj) {
                        // Base is already listening to this (obj,id)!
                        this.Log("Base is trying to listen to the same (obj,id) twice!", LOG_ERROR);
                        return false;
                    }
                }
            }

            // add to subscription list
            if (!this.subscriptions[id]) this.subscriptions[id] = [];
            this.subscriptions[id] = script;
            this.listenTo(obj, id, callback);
            return true;
        };


        this.unsubscribe = (obj, id, script) => {
            // TODO: support id==null (all id's on obj)
            if (!this.subscriptions[id]) return;
            const subID = this.subscriptions[id];
            for (let i = 0; i < subID.length; ++i) {
                if (subID[i] === obj) {
                    subID.splice(i, 1);
                    break;
                }
            }

            this.stopListeningTo(obj, id);
        };

        this.unload = () => {
            const unloadSettings = Base.unload();
            this.unloadListener();

            return unloadSettings;
        };

        // Startup
        Base.initialize(restoreSettings);
    };

    return ScriptMgr;
});
