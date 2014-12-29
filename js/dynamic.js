define(function(){

	var Dynamic = {

		_dynamicHandles: {},

		registerHandler: function(id, name, options){
			if (!options)  options={};
			options = {
				hook: options.hook || false,
				event: options.event || false
			};

			var doNothing = function(){ return true; },
				preHandle = (options.hook ? this.doHook(options.hook).pre : doNothing),
				evtHandle = (options.event ? this.triggerEvent(options.event) : doNothing),
				postHandle = (options.hook ? this.doHook(options.hook).post : doNothing),
				_this     = this,
				_id       = id;
			
			var _dynamicHandler = {
				name: name,
				mainHandle: doNothing,
				handler: function(){
					if (!preHandle(arguments)) return;
					var result = _this._dynamicHandles[_id].mainHandle.apply(_this, arguments);//bind(this)(arguments); // FIXME: are we safe to use apply & this?
					evtHandle(arguments);
					postHandle(arguments);
					return result;
				}
			};
			this._dynamicHandles[id] = _dynamicHandler;
		},

		handler: function(id){
			var handle = this._dynamicHandles[id];

			if (!handle) {
				return null;
			}

			var setHandle   = function(callback){ handle.mainHandle = callback; },
				unsetHandle = function(){ handle.mainHandle = function(){ return true; }; };

			return {
				call: handle.handler,
				set: setHandle,
				unset: unsetHandle
			};
		},

	};

	return Dynamic;
});
