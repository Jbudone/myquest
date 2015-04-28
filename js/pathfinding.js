define(['movable'], function(Movable){

	var Pathfinding = function(map){

		this.map = map;

		// Find a path from point A to point B
		//
		// The start/end points can be a variety of different things: movable(s), tile(s); and the pathfinder
		// can accept a variety of options such as range, adjacent endpoint, auto recalibration, etc. 
		//
		// For movables, the pathfinder will automatically find their nearest tiles and consider each as a
		// possible to/from point.
		this.findPath = function(from, to, options){
			if (_.isUndefined(from) || _.isUndefined(to)) return false;

			if (!_.isArray(from)) from = [from];
			if (!_.isArray(to))   to   = [to];

			if (_.isUndefined(options)) options = {};
			_.defaults(options, {
				range: 0,
				adjacent: true,
				maxWeight: 100
			});


			// Fetch all possible to/from tiles
			// 
			// For targets which may be movables, they could be between one or more tiles. This will find all
			// tiles that the movable is partially between.
			var fromTiles       = [],
				toTiles         = [],
				recalibrateFrom = null;
			for (var i=0; i<from.length; ++i) {
				if (from[i] instanceof Movable) {
					recalibrateFrom = from[i].position; // FIXME: what if we're searching from multiple from positions? Would we ever need to?
				}
				var tiles = this.findTilesOf( from[i] );
				fromTiles = _.union(fromTiles, tiles);
			}
			fromTiles = this.filterTilesInRange(fromTiles, 0);
			
			for (var i=0; i<to.length; ++i) {
				var tiles = this.findTilesOf( to[i] );
				toTiles   = _.union(toTiles, tiles);
			}
			toTiles = this.filterTilesInRange(toTiles, options.range, options.adjacent);

			if (fromTiles.length === 0 || toTiles.length === 0) return false;

			var path = this.map.findPath( fromTiles, toTiles, options.maxWeight );

			if (path) {
				if (path.path) {

					if (recalibrateFrom) {
						this.recalibratePath(path, recalibrateFrom);
					}

					return path.path;
				} else {
					return ALREADY_THERE;
				}
			}
			return false;
		};

		this.recalibratePath = function(path, fromPosition){

			// inject walk to beginning of path depending on where player is relative to start tile
			var startTile    = path.start.tile,
				recalibrateY = false,
				recalibrateX = false,
				path         = path.path,
				position     = { y: fromPosition.global.y,
								 x: fromPosition.global.x }
			if (fromPosition.local.y / Env.tileSize - startTile.y >= 1) throw "BAD Y assumption";
			if (fromPosition.local.x / Env.tileSize - startTile.x >= 1) throw "BAD X assumption";
			if (position.y - startTile.y * Env.tileSize != 0) recalibrateY = true;
			if (position.x - startTile.x * Env.tileSize != 0) recalibrateX = true;

			path.splitWalks();

			if (recalibrateY) {
				// Inject walk to this tile
				var distance    = -1*(position.y - startTile.y * Env.tileSize),
					walk        = new Walk((distance<0?NORTH:SOUTH), Math.abs(distance), startTile.offset(0, 0));
				console.log("Recalibrating Walk (Y): ");
				console.log("	steps: "+distance);
				path.walks.unshift(walk);
			}
			if (recalibrateX) {
				// Inject walk to this tile
				var distance    = -1*(position.x - startTile.x * Env.tileSize),
					walk        = new Walk((distance<0?WEST:EAST), Math.abs(distance), startTile.offset(0, 0));
				console.log("Recalibrating Walk (X): ");
				console.log("	steps: "+distance+" FROM ("+fromPosition.local.x+") TO ("+startTile.x*Env.tileSize+")");
				path.walks.unshift(walk);
			}
		};

		this.filterTilesInRange = function(centerTiles, range, isAdjacent){
			if (!_.isArray(centerTiles)) centerTiles = [centerTiles];
			if (range === 0 || isNaN(range)) return centerTiles;
			if (_.isUndefined(isAdjacent)) isAdjacent = false;

			var tiles     = [],
				hashList  = {},
				tileHash  = function(tile){
					return tile.y * this.map.mapWidth + tile.x;
				}.bind(this);
			for (var i=0; i<centerTiles.length; ++i) {
				var centerTile = centerTiles[i];

				if (isAdjacent) {
					var x = centerTile.x;
					for (var y=centerTile.y - range; y<=centerTile.y + range; ++y) {
						var tile = new Tile(x, y),
							hash = tileHash(tile);
						if (hashList[hash]) continue; // Has this tile been added yet?
						hashList[hash] = true; // Hash this tile to avoid checking it again
						if (!this.isOpenTile.bind(this)(tile)) continue; // Is this tile open? (able to walk on)
						tiles.push(tile);
					}

					var y = centerTile.y;
					for (var x=centerTile.x - range; x<=centerTile.x + range; ++x) {
						var tile = new Tile(x, y),
							hash = tileHash(tile);
						if (hashList[hash]) continue; // Has this tile been added yet?
						hashList[hash] = true; // Hash this tile to avoid checking it again
						if (!this.isOpenTile.bind(this)(tile)) continue; // Is this tile open? (able to walk on)
						tiles.push(tile);
					}
				} else {
					// Create a box range about this center tile
					for (var y=centerTile.y - range; y<=centerTile.y + range; ++y) {
						for (var x=centerTile.x - range; x<=centerTile.x + range; ++x) {
							var tile = new Tile(x, y),
								hash = tileHash(tile);
							if (hashList[hash]) continue; // Has this tile been added yet?
							hashList[hash] = true; // Hash this tile to avoid checking it again
							if (!this.isOpenTile.bind(this)(tile)) continue; // Is this tile open? (able to walk on)
							tiles.push(tile);
						}
					}
				}
			}

			return tiles;
		};

		this.isOpenTile = function(tile){
			var localCoordinates = this.map.localFromGlobalCoordinates(tile.x, tile.y);

			if (localCoordinates instanceof Error) {
				return false;
			}

			return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
		};


		// Find the nearest tiles of a movable or tile
		this.findTilesOf = function(obj){
			if (_.isUndefined(obj)) {
				return [];
			}

			if (obj instanceof Movable) {
				var x = obj.position.global.x / Env.tileSize,
					y = obj.position.global.y / Env.tileSize,
					tile = obj.position.tile,
					tiles = [new Tile(tile.x, tile.y)];

				if (Math.ceil(x)  > tile.x && Math.ceil(x)  <= this.map.mapWidth)  tiles.push( new Tile( tile.x + 1, tile.x ) );
				if (Math.floor(x) < tile.x && Math.floor(x) >= 0)                  tiles.push( new Tile( tile.x - 1, tile.x ) );
				if (Math.ceil(y)  > tile.y && Math.ceil(y)  <= this.map.mapHeight) tiles.push( new Tile( tile.x, tile.y + 1 ) );
				if (Math.floor(y) < tile.y && Math.floor(y) >= 0)                  tiles.push( new Tile( tile.x, tile.y - 1 ) );
				return tiles;
			} else if (obj instanceof Tile) {
				if (obj.hasOwnProperty('page')) {
					var page = this.map.pages[obj.page];
					return [new Tile(obj.x + page.x, obj.y + page.y)];
				} else {
					return [obj];
				}
			} else {
				return new UnexpectedError("Provided object is neither a Movable nor a Tile");
			}
		};
	};

	return Pathfinding;
});
