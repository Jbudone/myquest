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

		this.setPreHook = function(listener, handler){
			this.setAHook(this.preHooks, listener, handler);
		};

		this.setPostHook = function(listener, handler){
			this.setAHook(this.postHooks, listener, handler);
		};

		this.rebuildHandlers = function(){
			if (this.preHooks.length) {
				var _self = this;
				this.pre = (function(){
					var result = true;
					for (var i=0; i<_self.preHooks.length; ++i) {
						var hooked = _self.preHooks[i];
						result &= hooked.handler.apply(hooked.listener, arguments);
					}
					return result;
				});
			} else this.pre = AlwaysTrue;

			if (this.postHooks.length) {
				var _self = this;
				this.post = (function(){
					var result = true;
					for (var i=0; i<_self.postHooks.length; ++i) {
						var hooked = _self.postHooks[i];
						result &= hooked.handler.apply(hooked.listener, arguments);
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
				return false;
			}

			this._hooks[name] = new Hook(name);
		},

		hook: function(name, listener){
			if (!this._hooks[name]) {
				console.error("ERROR! HOOK NOT AVAILABLE ("+name+")");
				return false;
			}

			if (!listener) listener = arguments.callee.caller; // TODO: is this a ptr to the object?
			var _hook = this._hooks[name],

				setPreHook = function(handler){

					_hook.setPreHook(listener, handler);
					_hook.rebuildHandlers();
					return {
						then: setPostHook
					};
			},  setPostHook = function(handler){

					_hook.setPostHook(listener, handler);
					_hook.rebuildHandlers();
			};

			return {
				first: setPreHook,
				then: setPostHook
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
		}
	};

	return Hookable;
});
