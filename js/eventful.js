
define(function(){

	var Eventful = {

		evtListeners:{}, // Objects listening to us {evtid: [obj, obj, ..], evtid: ..}
		pendingEvents:[], // List of events we're listening to that have been triggered but not yet handled
		currentlyTriggeringEvent:false,
		pendingOperations:[],
		listeningTo:[], // [{obj, id, ..}, ..]

		switchObject: function(obj){
			this.copyEventsAndListeners(obj);
			this.stopAllEventsAndListeners();
		},

		// Stop all event handling. For any objects that are currently listening to us under any id, inform
		// them that we're stopping the event handler. This includes any pending events.
		stopAllEventsAndListeners:function(){
			this.pendingEvents=[];
			this.evtListeners={};

			// FIXME: this is a quickfix solution to removing the event listeners; fix this up!
			var lastListener = null;
			while (this.listeningTo.length){
				var listener = this.listeningTo[0];
				if (listener == lastListener) {
					this.listeningTo.splice(0, 1);
					continue;
				}
				lastListener = listener;
				this.stopListeningTo(listener.obj, listener.id);
			};
			this.listeningTo = [];
		},

		// Copy all of the events listening to us, and the event handlers we've setup to another object.
		// Essentially another object will be replacing our base object without having any side effects
		copyEventsAndListeners:function(obj){
			obj.pendingEvents=this.pendingEvents;
			obj.evtListeners=this.evtListeners;
			// FIXME: copy listeningTo as well, and change listener/callback for each
		},

		triggerEvent:function(id){
			this.currentlyTriggeringEvent=true;
			if (this.evtListeners[id]) {
				var me=this,
					evtArgs=arguments;
				_.each(this.evtListeners[id],function(listener){
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
			this.evtListeners[id].push({ callback: callback, caller: context, priority: priority });
			// FIXME: return evt object (so that caller can add object and manipulate it later if necessary)
			return true;
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
						this.evtListeners[id].splice(i,1);
						--i;
					}
					removedSome = true;
				}
			}
			return removedSome;
		},

		listenTo:function(obj,id,callback,priority){
			var result = obj.addEventListener(id,this,callback,priority);
			if (result == true) {
				this.listeningTo.push({ id: id, obj: obj, callback: callback }); // FIXME: put evt object here instead
			}
		},

		stopListeningTo:function(obj,id){
			// FIXME: look through this.listeningTo for (obj,id) pair instead
			if (id==null) {
				if (obj==EVERYTHING) {
					// Remove everything we're listening to
					var removedAny=false;
					for (var i=0; i<this.listeningTo.length; ++i) {
						var eventfulData = this.listeningTo[i];
						removedAny |= eventfulData.obj.removeEventListener(eventfulData.id, this);
					}
					this.listeningTo = [];
				} else {
					var removedAny=false;
					for (var id in obj.evtListeners) {
						removedAny |= obj.removeEventListener(id,this);
					}

					for (var i=0; i<this.listeningTo.length; ++i) {
						if (this.listeningTo[i].obj == obj) {
							this.listeningTo.splice(i, 1);
							--i;
						}
					}
					return removedAny;
				}
			} else {
				var result = obj.removeEventListener(id,this);

				for (var i=0; i<this.listeningTo.length; ++i) {
					if (this.listeningTo[i].obj == obj && this.listeningTo[i].id == id) {
						this.listeningTo.splice(i, 1);
						--i;
					}
				}
				return result;
			}
		},

		changeListeners:function(oldContext, newContext){
			for (var id in this.evtListeners) {
				var evt = this.evtListeners[id];
				for (var i=0; i<evt.length; ++i) {
					if (evt[i].caller==oldContext) {
						evt[i].caller = newContext;
					}
				}
			}
		},
	};

	return Eventful;
});
