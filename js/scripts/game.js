define(['hookable'], function(Hookable){

	var Game = function(){
		this.name = "game",
		this.static = true,
		this.keys = [],
		this.components = { };
		this.hookInto = HOOK_INTO_MAP;
		var _game = this,
			map   = null;

		this.players = {};

		this.server = {
			addPlayer: function(entity){
				var playerID = entity.playerID;
				if (!this.doHook('addedplayer').pre(entity)) return;
				_game.players[playerID] = entity;
				console.log("Added player to Game: "+playerID);
				this.doHook('addedplayer').post(entity);
			},

			removePlayer: function(entity){
				var playerID = entity.playerID;
				if (!this.doHook('removedplayer').pre(entity)) return;
				delete _game.players[playerID];
				console.log("Removed player from Game: "+playerID);
				this.doHook('removedplayer').post(entity);
			},

			initialize: function(){
				console.log("INITIALIZING GAME!?");
				extendClass(this).with(Hookable);

				this.registerHook('addedplayer');
				this.registerHook('removedplayer');

				map = this.hookInto;
				map.hook('addedentity', this).then(function(entity){
					if (entity.playerID) {
						_game.addPlayer.call(this, entity);
					}
				});

				map.hook('removedentity', this).then(function(entity){
					if (entity.playerID) {
						_game.removePlayer.call(this, entity);
					}
				});


			}
		};
	};

	return Game;
});
