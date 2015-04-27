define(['SCRIPTENV', 'eventful', 'hookable', 'loggable', 'scripts/character'], function(SCRIPTENV, Eventful, Hookable, Loggable, Character){

	eval(SCRIPTENV);

	var Game = function(){
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		this.setLogGroup('Game');
		this.setLogPrefix('(Game) ');

		this.name         = "game",
		this.static       = true,
		this.keys         = [],
		this.components   = { };
		this.hookInto     = HOOK_INTO_MAP;
		var _game         = this,
			map           = null,
			_script       = null;

		this.characters   = {};
		this.players      = {};
		this.respawning   = {};
		this.delta        = 0;  // delta time since last update

		this.droppedItems = [];


		// Longstep (deltaSecond)
		//
		// same as delta, but this is used to update things which need updates every 1 second rather than
		// every step.. TODO: probably a better way to handle this than having 2 deltas..
		this.deltaSecond = 0;
		this.registerHook('longStep');
		this.longStep = function(){
			if (!this.doHook('longStep').pre()) return;

			var result = this.decayItems();
			if (_.isError(result)) return result;

			this.doHook('longStep').post();
		};

		// Active Tiles
		//
		// Tiles which scripts are listening too (eg. characters listening to certain tiles)
		this.activeTiles = {};
		this.hashTile = function(x, y){
			return y*map.mapWidth + x;
		};
		this.tile = function(x, y){
			var hash = this.hashTile(x, y),
				listenToTile = function(context, callback){
					if (!this.activeTiles.hasOwnProperty(hash)) {
						this.activeTiles[hash] = 0;
						this.registerHook('tile-'+hash);
					}

					++this.activeTiles[hash];
					this.hook('tile-'+hash, context).after(callback);
				}.bind(this),
				stopListeningToTile = function(context){
					if (!this.activeTiles.hasOwnProperty(hash)) return;

					// If 0 listeners then remove hook
					this.hook('tile-'+hash, context).remove();
					if (--this.activeTiles[hash] === 0) {
						this.unregisterHook('tile-'+hash);
						delete this.activeTiles[hash];
					}
				}.bind(this),
				triggerTile = function(args){
					if (!this.activeTiles.hasOwnProperty(hash)) return;
					if (!this.doHook('tile-'+hash).pre(args)) return;
					this.doHook('tile-'+hash).post(args);
				}.bind(this);


			return {
				listen: listenToTile,
				forget: stopListeningToTile,
				trigger: triggerTile
			};
		};





		this.createCharacter = function(entity){
			var entityID  = entity.id,
				character = null;

			if (this.characters.hasOwnProperty(entityID)) return new Error("Character already exists for entity ("+ entityID +")");
			character = _script.addScript( new Character(this, entity) );
			if (_.isError(character)) return character;
			_.last(_script.children).initialize(); // FIXME: this isn't the safest way to go..; NOTE: if game script is currently initializing, it will attempt to initialize all children afterwards; this child script will already have been initialized, and will not re-initialize the child
			return character;
		};

		this.addCharacter = function(entity){
			var entityID  = entity.id,
				character = entity.character;
			if (!(character instanceof Character)) return new Error("Entity not a character");
			if (this.characters.hasOwnProperty(entityID)) return;
			if (!this.doHook('addedcharacter').pre(entity)) return;
			this.characters[entityID] = character;

			character.hook('die', this).after(function(){
				var result = null;
				result = this.removeCharacter(character.entity);
				if (_.isError(result)) throw result;

				if (character.isPlayer) {
					result = this.removePlayer(character.entity);
					if (_.isError(result)) throw result;
				} else {
					if (Env.isServer) {
						result = this.handleLoot(character);
						if (_.isError(result)) throw result;
					}
				}

				result = character.entity.page.map.removeEntity(character.entity);
				if (_.isError(result)) throw result;
				if (this.respawning.hasOwnProperty(character.entity.id)) throw new Error("Character ("+ entity.entity.id +") already respawning");
				this.respawning[character.entity.id] = character;

				character.hook('die', this).remove();
			});

			character.hook('moved', this).after(function(){
				var pos = character.entity.position.tile;
				this.tile(pos.x, pos.y).trigger(character);
			});

			this.doHook('addedcharacter').post(entity);
		};

		this.removeCharacter = function(entity){
			var entityID  = entity.id,
				character = entity.character;
			if (!(character instanceof Character)) return new Error("Entity not a character");
			if (!this.characters.hasOwnProperty(entityID)) return new Error("Character ("+ entityID +") not found");
			if (!this.doHook('removedcharacter').pre(entity)) return;
			delete this.characters[entityID];

			var result = null;
			if (!Env.isServer) {
				if (character.entity.hasOwnProperty('ui')) {
					result = character.entity.ui.remove();
					if (_.isError(result)) return result;
				}
			}

			character.hook('die', this).remove();
			character.hook('moved', this).remove();
			result = _script.removeScript( character._script );
			if (_.isError(result)) return result;
			
			console.log("Removed character from Game: "+entityID);
			this.doHook('removedcharacter').post(entity);
		};

		this.addPlayer = function(entity){
			if (!entity.hasOwnProperty('playerID')) return new Error("Entity does not have a playerID");
			var playerID = entity.playerID;
			if (this.players.hasOwnProperty(playerID)) return new Error("Player ("+ playerID +") not found");
			if (!this.doHook('addedplayer').pre(entity)) return;
			this.players[playerID] = entity;
			if (!(entity.character instanceof Character)) return new Error("Entity does not have character property");
			var result = entity.character.setAsPlayer();
			if (_.isError(result)) return result;
			console.log("Added player to Game: "+playerID);
			this.doHook('addedplayer').post(entity);
		};

		this.removePlayer = function(entity){
			if (!entity.hasOwnProperty('playerID')) return new Error("Entity does not have a playerID");
			var playerID = entity.playerID;
			if (!this.players.hasOwnProperty(playerID)) return new Error("Player ("+ playerID +") not found");
			if (!this.doHook('removedplayer').pre(entity)) return;
			delete this.players[playerID];
			console.log("Removed player from Game: "+playerID);
			this.doHook('removedplayer').post(entity);
		};

		this.detectEntities = function(){
			this.registerHook('addedcharacter');
			this.registerHook('removedcharacter');

			this.registerHook('addedplayer');
			this.registerHook('removedplayer');

			map.hook('addedentity', this).after(function(entity){

				// Create a new character object for this entity if one hasn't been created yet
				var result = null;
				if (!(entity.character instanceof Character)) {
					result = this.createCharacter.call(this, entity);
					if (_.isError(result)) throw result;
				} else {
					// NOTE: entity could be a user, and may be zoning between maps. The character script has
					// already been created, but now its context needs to be switched from 1 map to the other
					result = _script.addScript( entity.character );
					if (_.isError(result)) return result;
					_.last(_script.children).initialize(); // FIXME: this isn't the safest way to go..; NOTE: if game script is currently initializing, it will attempt to initialize all children afterwards; this child script will already have been initialized, and will not re-initialize the child
				}

				result = this.addCharacter.call(this, entity);
				if (_.isError(result)) throw result;
				if (entity.playerID) {
					result = this.addPlayer.call(this, entity);
					if (_.isError(result)) throw result;
				}

			});

			map.hook('removedentity', this).after(function(entity){
				var result = null;
				result = this.removeCharacter.call(this, entity);
				if (_.isError(result)) throw result;
				if (entity.playerID) {
					result = this.removePlayer.call(this, entity);
					if (_.isError(result)) throw result;
				}
			});
		};

		this.server = {

			initialize: function(){
				extendClass(_game).with(Eventful);
				
				var result = null;

				_script = this;
				map = this.hookInto;
				result = _game.detectEntities();
				if (_.isError(result)) throw result;

				map.game = _game; // For debugging purposes..

				// TODO: add all current characters in map
				_.each(map.movables, function(entity, entityID){
					var result = null;
					result = _game.createCharacter.call(_game, entity);
					if (_.isError(result)) throw result;
					result = _game.addCharacter(entity);
					if (_.isError(result)) throw result;
					if (entity.playerID) {
						result = _game.addPlayer(entity);
						if (_.isError(result)) throw result;
					}
				}.bind(this));

				map.registerHandler('step');
				map.handler('step').set(function(delta){
					this.delta += delta;
					this.deltaSecond += delta;

					var result = null;
					while (this.delta >= 100) {
						this.delta -= 100;
						this.handlePendingEvents();

						for (var entid in this.respawning) {
							var character = this.respawning[entid];
							if (!(character instanceof Character)) return new Error("Respawning character ("+ entid +") not a character");

							character.respawnTime -= 100; // FIXME: shouldn't hardcode this, but can't use delta
							if (character.respawnTime <= 0) {
								delete this.respawning[entid];

								result = character.respawning();
								if (_.isError(result)) return result;

								var mapID  = character.respawnPoint.map,
									pageID = character.respawnPoint.page,
									map    = null,
									page   = null;
								if (!world.maps.hasOwnProperty(mapID)) return new Error("No map ("+ mapID +")");
								map = world.maps[mapID];
								if (!map.pages.hasOwnProperty(pageID)) return new Error("No page ("+ pageID +") in map ("+ mapID +")");
								page = map.pages[pageID];

								result = map.watchEntity(character.entity);
								if (_.isError(result)) return result;
								result = page.addEntity(character.entity);
								if (_.isError(result)) return result;

								character.entity.page = page;
								result = character.respawned();
								if (_.isError(result)) return result;

								if (character.isPlayer) {
									result = character.entity.player.respawn();
									if (_.isError(result)) return result;
								}
							}
						}
					}

					while (this.deltaSecond >= 1000) {
						this.deltaSecond -= 1000;
						result = this.longStep();
						if (_.isError(result)) return result;
					}

				}.bind(_game));
			},

			unload: function(){
				this.stopAllEventsAndListeners();
				map.handler('step').unset();
				var result = map.unhook(this);
				if (_.isError(result)) throw result;
			},

			handleLoot: function(character){
				if (Math.random() > 0.0) { // FIXME: handle this based off of loot details from NPC
					if (!(character instanceof Character)) return new Error("character not a Character");

					var page     = character.entity.page,
						position = character.entity.position.tile,
						itm_id   = "itm_potion",
						item     = null,
						decay    = null;

					page.broadcast(EVT_DROP_ITEM, {
						position: {x: position.x, y: position.y},
						item: itm_id,
						page: page.index
					});

					item = {
						id: itm_id,
						sprite: Resources.items.list[itm_id].sprite,
						coord: {x: position.x, y: position.y},
						page: page.index,
					};

					decay = {
						coord: {x: position.x, y: position.y},
						page: page.index,
						decay: now() + 20000, // FIXME: put this somewhere.. NOTE: have to keep all decay rates the same, or otherwise change decayItems structure
					};

					page.items[(position.y-page.y)*Env.pageWidth + (position.x-page.x)] = item;
					this.droppedItems.push(decay);
				}
			},

			decayItems: function(){

				var item  = null,
					time  = now(),
					index = null,
					coord = null;
				for (index=0; index<this.droppedItems.length; ++index) {
					item = this.droppedItems[index];
					if (item.decay < time) {
						page = map.pages[item.page];
						coord = (item.coord.y-page.y)*Env.pageWidth + (item.coord.x-page.x);
						page.broadcast(EVT_GET_ITEM, {
							coord: coord,
							page: item.page
						});

						delete page.items[coord];
					} else {
						break;
					}
				}

				if (index) {
					this.droppedItems.splice(0, index);
				}
			},

			removeItem: function(page, coord){
				// Already removed this item from map/page, just need to remove from droppedItems list

				var index = null;
				for (index=0; index<this.droppedItems.length; ++index){
					if (this.droppedItems[index].coord == coord &&
						this.droppedItems[index].page == page) {

						this.droppedItems.splice(index, 1);
						break;
					}
				}
			}
		};

		this.client = {

			initialize: function(){

				var result = null;

				_script = this;
				map = this.hookInto;
				result = _game.detectEntities();
				if (_.isError(result)) throw result;
				result = _game.addUser();
				if (_.isError(result)) throw result;

				// Add all current characters in map
				_.each(map.movables, function(entity, entityID){
					if (entityID == The.player.id) return;
					var result = null;
					result = _game.createCharacter.call(_game, entity);
					if (_.isError(result)) throw result;
					result = _game.addCharacter(entity);
					if (_.isError(result)) throw result;
					if (entity.playerID) {
						result = _game.addPlayer(entity);
						if (_.isError(result)) throw result;
					}
				}.bind(this));

				result = _game.handleItems.bind(_game)();
				if (_.isError(result)) throw result;
				result = _game.handleInteractables.bind(_game)();
				if (_.isError(result)) throw result;

				window['game'] = _game; // FIXME: user debugging script for this
			},

			addUser: function(){
				var entity = The.player,
					result = null;
				if (!(entity instanceof Movable)) return new Error("Player not a movable");
				result = this.createCharacter(entity);
				if (_.isError(result)) return result;
				result = this.addCharacter(entity);
				if (_.isError(result)) return result;
				result = this.addPlayer(entity);
				if (_.isError(result)) return result;
				result = this.characters[entity.id].setToUser();
				if (_.isError(result)) return result;
			},

			handleItems: function(){

				user.hook('clickedItem', this).after(function(item){
					var page = map.pages[item.page],
						y    = item.coord.y,//parseInt(item.coord / Env.pageWidth),
						x    = item.coord.x,//item.coord - y*Env.pageWidth,
						tile = new Tile( x, y ),
						path = map.pathfinding.findPath( player, tile );

					if (_.isError(path)) throw path;
					player.addPath(path).finished(function(){
						server.request(EVT_GET_ITEM, { coord: ((item.coord.y - page.y) * Env.pageWidth + (item.coord.x - page.x)), page: item.page })
							.then(function(){
								// Got item
								console.log("Got item!");
							}, function(){
								// Couldn't get item
								console.log("Couldn't get item");
							})
							.catch(Error, function(e){ gameError(e); })
							.error(function(e){ gameError(e); });
							
						console.log("ZOMG I GOT THE ITEM!!");
					}, function(){
						console.log("Awww I couldn't get the item :(");
					});
				});

				server.registerHandler(EVT_GET_ITEM);
				server.handler(EVT_GET_ITEM).set(function(evt, data){
					var page = null;
					if (!_.isObject(data)) return new Error("Item not an object");
					if (!data.hasOwnProperty('page')) return new Error("Item does not have page");
					if (!data.hasOwnProperty('coord')) return new Error("Item does not have coordinates");

					if (!The.map.pages.hasOwnProperty(data.page)) return new Error("Item page does not exist");
					page = The.map.pages[data.page];

					if (!page.items.hasOwnProperty(data.coord)) return new Error("Item does not exist in page");
					delete page.items[data.coord];
				});

				server.registerHandler(EVT_USE_ITEM);
				server.handler(EVT_USE_ITEM).set(function(evt, data){
					var base      = null,
						character = null,
						args      = null,
						result    = null;

					if (!_.isObject(data)) return new Error("Item is not an object");
					if (!data.hasOwnProperty('base')) return new Error("Item does not have base property");
					if (!data.hasOwnProperty('character')) return new Error("Item usage does not have character property");

					if (!Resources.items.base.hasOwnProperty(data.base)) return new Error("Item base does not exist in Resources");
					if (!The.map.movables.hasOwnProperty(data.character)) return new Error("Item user character does not exist in map movables list");

					base      = Resources.items.base[data.base];
					character = The.map.movables[data.character].character;

					if (!base.hasOwnProperty('invoke')) return new Error("Item base does not have the invoke property");
					result = base.invoke(character, data);

					if (_.isError(result)) return result;
				});

				server.registerHandler(EVT_DROP_ITEM);
				server.handler(EVT_DROP_ITEM).set(function(evt, data){
					var position = null,
						page     = null,
						item     = null;

					if (!_.isObject(data)) return new Error("Item is not an object");
					if (!data.hasOwnProperty('item')) return new Error("Data does not include item");
					if (!data.hasOwnProperty('position')) return new Error("Data does not include position");
					if (!data.hasOwnProperty('page')) return new Error("Data does not include page");
					if (!The.map.pages.hasOwnProperty(data.page)) return new Error("Data page does not exist in map");
					if (!Resources.items.list.hasOwnProperty(data.item)) return new Error("Data item does not exist in Resources");

					position = data.position;
					page = The.map.pages[data.page];
					item = {
						id: data.item,
						sprite: Resources.items.list[data.item].sprite,
						coord: position,
						page: page.index
					};

					page.items[(position.y-page.y)*Env.pageWidth + (position.x-page.x)] = item;
				});
			},


			handleInteractables: function(){

				user.hook('clickedInteractable', this).after(function(interactableID){
					if (!map.interactables.hasOwnProperty(interactableID)) throw new Error("Interactable ("+ interactableID +") not found!");
					var interactable = map.interactables[interactableID],
						path         = map.pathfinding.findPath( player, interactable.positions, { range: 1, adjacent: false }),
						destination  = null,
						nearestTile  = null,
						coord        = null;

					if (_.isError(path)) throw path;
					if (!path) {
						// No path was found.. either we couldn't find a path to the interactable, or we're
						// already standing on an acceptable tile. Assume that we're standing on an acceptable
						// tile, and check afterwards if that was the case
						destination = The.player.position.tile;
					} else {
						destination = _.last(path.walks).destination; // The tile which we are going to walk to
						if (!destination) throw new Error("No destination provided from walk/path");
					}
					
					// NOTE: we need to tell the server which tile in particular we've clicked. Since we're
					// only walking up to the interactable (and not ontop of it), our destination tile is a
					// neighbour tile. The server needs to know exactly which tile we're walking up to, so
					// find that tile here
					for (var i=0; i<interactable.positions.length; ++i) {
						var tile     = interactable.positions[i],
							page     = map.pages[tile.page],
							globalX  = tile.x + page.x,
							globalY  = tile.y + page.y;
						if (destination.x >= globalX - 1 && destination.x <= globalX + 1 &&
							destination.y >= globalY - 1 && destination.y <= globalY + 1) {

							nearestTile = tile;
							coord = (globalY - page.y)*Env.pageWidth + (globalX - page.x); // local coordinate
							break;
						}
					}

					if (nearestTile === null) {
						if (!path) {
							throw new Error("No path found to interactable");
						} else {
							throw new Error("Could not find tile of interactable");
						}
					}

					var readyToInteract = function(){
						
						var interactableDetails  = Resources.interactables.list[interactableID],
							interactableScriptID = null
							args                 = null,
							interactable         = null;
						if (!interactableDetails || !interactableDetails.base) throw new Error("No type script found for interactable ("+ interactableID +")");
						args                 = interactableDetails.args || {};
						interactableScriptID = interactableDetails.base;
						interactable         = Resources.interactables.base[interactableScriptID];
						if (!interactable) throw new Error("No base script found for interactable script ("+ interactableScriptID +")");
						if (interactable.handledBy == CLIENT_ONLY) {

							var data = _.extend({
								base: interactableScriptID,
								character: The.player.id,
							}, args);
							var result = interact(null, data);

							if (_.isError(result)) throw result;

						} else {
							server.request(EVT_INTERACT, { interactable: interactableID, tile: {x: nearestTile.x, y: nearestTile.y}, coord: coord, page: nearestTile.page })
								.then(function(){
									console.log("Clicked the interactable!");
								}, function(){
									console.log("Couldn't click the interactable");
								})
								.catch(Error, function(e){ gameError(e); })
								.error(function(e){ gameError(e); });
								
							console.log("ZOMG I GOT INTERACTED WITH THE INTERACTABLE!!");
						}
					};

					if (path) {
						player.addPath(path).finished(readyToInteract, function(){
							console.log("Awww I couldn't interact with the interactable thingy :(");
						});
					} else {
						readyToInteract(); // Already there
					}
				});

				var interact = function(evt, data){
					var base      = null,
						character = null,
						args      = null,
						result    = null;

					if (!_.isObject(data)) return new Error("Interactable is not an object");
					if (!data.hasOwnProperty('base')) return new Error("Interactable does not have base property");
					if (!data.hasOwnProperty('character')) return new Error("Interactable user does not have character property");

					if (!Resources.interactables.base.hasOwnProperty(data.base)) return new Error("Interactable base does not exist in Resources");
					if (!The.map.movables.hasOwnProperty(data.character)) return new Error("Interactable user character does not exist in map movables list");

					base      = Resources.interactables.base[data.base];
					character = The.map.movables[data.character].character;

					if (!base.hasOwnProperty('invoke')) return new Error("Interactable base does not have the invoke property");
					result = base.invoke(character, data);
					if (_.isError(result)) return result;
				};

				server.registerHandler(EVT_INTERACT);
				server.handler(EVT_INTERACT).set(interact);

			},


			unload: function(){
				var result = map.unhook(this);
				if (_.isError(result)) throw result;
				var result = user.unhook(this);
				if (_.isError(result)) throw result;
			}
		};
	};

	return Game;
});
