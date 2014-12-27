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
		this.delta = 0;



		this.activeTiles = {}; // Tiles which scripts are listening too (eg. characters listening to certain tiles)
		this.hashTile = function(x, y){
			return y*map.width + x;
		};
		var ActiveTile = function(x, y){

			this.hash = _game.hashTile(x, y);
			this.listeners = [];
		};

		this.createCharacter = function(entity){
			var entityID  = entity.id,
				character = null;

			if (this.characters.hasOwnProperty(entityID)) return;
			character = _script.addScript( new Character(entity) );
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

			character.hook('die', this).then(function(){
				this.removeCharacter(character.entity);
				if (character.isPlayer) {
					this.removePlayer(character.entity);
				}

				character.entity.page.map.removeEntity(character.entity);
				this.respawning[character.entity.id] = character;

				character.hook('die', this).remove();
			});

			console.log("Added character to Game: "+entityID);
			this.doHook('addedcharacter').post(entity);
		};

		this.removeCharacter = function(entity){
			var entityID  = entity.id,
				character = entity.character;
			if (!(character instanceof Character)) return UnexpectedError("Entity not a character");
			if (!this.characters.hasOwnProperty(entityID)) return;
			if (!this.doHook('removedcharacter').pre(entity)) return;
			delete this.characters[entityID];

			character.hook('die', this).remove();
			_script.removeScript( character._script );
			
			console.log("Removed character from Game: "+entityID);
			this.doHook('removedcharacter').post(entity);
		};

		this.addPlayer = function(entity){
			var playerID = entity.playerID;
			if (this.players.hasOwnProperty(playerID)) return;
			if (!this.doHook('addedplayer').pre(entity)) return;
			this.players[playerID] = entity;
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

			map.hook('addedentity', this).then(function(entity){

				// Create a new character object for this entity if one hasn't been created yet
				if (!(entity.character instanceof Character)) {
					this.createCharacter.call(this, entity);
				}

				this.addCharacter.call(this, entity);
				if (entity.playerID) {
					this.addPlayer.call(this, entity);
				}
			});

			map.hook('removedentity', this).then(function(entity){
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
				extendClass(_game).with(Hookable);
				extendClass(_game).with(Loggable);
				
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
				}.bind(_game));
			},

			unload: function(){
				this.stopAllEventsAndListeners();
				map.handler('step').unset();
				map.unhook(this);
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

				window['game'] = _game; // FIXME: user debugging script for this
			},

			addUser: function(){
				var entity = The.player;
				this.createCharacter(entity);
				this.addCharacter(entity);
				this.addPlayer(entity);
				this.characters[entity.id].setToUser();
			},


			unload: function(){
				map.unhook(this);
			}
		};
	};

	return Game;
});
