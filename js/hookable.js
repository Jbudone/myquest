define(function(){

	var AlwaysTrue = function(){ return true; };
	var Hook = function(name){

		this.name = name;
		this.preHooks = [];
		this.postHooks = [];
		this.pre = AlwaysTrue;
		this.post = AlwaysTrue;


		// FIXME: before hook is removed, we must remove ourselves from objects which have hooked us. This is
		// EXTREMELY inefficient, there must be a better way!
		this.remove = function(){
			if (this.preHooks.length == 0 && this.postHooks.length == 0) return;
			var removed = false;
			for (var i=0; i<this.preHooks.length; ++i) {
				var hookList = this.preHooks[i].listener._hookedInto[this.name]['pre'];
				if (hookList) {
					for (var j=0; j<hookList.length; ++j) {
						if (hookList[j]._hooks[this.name] == this) {
							hookList.splice(j, 1);
							--j;
							removed = true;
						}
					}
				}
			}
			for (var i=0; i<this.postHooks.length; ++i) {
				var hookList = this.postHooks[i].listener._hookedInto[this.name]['post'];
				if (hookList) {
					for (var j=0; j<hookList.length; ++j) {
						if (hookList[j]._hooks[this.name] == this) {
							hookList.splice(j, 1);
							--j;
							removed = true;
						}
					}
				}
			}

			if (!removed) {
				throw new Error("Hook being removed but couldn't remove self from another hookable! ("+ this.name +")");
			}
		};

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
			var removed=false;
			for (var i=0; i<hookList.length; ++i) {
				if (hookList[i].listener == listener) {
					hookList.splice(i, 1);
					--i;
					removed=true;
				}
			}
			return removed;
		};

		this.setPreHook = function(listener, handler){
			this.setAHook(this.preHooks, listener, handler);
		};

		this.setPostHook = function(listener, handler){
			this.setAHook(this.postHooks, listener, handler);
		};

		this.remPreHook = function(listener){
			return this.removeHooks(this.preHooks, listener);
		};

		this.remPostHook = function(listener){
			return this.removeHooks(this.postHooks, listener);
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

			this._hooks[name].remove();
			delete this._hooks[name];
		},

		unregisterAllHooks: function(){
			for (var name in this._hooks) {
				this.unregisterHook(name);
			}
		},

		// If Y is Hookable, and I hook one of Y's hooks, then I am a Hooker. This allows for automatically
		// keeping track of current hooks and automatically unloading those hooks when necessary
		//
		// NOTE: the Hookable is responsible for turning another object into a Hooker and appending to its
		// 			hookedInto list
		setListenerFromHook: function(name, type, listener, hookable){

			if (!(listener.hasOwnProperty('_hookedInto') && listener.hasOwnProperty('unhookAllHooks'))) {
				listener._hookedInto = {};
				listener.unhookAllHooks = function(){
					for (var hookName in this._hookedInto) {
						var hookableTypeList = this._hookedInto[hookName];
						for (var type in hookableTypeList) {
							var hookableList = hookableTypeList[type];
							for (var i=0; i<hookableList.length; ++i) {
								var hookable = hookableList[i];
								hookable.hook(hookName, this).remove();
							}
						}
					}
				}.bind(listener);
			}

			if (!listener._hookedInto.hasOwnProperty(name)) {
				listener._hookedInto[name] = {};
			}

			if (!listener._hookedInto[name].hasOwnProperty(type)) {
				listener._hookedInto[name][type] = [];
			}

			listener._hookedInto[name][type].push(hookable);
		},

		removeListenerFromHook: function(name, type, listener, hookable){

			if (!(listener.hasOwnProperty('_hookedInto') && listener.hasOwnProperty('unhookAllHooks'))) throw new Error("Listener wasn't extended to be a hooker with this hook: ("+ name +")");

			var hookTypes = listener._hookedInto[name];
			if (!hookTypes) throw new Error("Listener didn't have hook ("+ name +") already in _hookedInto list");

			var hooks = listener._hookedInto[name][type];
			if (!hooks) throw new Error("Listener didn't have hook/type ("+ name +","+ type +") already in _hookedInto list");
			for (var i=0; i<hooks.length; ++i) {
				if (hooks[i] == hookable) {
					hooks.splice(i, 1);
					if (hooks.length == 0) {
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

			throw new Error("Listener didn't have me in hook list ("+ name +")");
		},

		hook: function(name, listener){
			if (!this._hooks[name]) {
				console.error("ERROR! HOOK NOT AVAILABLE ("+name+")");
				return new Error("Hook ("+ name +") not registered");
			}

			if (!listener) listener = arguments.callee.caller; // TODO: is this a ptr to the object?
			var _hook = this._hooks[name],
				_hookable = this,

				setPreHook = function(handler){

					_hook.setPreHook(listener, handler);
					_hook.rebuildHandlers();
					_hookable.setListenerFromHook(name, 'pre', listener, _hookable);
					return {
						after: setPostHook
					};
			},  setPostHook = function(handler){
					_hook.setPostHook(listener, handler);
					_hook.rebuildHandlers();
					_hookable.setListenerFromHook(name, 'post', listener, _hookable);
			},  remPreHook = function(){
					var removed = _hook.remPreHook(listener);
					_hook.rebuildHandlers();
					if (removed) {
						_hookable.removeListenerFromHook(name, 'pre', listener, _hookable);
					}
			},	remPostHook = function(){
					var removed = _hook.remPostHook(listener);
					_hook.rebuildHandlers();
					if (removed) {
						_hookable.removeListenerFromHook(name, 'post', listener, _hookable);
					}
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
