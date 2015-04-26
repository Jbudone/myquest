define(['eventful','map'], function(Eventful,Map){

	var World = function(){
		Ext.extend(this,'world');
		extendClass(this).with(Eventful);

		this.maps = {};
		this.addMap = function(id) {
			if (!this.maps[id]) {
				console.log("Adding map to world: "+id);
				var map = new Map(id);
				map.loadMap();
				this.maps[id] = map;

				this.listenTo(map, EVT_ZONE_OUT, function(oldMap, oldPage, entity, zone) {
					try {
						console.log(zone);
						console.log("World zoning out");
						var oldPage = oldPage,
							oldMap  = oldMap,
							map     = this.maps[zone.map],
							page    = null;
						console.log("Zoning user ["+entity.id+"] to new map..");
						oldMap.removeEntity(entity);
						page = map.zoneIn(entity, zone);
						entity.triggerEvent(EVT_ZONE_OUT, oldMap, oldPage, map, page, zone);
						entity.isZoning = true; // FIXME: this is a quickfix to tell the movement not to update position in movable.js
					} catch(e) {
						console.log("Error zoning entity..");
						console.log(e);
						// TODO: send entity to safe spot
					}
				}, HIGH_PRIORITY);
			}
		};

		this.step = function(time) {
			this.handlePendingEvents();

			var lag=time,
				eventsBuffer = {};
			for (var mapID in this.maps) {
				var beforeStep=now();

				try {
					var mapEvents = this.maps[mapID].step(lag)
					if (mapEvents) eventsBuffer[mapID] = mapEvents;
				} catch(e) {
					console.log(e);
				}

				lag += (now() - beforeStep);
			}

			return eventsBuffer;
		};
	};

	return World;

});
