define(['SCRIPTENV', 'hookable', 'scripts/character.ai.ability'], function(SCRIPTENV, Hookable, Ability){

	eval(SCRIPTENV);

	/* Sight
	 *
	 * 	TODO
	 * 	 - keep track of tiles in game
	 * 	 	> allow hooking/unhooking tiles; create a hash & add/remove tile
	 * 	 	> game hook character movement; check if tile exists, if so then trigger hook
	 * 	 - listen to tile
	 * 	 - trigger movement on tile; callback here
	 * 	 - initial look: clear current tiles/listening & listen to surrounding tiles; keep track of outer most
	 * 	 tiles
	 * 	 - update: (on move) loop through outer most tiles & update
	 * 	 - only consider non-collision tiles
	 *
	 * 	 Edge tiles: used for efficiently updating which tiles we're watching
	 ********/
	var Sight = function(game, combat, character){
		extendClass(this).with(Hookable);

		this.base = Ability;
		this.tiles = [];
		this.tile = null;

		this.onReady = new Function();
		var _sight = this,
			_script = null,
			game = game,
			character = character;
		this.server = {
			initialize: function(){
				_script = this;

				_sight.base();
				_sight.start.bind(_sight)();
			},


			start: function(){

				character.hook('moved', this).then(function(){
					this.updatePosition();
					this.look();
				}.bind(this));

				this.updatePosition();
				this.look();

				this.registerHook('see');
				this.onReady();
			},

			updatePosition: function(){
				var pos = character.entity.position.tile;
				this.tile = pos;
				console.log("NOW I'm here: ("+pos.x+", "+pos.y+")");
			},

			addTile: function(tile){
				this.tiles.push(tile);
				game.tile(tile.x, tile.y).listen(this, function(character){
					if (!this.doHook('see').pre(character)) return;
					this.doHook('see').post(character);
				});
			},

			clearTiles: function(){
				for (var i=0; i<this.tiles.length; ++i){
					var tile = this.tiles[i];
					game.tile(tile.x, tile.y).forget(this);
				}
				this.tiles = [];
			},

			look: function(){

				this.clearTiles();
				if (!_.isObject(this.tile)) return;

				var tilesToTest = [],
					tilesConsidered = {},
					myTile = this.tile,
					hashTile = function(x, y){
						return y*(character.entity.page.map.mapWidth)+x;
					}, isInRange = function(x, y){
						return (Math.abs(x - myTile.x) <= 1 && Math.abs(y - myTile.y) <= 1);
					};

				tilesToTest.push(this.tile);
				tilesConsidered[ hashTile(tilesToTest[0]) ] = true;
				while(tilesToTest.length) {
					var tile = tilesToTest.shift();

					if (isInRange(tile.x, tile.y)) {
						this.addTile(tile);

						var north = { x: tile.x, y: tile.y - 1 },
							west  = { x: tile.x - 1, y: tile.y },
							south = { x: tile.x, y: tile.y + 1 },
							east  = { x: tile.x + 1, y: tile.y },
							tryTiles = [north, west, south, east];

						for (var i=0; i<tryTiles.length; ++i) {
							var nTile = tryTiles[i],
								hash = hashTile(nTile.x, nTile.y);

							if (!tilesConsidered.hasOwnProperty(hash)) {
								tilesToTest.push(nTile);
								tilesConsidered[hash] = true;
							}
						}
					}
				}
			},
		};

	};

	return Sight;
});

