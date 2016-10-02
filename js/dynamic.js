define(() => {

    const Dynamic = {

        _dynamicHandles: {},

        registerHandler(id, name, options) {
            if (!options)  options = {};
            options = {
                hook: options.hook || false,
                event: options.event || false
            };

            const doNothing = function() { return true; },
                preHandle   = (options.hook ? this.doHook(options.hook).pre : doNothing),
                evtHandle   = (options.event ? this.triggerEvent(options.event) : doNothing),
                postHandle  = (options.hook ? this.doHook(options.hook).post : doNothing),
                _this       = this,
                _id         = id;

            const _dynamicHandler = {
                name,
                mainHandle: doNothing,
                handler() {
                    // FIXME: Find a way to do this without using arguments or apply
                    if (!preHandle(arguments)) return;
                    var result = _this._dynamicHandles[_id].mainHandle.apply(_this, arguments);//bind(this)(arguments); // FIXME: are we safe to use apply & this?
                    evtHandle(arguments);
                    postHandle(arguments);
                    return result;
                }
            };
            this._dynamicHandles[id] = _dynamicHandler;
        },

        handler(id) {
            const handle = this._dynamicHandles[id];

            if (!handle) {
                return null;
            }

            const setHandle = function(callback){ handle.mainHandle = callback; },
                unsetHandle = function(){ handle.mainHandle = function(){ return true; }; };

            return {
                call: handle.handler,
                set: setHandle,
                unset: unsetHandle
            };
        }
    };

    return Dynamic;
});
