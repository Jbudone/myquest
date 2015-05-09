
define(function(){

	// TODO: remove HIGH_PRIORITY and switch to DELAY or LOW_PRIORITY where necessary; default is HIGH_PRIORITY
	// TODO: rename stopAllEventsAndListeners to stopAllEvents
	// TODO: provide unload for eventful
	var Eventful = {

		evtListeners:{}, // Objects listening to us {evtid: [obj, obj, ..], evtid: ..}
		pendingEvents:[], // List of events we're listening to that have been triggered but not yet handled
		currentlyTriggeringEvent:false,
		pendingOperations:[],
		listeningTo:[], // [{obj, id, ..}, ..]

		// Stop all event handling. For any objects that are currently listening to us under any id, inform
		// them that we're stopping the event handler. This includes any pending events.
		stopAllEventsAndListeners:function(){
			this.pendingEvents=[];

			// Remove all of our event listeners
			// Also need to remove from the listener's listeningTo list so that they don't reference these
			// events anymore
			for (var id in this.evtListeners) {
				var evtListenersList = this.evtListeners[id];
				for (var i=0; i<evtListenersList.length; ++i) {
					var evtListener = evtListenersList[i];
					evtListener.onRemove.listener(); // Remove from the listener's side
				}
			}
			this.evtListeners={};
		},

		triggerEvent:function(id){
			this.currentlyTriggeringEvent=true;
			if (this.evtListeners[id]) {
				var me=this,
					evtArgs=arguments;
				_.each(this.evtListeners[id],function(listener){
					if (!listener) return; // We've stopped listening to this already when this triggered maybe?
					var args=[me];
					for(var i=1; i<evtArgs.length; ++i) {
						args.push(evtArgs[i]);
					}
					if (listener.priority == HIGH_PRIORITY) {
						listener.callback.apply( listener.caller, args );
					} else {
						if (listener.caller.pendingEvents) {
							// FIXME: dont add callback; add listener object instead (so that if the object
							// changes itself later on, we don't have to search through pendingEvents to
							// update the listener object or callback)
							listener.caller.pendingEvents.push( {args:args, callback:listener.callback} );
						} else {
							listener.callback.apply( listener.caller, args );
						}
					}
				});
			}
			this.currentlyTriggeringEvent=false;
			for (var i=0; i<this.pendingOperations.length; ++i) {
				var operation = this.pendingOperations[i];
				operation.callback.apply(operation.context, operation.args);
			}
			this.pendingOperations=[];
		},

		handlePendingEvents:function(){
			for (var i=0; i<this.pendingEvents.length; ++i) {
				var handler = this.pendingEvents[i];
				handler.callback.apply( this, handler.args );
			}
			this.pendingEvents=[];
		},

		
		addEventListener:function(id,context,callback,priority){
			if (!this.evtListeners[id]) this.evtListeners[id]=[];


			// Assertion testing
			//
			// Is this new event listener a duplicate of one we already had before? We're checking that the
			// function callbacks are both the same, and that the contexts are roughly similar. Contexts are
			// harder to check since we can't compare types (eg. zoning between two maps will both issue the
			// same event handlers and be considered duplicates), but also can't compare uid's (eg. old
			// character wasn't deleted and is still listening to event, and a new character was made which
			// listens to this event too, but both characers are for the same entity). This assertion test is
			// entirely for pointing out these bugs, but testing contexts is limited to guessing by their id
			// and logPrefix
			if (Env.assertion.eventListeningDuplicates) {
				var compareTo = callback.toString();
				for (var i=0; i<this.evtListeners[id].length; ++i) {
					var evtListener = this.evtListeners[id][i];
					if (evtListener.callback.toString() == compareTo &&
						((evtListener.caller == context) ||
						 (evtListener.caller.hasOwnProperty('id') && evtListener.caller.id == context.id) ||
						 (evtListener.caller.hasOwnProperty('logPrefix') && evtListener.caller.logPrefix == context.logPrefix && context.logPrefix))) {
						Log("ERROR: adding event listener where a duplicate was found!", LOG_ERROR);
						debugger;
						throw new Error("Error adding event listener where a duplicate was found ("+id+")");
					}
				}
			}


			var ref = { id:id, obj: this, callback: callback, caller: context, priority: priority };
			this.evtListeners[id].push(ref);

			ref.onRemove = {
				'eventer': null,
				'listener': null
			};

			var self = this;
			ref.onRemove.eventer = function(){
				var foundIt = false;
				for (var i=0; i<self.evtListeners[id].length; ++i) {
					if (self.evtListeners[id][i] == ref) {
						foundIt = true;
						self.evtListeners[id].splice(i,1);
						break;
					}
				}

				if (!foundIt) {
					Log("Could not find event on eventer side for removal", LOG_ERROR);
					debugger;
					throw new Error("Could not find event for removal on eventer side");
				}
			};

			ref.onRemove.listener = function(){
				var foundIt = false;
				for (var i=0; i<context.listeningTo.length; ++i) {
					if (context.listeningTo[i] == ref) {
						foundIt = true;
						context.listeningTo.splice(i,1);
						break;
					}
				}

				if (!foundIt) {
					Log("Could not find event on listener side for removal", LOG_ERROR);
					debugger;
					throw new Error("Could not find event on listener side for removal");
				}

			};

			ref.remove = function(){
				ref.onRemove.eventer();
				ref.onRemove.listener();
			};

			if (!context.listeningTo) context.listeningTo = [];
			context.listeningTo.push(ref);

			return ref;
		},

		listenTo:function(obj,id,callback,priority){
			var evt = obj.addEventListener(id,this,callback,priority);
		},

		// Remove an (id, object) pair from listening to us
		removeEventListener:function(id,context){
			if (!this.evtListeners[id]) return false;
			var removedSome = false;
			for(var i=0; i<this.evtListeners[id].length; ++i) {
				if (this.evtListeners[id][i].caller==context) {
					if (this.currentlyTriggeringEvent) {
						
						this.evtListeners[id][i].pendingRemoval = true;

						if (!removedSome) {
							removedSome = true;

							var operation = {
								callback:function(id){
									for (var j=0; j<this.evtListeners[id].length; ++j) {
										if (this.evtListeners[id][j].pendingRemoval) {
											this.evtListeners[id][j].onRemove.listener();
											this.evtListeners[id].splice(j,1);
											--j;
										}
									}
								},
								context:this,
								args:[id]
							};

							this.pendingOperations.push(operation);
						}
					} else {
						this.evtListeners[id][i].onRemove.listener();
						this.evtListeners[id].splice(i,1);
						--i;
					}
					removedSome = true;
				}
			}
			return removedSome;
		},

		stopListeningTo:function(obj,id){
			if (id==null) {
				if (obj==EVERYTHING) {
					// Remove everything we're listening to
					var removedAny=false;
					for (var i=0; i<this.listeningTo.length; ++i) {
						var eventfulData = this.listeningTo[i];
						eventfulData.onRemove.eventer();
						removedAny = true;
					}
					this.listeningTo = [];
					return removedAny;
				} else {
					var removedAny=false;
					for (var i=0; i<this.listeningTo.length; ++i) {
						if (this.listeningTo[i].obj == obj) {
							this.listeningTo[i].onRemove.eventer();
							this.listeningTo.splice(i, 1);
							--i;
							removedAny = true;
						}
					}
					return removedAny;
				}
			} else {
				var removedAny=false;
				for (var i=0; i<this.listeningTo.length; ++i) {
					if (this.listeningTo[i].obj == obj && this.listeningTo[i].id == id) {
						this.listeningTo[i].onRemove.eventer();
						this.listeningTo.splice(i, 1);
						--i;
						removedAny = true;
					}
				}
				return removedAny;
			}
		},

		unloadListener: function(){
			this.stopAllEventsAndListeners();
			this.stopListeningTo(EVERYTHING);
		},

	};

	return Eventful;
});
