define(['SCRIPTENV', 'eventful', 'hookable', 'loggable', 'scripts/character'], function(SCRIPTENV, Eventful, Hookable, Loggable, Character){

	eval(SCRIPTENV);

	var Game = function(){
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		this.setLogGroup('Game');
		this.setLogPrefix('(Game) ');

		this.name = "game",
		this.static = true,
		this.keys = [],
		this.components = { };
		this.hookInto = HOOK_INTO_MAP;
		var _game = this,
			map   = null,
			_script = null;

		this.characters = {};
		this.players = {};
		this.respawning = {};
		this.delta = 0;  // delta time since last update

		this.droppedItems = [];


		this.deltaSecond = 0;  // same as delta, but this is used to update things which need updates every 1 second rather than every step.. TODO: probably a better way to handle this than having 2 deltas..
		this.registerHook('longStep');
		this.longStep = function(){
			this.doHook('longStep').pre();

			this.decayItems();

			this.doHook('longStep').post();
		};


		this.activeTiles = {}; // Tiles which scripts are listening too (eg. characters listening to certain tiles)
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
				}.bind(this), stopListeningToTile = function(context){
					if (!this.activeTiles.hasOwnProperty(hash)) return;

					// If 0 listeners then remove hook
					this.hook('tile-'+hash, context).remove();
					if (--this.activeTiles[hash] === 0) {
						this.unregisterHook('tile-'+hash);
						delete this.activeTiles[hash];
					}
				}.bind(this), triggerTile = function(args){
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

			if (this.characters.hasOwnProperty(entityID)) return;
			character = _script.addScript( new Character(this, entity) );
			_.last(_script.children).initialize(); // FIXME: this isn't the safest way to go..; NOTE: if game script is currently initializing, it will attempt to initialize all children afterwards; this child script will already have been initialized, and will not re-initialize the child
			return character;
		};

		this.addCharacter = function(entity){
			var entityID  = entity.id,
				character = entity.character;
			if (!(character instanceof Character)) return UnexpectedError("Entity not a character");
			if (this.characters.hasOwnProperty(entityID)) return;
			if (!this.doHook('addedcharacter').pre(entity)) return;
			this.characters[entityID] = character;

			character.hook('die', this).after(function(){
				this.removeCharacter(character.entity);
				if (character.isPlayer) {
					this.removePlayer(character.entity);
				} else {
					if (Env.isServer) {
						this.handleLoot(character);
					}
				}

				character.entity.page.map.removeEntity(character.entity);
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
			if (!(character instanceof Character)) return UnexpectedError("Entity not a character");
			if (!this.characters.hasOwnProperty(entityID)) return;
			if (!this.doHook('removedcharacter').pre(entity)) return;
			delete this.characters[entityID];

			if (!Env.isServer) {
				if (character.entity.hasOwnProperty('ui')) {
					character.entity.ui.remove();
				}
			}

			character.hook('die', this).remove();
			character.hook('moved', this).remove();
			_script.removeScript( character._script );
			
			console.log("Removed character from Game: "+entityID);
			this.doHook('removedcharacter').post(entity);
		};

		this.addPlayer = function(entity){
			var playerID = entity.playerID;
			if (this.players.hasOwnProperty(playerID)) return;
			if (!this.doHook('addedplayer').pre(entity)) return;
			this.players[playerID] = entity;
			if (!(entity.character instanceof Character)) return new UnexpectedError("Entity does not have character property");
			entity.character.setAsPlayer();
			console.log("Added player to Game: "+playerID);
			this.doHook('addedplayer').post(entity);
		};

		this.removePlayer = function(entity){
			var playerID = entity.playerID;
			if (!this.players.hasOwnProperty(playerID)) return;
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
				if (!(entity.character instanceof Character)) {
					this.createCharacter.call(this, entity);
				}

				this.addCharacter.call(this, entity);
				if (entity.playerID) {
					this.addPlayer.call(this, entity);
				}

			});

			map.hook('removedentity', this).after(function(entity){
				this.removeCharacter.call(this, entity);
				if (entity.playerID) {
					this.removePlayer.call(this, entity);
				}
			});
		};

		this.server = {

			initialize: function(){
				console.log("INITIALIZING GAME!?");
				extendClass(_game).with(Eventful);
				
				_script = this;
				map = this.hookInto;
				_game.detectEntities();

				map.game = _game; // For debugging purposes..

				// TODO: add all current characters in map
				_.each(map.movables, function(entity, entityID){
					_game.createCharacter.call(_game, entity);
					_game.addCharacter(entity);
					if (entity.playerID) {
						_game.addPlayer(entity);
					}
				}.bind(this));

				map.registerHandler('step');
				map.handler('step').set(function(delta){
					this.delta += delta;
					this.deltaSecond += delta;

					while (this.delta >= 100) {
						this.delta -= 100;
						this.handlePendingEvents();

						for (var entid in this.respawning) {
							var character = this.respawning[entid];
							if (!(character instanceof Character)) {
								this.Log("Respawning character not a character!", LOG_ERROR);
								delete this.respawning[entid];
								continue;
							}

							character.respawnTime -= 100; // FIXME: shouldn't hardcode this, but can't use delta
							if (character.respawnTime <= 0) {
								delete this.respawning[entid];

								character.respawning();
								var map = world.maps[character.respawnPoint.map],
									page = null;
								if (map) {
									page = map.pages[character.respawnPoint.page];
									if (page) {
										map.watchEntity(character.entity);
										page.addEntity(character.entity);

										character.entity.page = page;
										character.respawned();

										if (character.isPlayer) {
											character.entity.player.respawn();
										}
										continue;
									}
								}

								this.Log("Error respawning character.. Bad respawn point", LOG_ERROR);

							}
						}
					}

					while (this.deltaSecond >= 1000) {
						this.deltaSecond -= 1000;
						this.longStep();
					}

				}.bind(_game));
			},

			unload: function(){
				this.stopAllEventsAndListeners();
				map.handler('step').unset();
				map.unhook(this);
			},

			handleLoot: function(character){
				if (Math.random() > 0.0) { // FIXME: handle this based off of loot details from NPC
					if (!(character instanceof Character)) return new UnexpectedError("character not a Character");

					var page = character.entity.page,
						position = character.entity.position.tile,
						itm_id = "itm_potion",
						item = null,
						decay = null;

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
				console.log("INITIALIZAING GAME?!");

				_script = this;
				map = this.hookInto;
				_game.detectEntities();
				_game.addUser();

				// Add all current characters in map
				_.each(map.movables, function(entity, entityID){
					if (entityID == The.player.id) return;
					_game.createCharacter.call(_game, entity);
					_game.addCharacter(entity);
					if (entity.playerID) {
						_game.addPlayer(entity);
					}
				}.bind(this));

				_game.handleItems.bind(_game)();

				window['game'] = _game; // FIXME: user debugging script for this
			},

			addUser: function(){
				var entity = The.player;
				this.createCharacter(entity);
				this.addCharacter(entity);
				this.addPlayer(entity);
				this.characters[entity.id].setToUser();
			},

			handleItems: function(){

				user.hook('clickedItem', this).after(function(item){
					var page = map.pages[item.page],
						y    = item.coord.y,//parseInt(item.coord / Env.pageWidth),
						x    = item.coord.x,//item.coord - y*Env.pageWidth,
						tile = new Tile( x, y ),
						path = map.pathfinding.findPath( player, tile );
					console.log(item);
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
						console.log("Zawww I couldn't get the item :(");
					});
				});

				server.registerHandler(EVT_GET_ITEM);
				server.handler(EVT_GET_ITEM).set(function(evt, data){
					var page = null;
					if (!_.isObject(data)) return;
					if (!data.hasOwnProperty('page')) return;
					if (!data.hasOwnProperty('coord')) return;

					if (!The.map.pages.hasOwnProperty(data.page)) return;
					page = The.map.pages[data.page];

					if (!page.items.hasOwnProperty(data.coord)) return;
					delete page.items[data.coord];
				});

				server.registerHandler(EVT_USE_ITEM);
				server.handler(EVT_USE_ITEM).set(function(evt, data){
					var base      = null,
						character = null,
						args      = null,
						result    = null;

					if (!_.isObject(data)) return;
					if (!data.hasOwnProperty('base')) return;
					if (!data.hasOwnProperty('character')) return;

					if (!Resources.items.base.hasOwnProperty(data.base)) return;
					if (!The.map.movables.hasOwnProperty(data.character)) return;

					base = Resources.items.base[data.base];
					character = The.map.movables[data.character].character;

					if (!base.hasOwnProperty('invoke')) return;
					result = base.invoke(character, data);

					if (result instanceof Error) {
						this.Log(result, LOG_ERROR);
					}
				});

				server.registerHandler(EVT_DROP_ITEM);
				server.handler(EVT_DROP_ITEM).set(function(evt, data){
					var position = null,
						page     = null,
						item     = null;

					if (!_.isObject(data)) return;
					if (!data.hasOwnProperty('item')) return;
					if (!data.hasOwnProperty('position')) return;
					if (!data.hasOwnProperty('page')) return;
					if (!The.map.pages.hasOwnProperty(data.page)) return;
					if (!Resources.items.list.hasOwnProperty(data.item)) return;

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


			unload: function(){
				map.unhook(this);
			}
		};
	};

	return Game;
});
