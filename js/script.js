define(['loggable'], function(Loggable){

	var Subscription = function(){
		this.object = null;
		this.pre_handler = null;
		this.post_handler = null;
		this.handler = null;
		this.subscribers = [];
		this.owner = null;

		this.rebuildHandler = function(){
			var pre_handler = this.pre_handler,
				post_handler = this.post_handler,
				subscribers = this.subscribers;
			if (!pre_handler) pre_handler = new Function();
			if (!post_handler) post_handler = new Function();

			var self = this;
			this.handler = (function(){
				pre_handler.apply(self.owner, arguments);
				var toHandle = 1;
				for (var i=0; i<subscribers.length; ++i) {
					toHandle &= subscribers[i].handler.apply(subscribers[i].script, arguments);
				}
				if (toHandle) post_handler.apply(self.owner, arguments);
			});
		};
		this.addSubscriber = function(script, callback){
			this.subscribers.push({
				script: script,
				handler: callback
			});
		};
		this.removeSubscriber = function(script){
			if (script == this.owner) {
				this.pre_handler = null;
				this.post_handler = null;
			} else {
				for (var i=0; i<this.subscribers.length; ++i) {
					if (this.subscribers[i].script == script) {
						this.subscribers.splice(i, 1);
					}
				}
			}
		};
	};

	var Script = function(scriptRes){
		extendClass(this).with(Loggable);
		this.setLogGroup('Script');
		this.setLogPrefix('(Script) ');

		this._script = null;
		this.children = [];
		this.parent = null;
		this.initialized = false;
		this.getSubscription = function(obj, id){

			if (!this.subscriptions[id]) this.subscriptions[id] = [];
			var subID = this.subscriptions[id];
			for (var i=0; i<subID.length; ++i) {
				if (subID[i].object == obj) {
					return subID[i];
				}
			}

			var subscription = new Subscription();
			subscription.object = obj;
			subscription.owner = this;
			subID.push(subscription);
			return subscription;
		};
		this.listenTo = function(obj, id){

			var subscription = this.getSubscription(obj, id),
				script = this,
				setPreHandler = function(callback){

					this.pre_handler = callback;
					return { then: setHandler };
			},  setHandler = function(callback){

					this.post_handler = callback;
					this.rebuildHandler();
					script.parent.subscribe(obj, id, script, this.handler);
			};

			return {
				first: setPreHandler.bind(subscription),
				then: setHandler.bind(subscription)
			};
		};

		this.stopListeningTo = function(obj, id){
			this.unsubscribe(obj, id, this);
		};

		this.subscriptions = {};
		this.subscribe = function(obj, id, script, callback){
			var subscription = this.getSubscription(obj, id),
				newSubscription = false;
			if (!subscription.handler) {
				newSubscription = true;
			}
			subscription.addSubscriber(script, callback);
			subscription.rebuildHandler();

			this.parent.subscribe(obj, id, this, subscription.handler);
		};

		this.unsubscribe = function(obj, id, script){

			// Find subscription
			if (this.subscriptions[id]) {
				var subID = this.subscriptions[id];
				for (var i=0; i<subID.length; ++i) {
					if (subID[i].object == obj) {
						var subscription = subID[i];

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
							if (subID.length == 0) {
								delete this.subscriptions[id];
							}
						}

						return;
					}
				}
			}

		};

		this.ancestor = function(name){
			var _this = this;
			while (_this.parent){
				if (_this.parent.name == name) return _this.parent;
				_this = _this.parent;
			}
		};

		if (scriptRes) {
			// load script from script resource
			this._script = scriptRes;
			this.setLogPrefix('(Script - '+scriptRes.name+') ');
		} else {
			this._script = (new function(){
								this.name = "base",
								this.static = true,
								this.keys = [],
								this.components = { };
							});
			this.setLogPrefix('(Script - base) ');
		}

		this.addScript = function(script){
			if (!(script instanceof Script)) {
				script = new Script(script);
			}
			this.children.push(script);
			script.parent = this;
			return script._script;
		};

		this.removeScript = function(script){
			if (!(script instanceof Script)) {
				return new UnexpectedError("Provided script not a script");
			}

			for (var i=0; i<this.children.length; ++i) {
				if (this.children[i] == script) {
					this.children.splice(i, 1);
					return true;
				}
			}

			return new UnexpectedError("Could not find script");
		};

		// Inject client/server specific functionality from the script into itself
		this.localizeScript = function(script){
			var localPart = (Env.isServer ? script.server : script.client);
			if (localPart) {
				if (typeof localPart == 'object') {
					for (var key in localPart) {
						if (key == 'initialize' && script.hasOwnProperty(key)) {
							var _preInitialize = script[key],
								_postInitialize = localPart[key];
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

		this.initialize = function(){
			// initialize this script
			if (this.initialized) return;
			try {
				this.localizeScript(this._script);
				if (this._script.hasOwnProperty('initialize')) {
					this._script.initialize.bind(this)();
				}
			} catch(e){
				console.error(e);
				console.error(e.stack);
				return false;
			}

			for (var componentKey in this._script.components) {
				var component = (new this._script.components[componentKey]());
				this.localizeScript(component);
				if (component.hasOwnProperty('initialize')) {
					var result = component.initialize.bind(this)();
					if (result === false) return false;
				}
			}

			// initialize all child scripts
			for (var i=0; i<this.children.length; ++i) {
				var result = this.children[i].initialize();
				if (result === false) return false;
			}

			// The script is initialized once itself and all of its children have been initialized. This is an
			// important ordering of operations, since children may be added later on (when the script has
			// already been initialized), and will need to be initialized manually
			this.initialized = true;
		};

		this.unload = function(){

			// FIXME: unload components?
			
			for (var i=0; i<this.children.length; ++i) {
				this.children[i].unload();
			}

			// TODO: unload subscriptions

			// TODO: unload script: hookable, eventful, dynamic

			if (this._script.hasOwnProperty('unload')) {
				this._script.unload();
			}
			//this.stopAllEventsAndListeners();
		};
	};

	return Script;
});
