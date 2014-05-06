
define(function(){

	var Eventful = {

		// 	stopListeningTo(obj)
		// 	changeListener
		// 	copyEvetnsAndListeners
		evtListeners:{},
		pendingEvents:[],
		stopAllEventsAndListeners:function(){
			this.pendingEvents=[];
			this.evtListeners={};
		},

		copyEventsAndListeners:function(obj){
			obj.pendingEvents=this.pendingEvents;
			obj.evtListeners=this.evtListeners;
		},

		triggerEvent:function(id){
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
						// listener.args = args;
						// listener.args.id = id; // TODO: remove this (debug)
						if (listener.caller.pendingEvents) {
							listener.caller.pendingEvents.push( {args:args, callback:listener.callback} );
							if (id == EVT_ADDED_ENTITY) {
								console.log("PUSHING PENDING EVENT OF ADDED ENTITY: ["+args[1].id+"]");
							}
						} else {
							listener.callback.apply( listener.caller, args );
						}
					}
				});
			}
		},

		handlePendingEvents:function(){
			for (var i=0; i<this.pendingEvents.length; ++i) {
				var handler = this.pendingEvents[i];
				if (handler.args.id && handler.args.id == EVT_ADDED_ENTITY) {
					console.log("HANDLING PENDING EVENT OF ADDED ENTITY ["+handler.args[1].id+"]!!!!");
				}
				handler.callback.apply( this, handler.args );
			}
			this.pendingEvents=[];
		},

		addEventListener:function(id,context,callback,priority){
			if (!this.evtListeners[id]) this.evtListeners[id]=[];
			this.evtListeners[id].push({ callback: callback, caller: context, priority: priority });
			return true;
		},

		removeEventListener:function(id,context){
			if (!this.evtListeners[id]) return false;
			for(var i=0; i<this.evtListeners[id].length; ++i) {
				if (this.evtListeners[id][i].caller==context) {
					this.evtListeners[id].splice(i,1);
					return true;
				}
			}
			return false;
		},

		listenTo:function(obj,id,callback,priority){
			return obj.addEventListener(id,this,callback,priority);
		},

		stopListeningTo:function(obj,id){
			if (id==null) {
				var removedAny=false;
				for (var id in obj.evtListeners) {
					removedAny |= obj.removeEventListener(id,this);
				}
				return removedAny;
			} else {
				return obj.removeEventListener(id,this);
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
