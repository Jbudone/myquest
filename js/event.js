
define(['serializable','eventful'], function(Serializable,Eventful){

	// Event: local/server event
	// Response: servers response (success/fail) of your request
	// Packet: a wrapped up event from server to client
	// EventsNode: a set of events within a certain period (eg. 1 step)
	// Archive: a list of EventsNodes 


	var Event = function(id, eventType, data, state, time, playerId) {
		extendClass(this).with(Serializable);

		this.id       = id || null;
		this.evtType  = eventType || null;
		this.time     = time || now();
		this.data     = data || {};
		this.state    = state || {};
		this.playerId = playerId || null;

	},  Response = function(id, success) {
		extendClass(this).with(Serializable);

		this.id       = id || null;
		this.success  = success;

	},  Packet = function(packetType, data) {
		extendClass(this).with(Serializable);

		this.type     = packetType || null;
		this.data     = data || {};

	},  EventsNode = function() {
		extendClass(this).with(Serializable);

		this.earliestId   = null;
		this.timeArchived = now();
		this.archive      = [];

		this.addEvent = function(event) {
			if (!this.archive.length)
				this.earliestId = event.id;

			this.archive.push(event);
		};

	},  EventsArchive = function() {
		extendClass(this).with(Serializable);
		extendClass(this).with(Eventful);

		this.archives        = [];
		this.archiveLifespan = 1000*15; // 15 seconds

		this.pushArchive = function() {
			this.archives.unshift( new EventsNode() );

			// Clear older archives?
			var deathTime = now() - this.archiveLifespan;
			for (var i = this.archives.length-1; i>=1; --i) {
				if (this.archives[i].timeArchived <= deathTime)
					this.archives.pop();
				else
					break;
			}
		};

		this.addEvent = function(event) {
			this.archives[0].addEvent(event);
		};
	};
	

	return {
		Event: Event,
		Response: Response,
		EventsNode: EventsNode,
		EventsArchive: EventsArchive
	};

});

