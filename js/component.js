define(() => {

    // NOTE: Communication between components is being done via. hooks (eg. Death system sends 'BuffedEvt' hook on
    // character to communicate to BuffMgr). The bonus is that we can safely communicate useless/discarded information
    // here (ie. something sends 'BuffedEvt'  yet character doesn't have BuffMgr, so evt is simply ignored). The other
    // bonus is that other things could listen to a buff being added, AND we could utilize the pre/post cancellation.
    // The problem is this is somewhat inefficient (creating data and sending useless evt, searching for hook), and may
    // cause unecessary overhead. This is something we can change later on if we like by simply finding the component
    // and communicating with it directly
    const Component = function(name) {

        assert(_.isString(name), "Initialized Component without a name");
        this.name = name;

        // Do we replicate this component to all players or only to the owner?
        this.replicateOwnerOnly = false;

        // Should this component be updated every step?
        // TODO: If this goes false and will likely be false for a while, then we should remove component from update
        // list. Then when this becomes true, run Character.ComponentNeedsUpdateChanged(this) to add it to step list
        this.needsUpdate = false;

        this.initialize = function() {
            const localPart = (Env.isServer ? this.server : this.client);
            let newInit = false;
            if (localPart) {
                if (typeof localPart === 'object') {
                    for (const key in localPart) {
                        if (key === 'initialize') newInit = true;
                        if (key === 'initialize' && this.hasOwnProperty(key)) {
                            const _preInitialize = this[key],
                                _postInitialize  = localPart[key];
                            this[key] = (function(){
                                _preInitialize.apply(this, arguments);
                                _postInitialize.apply(this, arguments);

                            });
                        } else {
                            this[key] = localPart[key];
                        }
                    }
                }
            }
            delete this.server;
            delete this.client;

            if (newInit) this.initialize();
        };

        // Restore this component from an earlier state
        // Server: If the user disconnects then comes back
        // Client: If the user zones between maps (NOTE: does not restore when you respawn)
        this.restore = function(component) {

        };

        // Restore this component from a provided state
        // This is only used for client, for restoring the component from the provided server state
        this.netRestore = function(component) {

        };

        this.netInitialize = function(component) {

        };

        // Serialize component to save
        // This is only used for server, for saving the component to the db
        this.serialize = function() {
            return {};
        };

        // Serialize component to players
        // This is only used for server, for serializing component to users
        // forOwner: Components can be netSerialized to the owner (eg. logging in), or to everyone in the region (eg.
        // user zones into a map)
        this.netSerialize = function(forOwner) {
            return {};
        };

        // Unload component
        // This is used for client, for unloading before we reload scripts so that we don't have stale components
        // listening to and responding to events
        this.unload = function() {

        };

        // First Time Setup
        // When we've created a new character and have nothing to restore from, this sets up our initial state
        this.firstTimeSetup = function() {

        };
    };

    return Component;
});
