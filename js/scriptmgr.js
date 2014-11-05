define(['loggable', 'eventful', 'script'], function(Loggable, Eventful, Script){

	var ScriptMgr = function(){
		extendClass(this).with(Eventful);
		extendClass(this).with(Loggable);
		this.setLogGroup('ScriptMgr');
		this.setLogPrefix('(ScriptMgr) ');

		var Base = new Script();
		Base.parent = this;

		// Build script-tree
		for (var scriptKey in Resources.scripts) {
			var scriptRes = Resources.scripts[scriptKey],
				script = new Script(scriptRes);
			Base.addScript(script);
		}

		this.step = function(time){
			this.handlePendingEvents();
		};


		// Allow base script to subscribe to the ScriptMgr
		// We will listen to the (obj,id) and use Base script's callback
		this.subscriptions = {};
		this.subscribe = function(obj, id, script, callback){
			// Are we already listening to (obj,id) ?
			if (this.subscriptions[id]) {
				var subID = this.subscriptions[id];
				for (var i=0; i<subID.length; ++i) {
					if (subID[i] == obj) {
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
		};


		this.unsubscribe = function(obj, id, script){
			// TODO: support id==null (all id's on obj)
			if (!this.subscriptions[id]) return;
			var subID = this.subscriptions[id];
			for (var i=0; i<subID.length; ++i) {
				if (subID[i] == obj) {
					subID.splice(i, 1);
					break;
				}
			}

			this.stopListeningTo(obj, id);
		};

		// Startup
		Base.initialize();
	};

	return ScriptMgr;
});
