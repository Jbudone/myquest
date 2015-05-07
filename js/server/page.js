define(['movable'], function(Movable){

	var Page = {

		zones:{},
		spawns:{},

		_init: function(){
			this.listenTo(this, EVT_ADDED_ENTITY, function(page, entity){
				var ent = {
					id: entity.id,
					position: {
						global: {
							x: entity.position.global.x,
							y: entity.position.global.y
						},
						tile: {
							x: entity.position.tile.x,
							y: entity.position.tile.y
						}
					},
					spriteID: entity.spriteID,
					state: entity.sprite.state,
					zoning: entity.zoning,
					path: (entity.path? entity.path.serialize() : null),
					_character: {
						health: entity.character.health
					},
				}
				if (entity.hasOwnProperty('playerID')) {
					ent.playerID = entity.playerID;
					ent.name = entity.name;
				}
				this.eventsBuffer.push({
					evtType: EVT_ADDED_ENTITY,
					entity: ent
				});

				console.log("Added entity["+entity.id+"]("+entity.spriteID+") to page ("+this.index+")");
				this.listenTo(entity, EVT_PREPARING_WALK, function(entity, walk){
					if (!_.isFinite(entity.position.global.y) || !_.isFinite(entity.position.global.x)) throw new Error("Entity global position is illegal!");
					if (!_.isFinite(this.x) || !_.isFinite(this.y)) throw new Error("Page has illegal position!");

					var state = {
							page: this.index,
							position: {
								global: {
									x: entity.position.global.x,
									y: entity.position.global.y },
								tile: {
									x: entity.position.tile.x,
									y: entity.position.tile.y }
							},
						},
						path = walk.toJSON(),
						data = null;

					if (_.isError(path)) throw path;

					if (path.walks) debugger;

					data = {
						id: entity.id,
						state: state,
						path: path,
					};


					// console.log("("+now()+") Sending walk of user ["+entity.id+"] on page ("+this.index+") :: ("+state.localY+","+state.localX+")");
					this.eventsBuffer.push({
						evtType: EVT_PREPARING_WALK,
						data: data
					});
				}, HIGH_PRIORITY);

			});

			this.listenTo(this, EVT_ZONE_OUT, function(page, entity){
				if (!_.isFinite(entity.id)) throw new Error("Entity does not have a legal id");

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
					spawnCoord = parseInt(spawnCoord);

					if (!_.isFinite(spawnCoord)) throw new Error("spawnCoord not a number: "+spawnCoord);
					if (!Resources.npcs[spawn.id]) throw new Error("Could not find spawn unit: "+ spawn.id);

					var localY = parseInt(spawnCoord/Env.pageWidth),
						localX = spawnCoord % Env.pageWidth;

					var npc = Resources.npcs[spawn.id],
						entity = new Movable(npc.sheet, page, {
							position: {
								global: {
									y: (page.y + localY) * Env.tileSize,
									x: (page.x + localX) * Env.tileSize,
								}
							}
						});

					this.Log("Spawning spawn["+spawn.id+"] at: ("+localY+","+localX+")", LOG_DEBUG);
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
				buffer     = {},
				json       = null;
			for (var i=0; i<this.eventsBuffer.length; ++i) {
				json = JSON.stringify(this.eventsBuffer[i]);
				if (_.isError(json)) return json;

				pageEvents.push(json);
			}
			buffer.page   = this.index;
			buffer.events = pageEvents;
			buffer        = JSON.stringify(buffer);

			this.eventsBuffer = [];

			return buffer;
		},

		serialize: function(options){
			var serialized = {};
			serialized.index = this.index;
			if (options |= PAGE_SERIALIZE_BASE) {
				serialized.y     = this.y;
				serialized.x     = this.x;

				serialized.tiles         = this.tiles;
				serialized.sprites       = this.sprites;
				serialized.collidables   = this.collidables;
				serialized.items         = this.items;
				serialized.interactables = this.interactables;
			}

			if (options |= PAGE_SERIALIZE_MOVABLES) {
				serialized.movables = {};
				for (var entityID in this.movables) {
					var entity     = this.movables[entityID],
						path       = null,
						ent        = null,
						_character = null;

					if (entity.path) {
						path = entity.path.serialize();
						if (_.isError(path)) return path;
					}

					_character = {
						health: (entity.character ? entity.character.health : entity.npc.health)
					}

					ent = {
						id: entity.id,
						position: {
							global: {
								x: entity.position.global.x,
								y: entity.position.global.y },
							tile: {
								x: entity.position.tile.x,
								y: entity.position.tile.y }
						},
						spriteID: entity.spriteID,
						state: entity.sprite.state,
						zoning: entity.zoning,
						path: path,
						_character: _character,
					};
					if (entity.hasOwnProperty('name')) {
						ent.name = entity.name;
					}

					if (entity.path) {
						// adjust path
						for (var j=0; j<entity.path.walks.length; ++j) {
							var walk = entity.path.walks[j];
							if (walk.steps==0) break;
							
							     if (walk.direction==NORTH) ent.y -= walk.steps;
							else if (walk.direction==SOUTH) ent.y += walk.steps;
							else if (walk.direction==WEST)  ent.x -= walk.steps;
							else if (walk.direction==EAST)  ent.x += walk.steps;
						}
					}

					serialized.movables[entityID] = ent;
				}
			}

			return JSON.stringify(serialized);
		},

		checkZoningTile: function(x,y) {
			var index = y*Env.pageWidth+x;
			if (this.zones[index]) {
				return this.zones[index];
			}
			return false;
		},
	};

	return Page;
});
