define(['eventful','map'], function(Eventful,Map){

	var World = function(){
		Ext.extend(this,'world');
		extendClass(this).with(Eventful);

		this.maps = {};
		this.addMap = function(id) {
			if (!this.maps[id]) {
				console.log("Adding map to world: "+id);
				var map = new Map(id);
				this.maps[id] = map;

				this.listenTo(map, EVT_ZONE_OUT, function(oldMap, entity, zone) {
					try {
						console.log(zone);
						console.log("World zoning out");
						var map  = this.maps[zone.map],
							page = map.zoneIn(entity, zone);
						entity.triggerEvent(EVT_ZONE_OUT, map, page);
					} catch(e) {
						console.log("Error zoning entity..");
						console.log(e);
						// TODO: send entity to safe spot
					}
				});
			}
		};

		this.step = function(time) {
			this.handlePendingEvents();

			var lag=time,
				eventsBuffer = {};
			for (var mapID in this.maps) {
				var beforeStep=now();
				var mapEvents = this.maps[mapID].step(lag)
				if (mapEvents) eventsBuffer[mapID] = mapEvents;
				lag += (now() - beforeStep);
			}

			return eventsBuffer;
		};
	};

	return World;

});
