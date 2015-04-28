define(['SCRIPTENV', 'scripts/character', 'scripts/character.ai.instinct', 'movable', 'hookable', 'dynamic', 'loggable'], function(SCRIPTENV, Character, Instinct, Movable, Hookable, Dynamic, Loggable){

	eval(SCRIPTENV);

	var Movement = function(game, brain){
		extendClass(this).with(Hookable);
		extendClass(this).with(Dynamic);
		extendClass(this).with(Loggable);
		this.setLogGroup('Instinct');
		this.setLogPrefix('(Movement) ');


		var character = brain.character;

		this.name = 'movement';
		this.chase = function(target, range){
			if (!(target instanceof Character)) return new UnexpectedError("Target not a character");

			// TODO: chase after target

			// TODO: on path recalculating; consider using the current path and stepping backwards through the
			// path, then using A* on each tile along the path to see if there's a faster path update. This
			// would avoid a full A* recalculation
			var setCallbacks = {
				then: function(){ return setCallbacks; }, // TODO: when we got within range of player
				onPathUpdate: function(){ return setCallbacks; } // TODO: when target moves tile and path changes (to check for path distance > care-factor distance)
			};

			var path = character.entity.page.map.pathfinding.findPath(character.entity, target.entity, { range: range });
			if (path && !_.isError(path)) {
				if (path == ALREADY_THERE) {
					// We're already there..
				} else {
					character.entity.addPath(path);
				}
			}

			this.onlyonce=true;
			return setCallbacks;
		};

		this.goToTile = function(tile, range){
			if (!(tile instanceof Tile)) return new UnexpectedError("Target not a tile");

			var path = character.entity.page.map.pathfinding.findPath(character.entity, tile, { range: range, maxWeight: 0 });
			if (path && !_.isError(path)) {
				if (path == ALREADY_THERE) {
					// We're already there..
				} else {
					character.entity.addPath(path);
				}
			}

			return path;
		};

		this.inRangeOf = function(target, range, options){

			if (typeof options === undefined) options = {};
			if (isNaN(range)) range = 1;
			if (!(target instanceof Character)) return new UnexpectedError("Target not a character");

			options = _.defaults(options, {
				range: ADJACENT_RANGE
			});

			if (options.range === ADJACENT_RANGE) {
				var xDistance = Math.abs(target.entity.position.tile.x - character.entity.position.tile.x),
					yDistance = Math.abs(target.entity.position.tile.y - character.entity.position.tile.y);
				if ( (xDistance <= range && yDistance === 0) ||
					 (yDistance <= range && xDistance === 0) ) {

					return true;
				}

				return false;
			} else {
				console.error("No support for non-adjacent range checking");
			}
		};

		this.server = {
			initialize: function(){
			}
		};
	};
	Movement.prototype = new Instinct;


	return Movement;
});
