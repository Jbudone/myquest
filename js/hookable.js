define(function(){

	var AlwaysTrue = function(){ return true; };
	var Hook = function(name){

		this.name = name;
		this.preHooks = [];
		this.postHooks = [];
		this.pre = AlwaysTrue;
		this.post = AlwaysTrue;

		this.setAHook = function(hookList, listener, handler){
			for (var i=0; i<hookList.length; ++i) {
				if (hookList[i].listener == listener) {
					if (!handler) {
						// Remove this hook
						hookList.splice(i, 1);
					} else {
						hookList[i].handler = handler;
					}
					return;
				}
			}

			hookList.push({
				listener: listener,
				handler: handler
			});
		};

		this.removeHooks = function(hookList, listener){
			for (var i=0; i<hookList.length; ++i) {
				if (hookList[i].listener == listener) {
					hookList.splice(i, 1);
					--i;
				}
			}
		};

		this.setPreHook = function(listener, handler){
			this.setAHook(this.preHooks, listener, handler);
		};

		this.setPostHook = function(listener, handler){
			this.setAHook(this.postHooks, listener, handler);
		};

		this.remPreHook = function(listener){
			this.removeHooks(this.preHooks, listener);
		};

		this.remPostHook = function(listener){
			this.removeHooks(this.postHooks, listener);
		};

		this.rebuildHandlers = function(){
			if (this.preHooks.length) {
				var _self = this;
				this.pre = (function(){
					var result = true,
						numHooks = _self.preHooks.length;
					for (var i=0; i<_self.preHooks.length; ++i) {
						var hooked = _self.preHooks[i];
						result &= hooked.handler.apply(hooked.listener, arguments);
						if (_self.preHooks.length!=numHooks) {
							// In case this listener spliced the hooks
							numHooks = _self.preHooks.length;
							--i;
						}
					}
					return result;
				});
			} else this.pre = AlwaysTrue;

			if (this.postHooks.length) {
				var _self = this;
				this.post = (function(){
					var result = true,
						numHooks = _self.postHooks.length;
					for (var i=0; i<_self.postHooks.length; ++i) {
						var hooked = _self.postHooks[i];
						result &= hooked.handler.apply(hooked.listener, arguments);
						if (_self.postHooks.length!=numHooks) {
							// In case this listener spliced the hooks
							numHooks = _self.postHooks.length;
							--i;
						}
					}
					return result;
				});
			} else this.post = AlwaysTrue;
		};
	};

	var Hookable = {

		_hooks:{},

		registerHook: function(name){
			if (this._hooks[name]) {
				console.error("ERROR! HOOK ("+name+") ALREADY DEFINED!");
				return new Error("Hook ("+ name +") already registered");
			}

			this._hooks[name] = new Hook(name);
		},

		unregisterHook: function(name){
			if (!this._hooks.hasOwnProperty(name)) return;

			delete this._hooks[name];
		},

		hook: function(name, listener){
			if (!this._hooks[name]) {
				console.error("ERROR! HOOK NOT AVAILABLE ("+name+")");
				return new Error("Hook ("+ name +") not registered");
			}

			if (!listener) listener = arguments.callee.caller; // TODO: is this a ptr to the object?
			var _hook = this._hooks[name],

				setPreHook = function(handler){

					_hook.setPreHook(listener, handler);
					_hook.rebuildHandlers();
					return {
						after: setPostHook
					};
			},  setPostHook = function(handler){
					_hook.setPostHook(listener, handler);
					_hook.rebuildHandlers();
			},  remPreHook = function(){
					_hook.remPreHook(listener);
					_hook.rebuildHandlers();
			},	remPostHook = function(){
					_hook.remPostHook(listener);
					_hook.rebuildHandlers();
			},	remBothHooks = function(){
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

		doHook: function(name){
			
			var _hook = this._hooks[name];
			if (!_hook) {
				console.error("NO HOOK REGISTERED AS ("+name+")");
				return; // NOTE: this will break anything attempting to call doHook without a registered hook
			}

			var callPreHook = function(){
				return _hook.pre.apply(_hook, arguments);
			},  callPostHook = function(){
				return _hook.post.apply(_hook, arguments);
			};

			return {
				pre: callPreHook,
				post: callPostHook
			};
		},

		// Completely remove this listener from any hooks they may have registered with us
		unhook: function(listener){

			for (var id in this._hooks) {
				var hook = this._hooks[id];
				hook.remPreHook(listener);
				hook.remPostHook(listener);
				hook.rebuildHandlers();
			}
		}
	};

	return Hookable;
});
