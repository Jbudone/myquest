define(['movable'], function(Movable){

	var Page = {

		zones:{},
		spawns:{},

		_init: function(){
			this.listenTo(this, EVT_ADDED_ENTITY, function(page, entity){
				var ent = {
					id: entity.id,
					localY: entity.position.local.y,
					localX: entity.position.local.x,
					spriteID: entity.spriteID,
					state: entity.sprite.state,
					zoning: entity.zoning,
					path: (entity.path? entity.path.serialize() : null),
				}
				if (entity.hasOwnProperty('playerID')) ent.playerID = entity.playerID;
				this.eventsBuffer.push({
					evtType: EVT_ADDED_ENTITY,
					entity: ent
				});

				console.log("Added entity["+entity.id+"]("+entity.spriteID+") to page ("+this.index+")");
				this.listenTo(entity, EVT_PREPARING_WALK, function(entity, walk){
					// console.log("Entity ["+entity.id+"] preparing walk");
					var movablePosition = { y: entity.position.local.y + this.y * Env.tileSize,
										   x: entity.position.local.x + this.x * Env.tileSize,
										   globalY: Math.floor(entity.position.local.y / Env.tileSize) + this.y,
										   globalX: Math.floor(entity.position.local.x / Env.tileSize) + this.x},
					state = {
						page: this.index,
						localY: entity.position.local.y,
						localX: entity.position.local.x,
						y: movablePosition.y,
						x: movablePosition.x,
						globalY: movablePosition.globalY,
						globalX: movablePosition.globalX
					};
					var data = {
						id: entity.id,
						state: state,
						path: walk.toJSON(), //(entity.path? entity.path.serialize() : null),
					};

					console.log("("+now()+") Sending walk of user ["+entity.id+"] on page ("+this.index+") :: ("+state.localY+","+state.localX+")");
					this.eventsBuffer.push({
						evtType: EVT_PREPARING_WALK,
						data: data
					});
				}, HIGH_PRIORITY);

				this.listenTo(entity, EVT_ATTACKED, function(entity, target, amount){
					try{
					this.eventsBuffer.push({
						evtType: EVT_ATTACKED,
						data: {
							entity: { page: entity.page.index, id: entity.id },
							target: { page: target.page.index, id: target.id },
							amount: amount
						}
					});
					} catch(e) {}
				}, HIGH_PRIORITY);

				this.listenTo(entity, EVT_ATTACKED_ENTITY, function(entity, target){
					try{
					this.eventsBuffer.push({
						evtType: EVT_ATTACKED_ENTITY,
						data: {
							entity: { page: entity.page.index, id: entity.id },
							target: { page: target.page.index, id: target.id }
						}
					});
					} catch(e) {}
				}, HIGH_PRIORITY);

				this.listenTo(entity, EVT_NEW_TARGET, function(entity, target){
					this.eventsBuffer.push({
						evtType: EVT_NEW_TARGET,
						data: {
							entity: { page: entity.page.index, id: entity.id },
							target: { page: (target instanceof Tile ? null:target.page.index), id: target.id }
						}
					});
				}, HIGH_PRIORITY);

				this.listenTo(entity, EVT_REMOVED_TARGET, function(entity, target){
					this.eventsBuffer.push({
						evtType: EVT_REMOVED_TARGET,
						data: {
							entity: { page: entity.page.index, id: entity.id },
							target: { page: target.page.index, id: target.id }
						}
					});
				}, HIGH_PRIORITY);


				this.listenTo(entity, EVT_DIED, function(entity){
					this.eventsBuffer.push({
						evtType: EVT_DIED,
						data: {entity: entity.id }
					});

					this.stopListeningTo(entity);
					delete this.movables[entity.id];
				}, HIGH_PRIORITY);

				this.listenTo(entity, EVT_ZONE, function(entity, oldPage, page){
					// this.eventsBuffer.push({
					// 	evtType: EVT_REMOVED_ENTITY,
					// 	entity: { id: entity.id }
					// });
				});
			});

			this.listenTo(this, EVT_ZONE_OUT, function(page, entity){
				this.eventsBuffer.push({
					evtType: EVT_REMOVED_ENTITY,
					entity: { id: entity.id }
				});
			});
		},

		initialize: function(){

			if (this.spawns) {
				var page = this;
				_.each(this.spawns, function(spawn, spawnCoord){
					var localY = parseInt(spawnCoord/Env.pageWidth),
						localX = spawnCoord % Env.pageWidth;
					console.log("Spawning spawn["+spawn.id+"] at: ("+localY+","+localX+")");

					var npc = Resources.npcs[spawn.id],
						entity = new Movable(npc.sheet, page, {
							position: {
								local: {
									y: localY * Env.tileSize,
									x: localX * Env.tileSize,
								}
							}
						});
					console.log("Entity["+entity.id+"]");
					if (entity.AI) entity.AI.map = page.map; // Give intelligible beings a sense of whats around them
					page.map.watchEntity(entity);
					page.addEntity(entity);
					// TODO: listen to entity for stuff
				});
			}
		},

		broadcast: function(evtID, args){
			this.eventsBuffer.push({
				evtType: evtID,
				data: args
			});
		},

		fetchEventsBuffer: function(){

			if (!this.eventsBuffer.length) return null;

			var pageEvents = [],
				buffer = {};
			for (var i=0; i<this.eventsBuffer.length; ++i) {
				pageEvents.push(JSON.stringify(this.eventsBuffer[i]));
			}
			buffer.page = this.index;
			buffer.events = pageEvents;
			buffer = JSON.stringify(buffer);

			this.eventsBuffer = [];

			return buffer;
		},

		serialize: function(options){
			var serialized = {};
			serialized.index = this.index;
			if (options |= PAGE_SERIALIZE_BASE) {
				// tiles, sprites, collidables, y, x
				serialized.y     = this.y;
				serialized.x     = this.x;

				serialized.tiles       = this.tiles;
				serialized.sprites     = this.sprites;
				serialized.collidables = this.collidables;
			}

			if (options |= PAGE_SERIALIZE_MOVABLES) {
				// movables, paths on movables
				serialized.movables = {};
				for (var entityID in this.movables) {
					var entity = this.movables[entityID],
						ent = {
							id: entity.id,
							localY: entity.position.local.y,
							localX: entity.position.local.x,
							spriteID: entity.spriteID,
							state: entity.sprite.state,
							zoning: entity.zoning,
							path: (entity.path? entity.path.serialize() : null),
							health: entity.health,
					};

					if (entity.path) {
						// adjust path
						for (var j=0; j<entity.path.walks.length; ++j) {
							var walk = entity.path.walks[j];
							if (walk.steps==0) break;
							
							     if (walk.direction==NORTH) ent.localY -= walk.steps;
							else if (walk.direction==SOUTH) ent.localY += walk.steps;
							else if (walk.direction==WEST)  ent.localX -= walk.steps;
							else if (walk.direction==EAST)  ent.localX += walk.steps;
						}
					}

					serialized.movables[entityID] = ent;
				}
			}

			return JSON.stringify(serialized);
		},

		checkZoningTile: function(y,x) {
			var index = y*Env.pageWidth+x;
			if (this.zones[index]) {
				return this.zones[index];
			}
			return false;
		},
	};

	return Page;
});
