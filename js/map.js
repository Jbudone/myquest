define(['eventful', 'dynamic', 'hookable', 'page', 'movable', 'loggable', 'pathfinding'], function(Eventful, Dynamic, Hookable, Page, Movable, Loggable, Pathfinding){
	
	/* Map
	 *
	 *
	 * MapFile:
	 * 	Map: {
	 * 	 [0]: {
	 * 	 	[0]: {
	 * 	 		tiles: [,,,,,,,50,,23,2,,38,83,,,,,,], // Sparse list of tiles
	 * 	 		base: 84,
	 *		},
	 *		[50]: {
	 *			...
	 *		},
	 *	},
	 *	...
	 *}
	 *******************************************************/
	var Map = function(id){
		Ext.extend(this,'map');
		extendClass(this).with(Eventful);
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		extendClass(this).with(Dynamic);

		this.Log("Loading map..");

		if (id) {
			this.id = id;
			this.map = Resources.maps[id];

			if (!this.map) throw new Error("No map found: ("+ id +")");
		}
		this.eventsQueue = [];
		this.pages       = {};
		this.pagesPerRow = null; // TODO: fetch this from server
		this.mapWidth    = null;
		this.mapHeight   = null;

		this.pageIndex=function(x,y){
			return this.pagesPerRow*y+x;
		};

		this.sheet       = null;// Resources.findSheetFromFile('tilesheet.png'); // FIXME: should this be here?
		this.pathfinding = new Pathfinding(this);
		this.lastUpdated = now();

		this.getEntityFromPage = function(page, entityID){
			if (_.isFinite(page)) page = this.pages[page];
			
			if (page && page instanceof Page) {
				return page.movables[entityID];
			} else if (Env.isServer) {
				return new Error("Could not find page to get entity");
			}

			return null;
		};


		/************************************************************************************************
		 **************************


		 								 MOVABLE EVENT HANDLING


																	 ************************************
		 ***********************************************************************************************/

		this.movables = {};
		this.interactables = {};

		// Watch Entity
		//
		// Listen to an entity within the map, whenever its moving and needs to be switched between pages
		this.registerHook('addedentity');
		this.checkEntityZoned = function(entity){

			if (!(entity instanceof Movable)) {
				this.Log("Checking for entity zoning, but not an entity..", LOG_ERROR);
				return new Error("Checking for entity zoning, but not an entity..");
			}

			// Check if entity in new page
			var pageY   = parseInt(entity.position.global.y / (Env.tileSize*Env.pageHeight)),
				pageX   = parseInt(entity.position.global.x / (Env.tileSize*Env.pageWidth)),
				pageI   = this.pageIndex(pageX, pageY),
				oldPage = null,
				newPage = null,
				newPos  = null;

			// Zoned to new page?
			if (pageI != entity.page.index) {
				newPage = this.pages[ pageI ];

				if (!newPage && !Env.isServer) {
					// Entity has zoned to another page which we don't have loaded yet
					// There's no need to finish the rest of this, simply trigger a zone out
					entity.page.triggerEvent(EVT_ZONE, entity, null);
					this.triggerEvent(EVT_ZONE, entity, entity.page, null);
					return;
				}

				// Moved to a new pages, need to set the proper local position
				newPos = this.coordinates.localFromGlobal(entity.position.global.x, entity.position.global.y, true);
				if (_.isError(newPos)) {
					return newPos;
				}
				entity.position.local = newPos;
			}

			
			// Zoned to new map?
			var tY     = parseInt(entity.position.local.y / Env.tileSize),
				tX     = parseInt(entity.position.local.x / Env.tileSize),
				zoning = (newPage || entity.page).checkZoningTile(tX, tY);

			if (zoning) {
				newPage = zoning;
			}

			// Trigger appropriate zoning event
			if (newPage) {
				oldPage = entity.page;
				if (zoning) {
					oldPage.triggerEvent(EVT_ZONE_OUT, entity, zoning);
					this.triggerEvent(EVT_ZONE_OUT, oldPage, entity, zoning);
				} else {
					this.Log("Zoning user ["+entity.id+"] from ("+entity.page.index+") to page ("+newPage.index+")");
					var result = entity.page.zoneEntity(newPage, entity);
					if (_.isError(result)) return result;

					entity.triggerEvent(EVT_ZONE, oldPage, newPage);
					this.triggerEvent(EVT_ZONE, entity, oldPage, newPage);
				}
			}
		};

		this.watchEntity = function(entity){

			if (!(entity instanceof Movable)) throw new Error("entity is not a Movable");
			if (!entity.step) throw new Error("entity doesn't have step");
			if (this.movables[entity.id]) throw new Error("Already watching this entity!");
			if (!this.doHook('addedentity').pre(entity)) return;

			this.Log("Adding Entity["+ entity.id +"] to map");
			this.movables[entity.id] = entity;

			// Listen to the entity moving to new pages
			this.listenTo(entity, EVT_MOVED_TO_NEW_TILE, function(entity){
				this.Log("Moving to tile.. ("+entity.position.tile.x+", "+entity.position.tile.y+")["+this.id+"]", LOG_DEBUG);
				if (entity.hasOwnProperty('isZoning')) return;
				var result = this.checkEntityZoned(entity);
				if (_.isError(result)) {
					throw result;
				}
			}, HIGH_PRIORITY);

			this.listenTo(entity, EVT_DIED, function(entity){

				/* NOTE: doing this would prevent any stepping for the dead entity. Better to keep
				 * them in the page updateList and simply store them as dead (not sending any updates)
				var page   = entity.page;
				delete page.movables[entity.id];
				for (var i=0; i<page.updateList.length; ++i) {
					if (page.updateList[i] == entity) {
						page.updateList.splice(i,1);
						break;
					}
				}

				page.stopListeningTo(entity);
				this.unwatchEntity(entity);
				*/
			});

			this.doHook('addedentity').post(entity);
		};

		this.unwatchEntity = function(entity){

			if (!(entity instanceof Movable)) throw new Error("entity is not a Movable");
			if (!this.movables[entity.id]) throw new Error("Not currently watching entity: ("+ entity.id +")");

			this.stopListeningTo(entity);
			delete this.movables[entity.id];
		};


		// Remove the entity from the map/page
		this.registerHook('removedentity');
		this.removeEntity = function(entity){
			if (!(entity instanceof Movable)) throw new Error("Entity not a Movable");

			if (!this.doHook('removedentity').pre(entity)) return;

			var page                    = entity.page,
				foundEntityInUpdateList = false,
				result                  = null;
			if (!(page instanceof Page)) throw new Error("Entity does not have a page");
			if (!page.movables.hasOwnProperty(entity.id)) throw new Error("Entity page does not contain entity");

			delete page.movables[entity.id];
			for (var i=0; i<page.updateList.length; ++i) {
				if (page.updateList[i] == entity) {
					page.updateList.splice(i,1);
					foundEntityInUpdateList = true;
					break;
				}
			}
			if (!foundEntityInUpdateList) throw new Error("Could not find entity in page update list");

			page.stopListeningTo(entity);
			result = this.unwatchEntity(entity);
			if (_.isError(result)) throw result;

			this.doHook('removedentity').post(entity);
		};



		/************************************************************************************************
		 **************************


		 								 PATHFINDING OPERATIONS


																	 ************************************
		 ***********************************************************************************************/




		// Recalibrate a path from the movable's state to the starting point of the path
		//	Server: When the user sends a path request, but we're slightly behind in their local position, then
		//			we need to recalibrate the path to start from their server position to their expected
		//			position, and add this into the path
		//	Client: When the server sends us some path for an entity, but that entity isn't at the start path
		//			position (most likely they're still walking there), then need to recalibrate the path from
		//			the local entity position to the start of the path
		//
		//
		// state: The (x, y) global real position
		// pathState: Start position of path
		// path: Path object
		//
		// NOTE: The recalibration will be injected into the path
		this.recalibratePath=function(state, pathState, path, maxWalk){

			var map          = this,
				debugLogging = false,
				logWalk      = new Function(),
				logPath      = new Function();

			if (debugLogging) {
				console.log("	Recalibrating path..");
				console.log("	Path State: ("+pathState.y+","+pathState.x+")");
				console.log("	Player (current) State: ("+state.y+","+state.x+")");



				var logWalk = function(walk) {
					var dir = null;
					if (walk.direction == NORTH) dir = "NORTH";
					else if (walk.direction == SOUTH) dir = "SOUTH";
					else if (walk.direction == WEST)  dir = "WEST";
					else if (walk.direction == EAST)  dir = "EAST";
					console.log("		Walk: "+dir+"  ("+walk.distance+")");
				}, logPath = function(path) {
					console.log("	Path:");
					for (var j=0; j<path.walks.length; ++j) {
						logWalk(path.walks[j]);
					}
				}
			}



		   // 	> if state & reqstate not equal, extend path w/ position TO initial state
		   ///////////////////////////////////////

		   var findNearestTiles = function(posX, posY) {
			   // NOTE: use global real coordinates
			   var tiles = map.findNearestTiles(posX, posY);
			   if (_.isError(tiles)) return tiles;

			   // filter open tiles
			   tiles.filter(function(tile){
				   var localCoordinates = map.localFromGlobalCoordinates(tile.x, tile.y);
				   if (_.isError(localCoordinates)) return false;

				   return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
			   });

			   return tiles;
		   }, findShortestPath = function(tilesStart, tilesEnd) {

			   // TODO: remove this..
			   var path = map.findPath(tilesStart, tilesEnd);
			   if (_.isError(path)) return path;
			   if (!path) return false;
			   if (!path.path) {
				   return {
					   path: null,
					   tile: path.start.tile
				   };
			   }

			   return {
				   path:      path.path,
				   startTile: path.start,
				   endTile:   path.end
			   };

		   }, recalibrationWalk = function(tile, posX, posY) {
			   // NOTE: global real coordinates

			   var path = [];

			   if (posY != tile.y * Env.tileSize) {
				   // Inject walk to this tile
				   var distance    = -1*(posY - tile.y * Env.tileSize),
					   walk        = new Walk((distance<0?NORTH:SOUTH), Math.abs(distance), tile.offset(0, 0));
				   path.unshift(walk);
			   }

			   if ( posX != tile.x * Env.tileSize) {
				   // Inject walk to this tile
				   var distance    = -1*(posX - tile.x * Env.tileSize),
					   walk        = new Walk((distance<0?WEST:EAST), Math.abs(distance), tile.offset(0, 0));
				   path.unshift(walk);
			   }

			   return path;
		   };

		   // Check Path
		   //
		   // If player is not currently standing on starting point for path, then inject a
		   // path from current position to that starting point
		   if (pathState.y != state.y || pathState.x != state.x) {

			   // Need to inject any necessary walk from the player position to the starting
			   // point for the path,
			   //
			   //  Player Position -> Near Tile/Player -> Near Tile/Path -> Path-Start Position
			   //
			   //
			   // Player Position (real coordinates)
			   // Nearest Tile to Player (discrete tile)
			   // Nearest Tile to Path-Start (discrete tile)
			   // Path-Start Position (real coordinates)


			   // Recalibrate path if necessary
			   // NOTE: use player.posY/posX since we need local real coordinates to
			   // 		determine offsets from the tile
			   var startTiles = findNearestTiles( state.x, state.y ),
				   endTiles   = findNearestTiles( pathState.x, pathState.y ),
				   startPath  = null,
				   startTile  = null,
				   endTile    = null;

			   if (_.isError(startTiles)) return startTiles;
			   if (_.isError(endTiles)) return endTiles;

			   if (startTiles.length == 0) {
				   console.log("	No startTiles found.."+now());
				   console.log(player.position.local.y);
				   console.log(player.position.local.x);
				   return false;
			   } else {
				   startPath  = findShortestPath( startTiles, endTiles );
				   if (_.isError(startPath)) return startPath;
			   }

			   if (startPath) {
				   if (!startPath.path) {

					   // Player Position -> Path-Start Position
					   var tile               = startPath.tile;
						   startTile          = tile;
						   endTile            = tile,
						   recalibrationStart = null;

					   if (startTile.tile) return new Error("No startTile found..");
					   recalibrationStart = recalibrationWalk(startTile, state.x, state.y);
					   if (_.isError(recalibrationStart)) return recalibrationStart;

					   // extend walk from position to start
					   for (var j=recalibrationStart.length-1; j>=0; --j) {
						   path.walks.unshift( recalibrationStart[j] );

						   // This single walk is far too long
						   if (recalibrationStart[j].distance > 32) {
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log("ISSUE HERE A!!!");
							   console.log(startTiles);
							   console.log(endTiles);
							   logPath(path);
							   return false;
						   }
					   }

					   // This entire path is greater than our maximum path length
					   if (path.length() > maxWalk) {
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   console.log("ISSUE HERE D!!!");
						   logPath(path);
						   return false;
					   } else {

						   return true;
						   // var pathCpy = extendClass({}).with(path);
						   // pathCpy.time = action.time;
						   // pathCpy.state = action.state;
						   // you.pathArchive.addEvent(pathCpy); // TODO: need to pushArchive for path sometimes

						   // your.player.path=null;
						   // console.log("Adding Path..a");
						   // logPath(path);
						   // your.player.addPath(path);

						   // var response = new Response(action.id),
						   // client   = your.client;
						   // response.success = true;
						   // client.send(response.serialize());
						   // your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes

						   // eventsArchive.addEvent(action);
					   }

				   } else {

					   // Path length is greater than our maximum path length
					   if (startPath.path.length() > maxWalk) {
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log("ISSUE HERE C!!!");
						   console.log(startTiles);
						   console.log(endTiles);
						   logPath(path);
						   return false;

					   }
					   startTile = startPath.startTile;
					   endTile   = startPath.endTile;

					   var recalibrationStart = recalibrationWalk(startTile.tile, state.x, state.y),
						   recalibrationEnd   = recalibrationWalk(endTile.tile, pathState.x, pathState.y);

					   if (_.isError(recalibrationStart)) return recalibrationStart;
					   if (_.isError(recalibrationEnd)) return recalibrationEnd;

					   // extend walk from position to start
					   for (var j=0; j<recalibrationStart.length; ++j) {
						   startPath.path.walks.unshift( recalibrationStart[j] );

						   // This single walk is too long
						   if (recalibrationStart[j].distance > 32) {
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   console.log("ISSUE HERE B!!!");
							   logWalk(recalibrationStart);
							   logWalk(recalibrationEnd);
							   console.log(startTiles);
							   console.log(endTiles);
							   logPath(path);
							   return false;
						   }
					   }

					   // extend walk from end to req state
					   for (var j=0; j<recalibrationEnd.length; ++j) {
						   var dir = recalibrationEnd[j].direction;
						   if (dir == NORTH) recalibrationEnd[j].direction = SOUTH;
						   else if (dir == SOUTH) recalibrationEnd[j].direction = NORTH;
						   else if (dir == WEST)  recalibrationEnd[j].direction = EAST;
						   else if (dir == EAST)  recalibrationEnd[j].direction = WEST;
						   startPath.path.walks.push( recalibrationEnd[j] );
					   }


					   // TODO TODO TODO
					   // 			IF walk[0] AND adjusted walk are in same direction, add the steps
					   // 			together

					   for (var j=startPath.path.walks.length-1; j>=0; --j) {
						   path.walks.unshift( startPath.path.walks[j] );
					   }


					   // This entire path is longer than our maximum path length
					   if (path.length() > maxWalk) {
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log("ISSUE HERE E!!!");
						   console.log(startTiles);
						   console.log(endTiles);
						   logPath(path);
						   return false;
					   } else {
						   return true;
						   // var pathCpy = extendClass({}).with(path);
						   // pathCpy.time = action.time;
						   // pathCpy.state = action.state;
						   // you.pathArchive.addEvent(pathCpy); // TODO: need to pushArchive for path sometimes

						   // your.player.path=null;
						   // console.log("Adding Path..b");
						   // logWalk(recalibrationStart);
						   // logWalk(recalibrationEnd);
						   // logPath(path);
						   // your.player.addPath(path);

						   // var response = new Response(action.id),
							   // client   = your.client;
						   // response.success = true;
						   // client.send(response.serialize());
						   // your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes

						   // // TODO: global event listener on sprites for starting new walk, add to eventsArchive
						   // eventsArchive.addEvent(action);
						   // continue;
					   }
				   }

			   } else {
				   console.log("No path found to get from current player position to req state..");
				   console.log("--------------------------------");
				   var startTiles = findNearestTiles( state.x, state.y ),
					   endTiles   = findNearestTiles( pathState.x, pathState.y );
				   console.log(startTiles);
				   console.log(endTiles);
				   console.log("--------------------------------");
				   return false;
			   }


			   return false;


			   // TODO: pathfind from tile to tile
			   // TODO: adjust walk[0] from curState to path start
			   // 			IF walk[0] AND adjusted walk are in same direction, add the steps
			   // 			together
			   // TODO: adjust path end to req state


			   // 	> if extension is TOO large, disallow
		   } else {

			   // use this path
			   return true;
			   // var path = new Path(),
			   // walk = new Walk();

			   // walk.fromJSON(action.data);
			   // path.walks.push(walk);

			   // var pathCpy = extendClass({}).with(path);
			   // pathCpy.time = action.time;
			   // pathCpy.state = action.state;
			   // you.pathArchive.addEvent(pathCpy); // TODO: need to pushArchive for path sometimes

			   // your.player.path=null;
			   // console.log("Adding Path..c");
			   // logPath(path);
			   // your.player.addPath(path);

			   // var response = new Response(action.id),
			   // client   = your.client;
			   // response.success = true;
			   // client.send(response.serialize());
			   // your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes

			   // // TODO: split path into multiple walks of size <= 2
			   // // TODO: global event listener on sprites for starting new walk, add to eventsArchive
			   // eventsArchive.addEvent(action);
			   // continue;
		   }

		   return false;
		};
		
		// NOTE: returns { path: null } if we're already there
		this.findPath=function(fromTiles, toTiles, _maxWeight){

			if (!_.isArray(fromTiles) || !fromTiles.length) return new Error("No tiles to start from..");
			if (!_.isArray(toTiles) || !toTiles.length) return new Error("No tiles to walk to..");

			if (_maxWeight === 0) _maxWeight = 10000000;

			var TileNode = function(tile, directionToTile, walkTime, previousTile, ignoreHeuristics){
				this.tile               = tile;
				this.checked            = false;
				this.previousDirection  = directionToTile;
				this.weight             = walkTime;
				this.nextTile           = [];
				this.previousTile       = previousTile;
				this.nearestDestination = null;
				this.estimateCost = function(endTile){
					if (!endTile) endTile = this.nearestDestination.tile;
					if (!endTile) return null;
					var estimatedWeight = Math.abs(endTile.y - this.tile.y) + Math.abs(endTile.x - this.tile.x) + this.weight;
					return estimatedWeight;
				};

				if (!ignoreHeuristics) {
					if (previousTile && previousTile.nearestDestination) {
						if (previousTile.nearestDestination - this.weight < weightToRecheckHeuristics) {
							this.nearestDestination = previousTile.nearestDestination;
						}
					}

					if (!this.nearestDestination) {
						var cheapestWeight = 99999,
							nearestEnd = null;
						for (var i=0; i<toTiles.length; ++i) {
							var endTile = toTiles[i],
								estimatedWeight = this.estimateCost(endTile);
							if (!_.isFinite(estimatedWeight)) return new Error("path heuristic NaN");
							if (estimatedWeight < cheapestWeight) {
								nearestEnd = endTile;
							}
						}

						this.nearestDestination = new NearestDestination(nearestEnd, this.weight);
					}
				}
			};

			// Since the path can have multiple destinations, we have to compare each destination in order to
			// decide a paths heuristic estimation cost.
			//
			// In case there are a large number of destinations, its costly to loop through each of them in
			// checking our estimation cost. Instead we can keep track of the nearest destination tile to our
			// previous tile in the path. Then every X steps along that path, simply re-estimate the nearest
			// tile to use as a comparison.
			function NearestDestination(tile, weightWhenDecided){
				this.tile = tile;
				this.time = weightWhenDecided;
			};

			var start                     = [],
				end                       = [],
				nearestEnd                = null,
				openTiles                 = {},
				weightToRecheckHeuristics = 1, // TODO: fix this
				totalCostOfPathfind       = 0,
				maxWeight                 = _maxWeight || 100, // TODO: better place to store this
				neighbours                = {},
				map                       = this,
				isOpenTile = function(tile){
					var localCoordinates = map.localFromGlobalCoordinates(tile.x, tile.y);
					if (_.isError(localCoordinates)) return false;

					return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
				}, getNeighbours = function(tileNode){
					// return tiles neighbours
					var tile  = tileNode.tile,
						north = null,
						east  = null,
						south = null,
						west  = null,
						neighbours = [],
						weight = tileNode.weight+1;

					west  = map.tileFromGlobalCoordinates(tile.x-1, tile.y);
					south = map.tileFromGlobalCoordinates(tile.x,   tile.y+1);
					east  = map.tileFromGlobalCoordinates(tile.x+1, tile.y);
					north = map.tileFromGlobalCoordinates(tile.x,   tile.y-1);

					if (north instanceof Tile) { ++totalCostOfPathfind; neighbours.push( new TileNode(north,'n',weight,tileNode) ); }
					if (east  instanceof Tile) { ++totalCostOfPathfind; neighbours.push( new TileNode(east,'e',weight,tileNode) );  }
					if (south instanceof Tile) { ++totalCostOfPathfind; neighbours.push( new TileNode(south,'s',weight,tileNode) ); }
					if (west  instanceof Tile) { ++totalCostOfPathfind; neighbours.push( new TileNode(west,'w',weight,tileNode) );  }

					return neighbours;
				}, hashCoordinates = function(x,y){
					var magicNumber = maxWeight+Env.pageWidth;
					return y*magicNumber+x;
				};


			// NOTE: must setup the toTiles first so that the fromTiles may properly estimate their nearest
			// destination tile
			for (var i=0; i<toTiles.length; ++i) {
				var toTile          = toTiles[i],
					toCoordinates   = { y: toTile.y, x: toTile.x },
					toNode          = new TileNode(toTile, null, 9999, null, true),
					index           = hashCoordinates(toCoordinates.x, toCoordinates.y);
				if (!_.isFinite(index)) return new Error("index of ("+ toCoordinates.x +", "+ toCoordinates.y +") NaN!");

				toNode.end = true;
				neighbours[index] = toNode;
			}

			for (var i=0; i<fromTiles.length; ++i) {
				var fromTile        = fromTiles[i],
					fromCoordinates = { y: fromTile.y, x: fromTile.x },
					fromNode        = new TileNode(fromTile, null, 0, null),
					index           = hashCoordinates(fromCoordinates.x, fromCoordinates.y);
				if (!_.isFinite(index)) return new Error("index of ("+ fromCoordinates.x +", "+ fromCoordinates.y +") NaN!");

				for (var j=0; j<toTiles.length; ++j) { 
					var toTile          = toTiles[j],
						toCoordinates   = { y: toTile.y, x: toTile.x };

					if (fromCoordinates.y == toCoordinates.y &&
						fromCoordinates.x == toCoordinates.x) {

						return {
							path: null,
							start: fromNode,
							end: fromNode
						}; // One of the near tiles works
					}
				}

				start.push( fromNode );
				neighbours[index] = fromNode;
				var estimatedCost = fromNode.estimateCost();
				if (!_.isFinite(estimatedCost)) return new Error("path heuristic NaN");
				if (!openTiles[ estimatedCost ]) openTiles[estimatedCost] = [];
				openTiles[estimatedCost].push( fromNode );
			}



			if (toTiles.length == 1) weightToRecheckHeuristics = 999999;
			while (!isObjectEmpty(openTiles)) {
				var cheapestWeightClass = frontOfObject(openTiles),
					tileNode            = openTiles[cheapestWeightClass].shift(),
					tileNeighbours      = [];

				if (openTiles[cheapestWeightClass].length == 0) {
					delete openTiles[cheapestWeightClass];
				}
				if (tileNode.hasOwnProperty('expired')) continue;

				// Check each open neighbour of tile
				tileNeighbours = getNeighbours(tileNode).filter(function(neighbour){
					return isOpenTile(neighbour.tile) && neighbour.weight < maxWeight;
				});

				// Check each neighbour if they were already searched (replace if necessary), otherwise add
				for(i=0; i<tileNeighbours.length; ++i){
					var neighbourNode = tileNeighbours[i],
						neighbour     = neighbourNode.tile,
						neighbourHash = hashCoordinates(neighbour.x, neighbour.y);
					if (!_.isFinite(neighbourHash)) return new Error("index of ("+ neighbour.x +", "+ neighbour.y +") NaN!");

					if (neighbours[neighbourHash]) {

						// Path to neighbour already exists; use whichever one is cheaper
						var existingNeighbour = neighbours[neighbourHash];// neighbours[neighbourPage][neighbour.y][neighbour.x];
						if (existingNeighbour.hasOwnProperty('end')) {
							// Found path to end
							nearestEnd                   = existingNeighbour;
							nearestEnd.previousDirection = neighbourNode.previousDirection;
							nearestEnd.weight            = neighbourNode.weight;
							nearestEnd.previousTile      = neighbourNode.previousTile;
							break;
						} else if (existingNeighbour.weight <= neighbourNode.weight) {
							continue; // This neighbour is a cheaper path, ignore our current path..
						} else {
							existingNeighbour.expired = true;
							neighbours[neighbourHash] = neighbourNode;
							var estimatedCost = neighbourNode.estimateCost();
							if (!_.isFinite(estimatedCost)) return new Error("path heuristic NaN");
							if (!openTiles[ estimatedCost ]) openTiles[estimatedCost] = [];
							openTiles[estimatedCost].push( neighbourNode );
							// This existing neighbour has a faster path than ours
							// console.log('The UNEXPECTED has happened!! A*');
							// throw new UnexpectedError("Unexpected neighbour in path with weight less than this..");
						}
					} else {
						// add neighbour
						neighbours[neighbourHash] = neighbourNode;
						var estimatedCost = neighbourNode.estimateCost();
						if (!_.isFinite(estimatedCost)) return new Error("path heuristic NaN");
						if (!openTiles[ estimatedCost ]) openTiles[estimatedCost] = [];
						openTiles[estimatedCost].push( neighbourNode );
					}
				}
				if (nearestEnd) break; // Turns out one of the neighbours was the end
			}


			if (nearestEnd) { 
				// Build path working backwards from this..
				console.log("Path found is: "+nearestEnd.weight+" steps..  FOUND IN "+totalCostOfPathfind+" iterations");

				// continue stepping backwards and walk.steps++ until direction changes, then create a new walk
				var path                 = new Path(),
					nextTile             = nearestEnd.previousTile,
					direction            = nearestEnd.previousDirection,
					startTile            = null,
					dir                  = null;
				     if (direction == 'n') dir = NORTH;
				else if (direction == 's') dir = SOUTH;
				else if (direction == 'e') dir = EAST;
				else if (direction == 'w') dir = WEST;
				path.walks.unshift( new Walk(dir, Env.tileSize, null) );
				while(true){
					if (nextTile.previousDirection == null) {
						startTile = nextTile;
						break; // Finished path (one of the start nodes)
					}
					if (nextTile.previousDirection!=direction) {
						direction = nextTile.previousDirection;
						var dir   = null;
						     if (direction == 'n') dir = NORTH;
						else if (direction == 's') dir = SOUTH;
						else if (direction == 'e') dir = EAST;
						else if (direction == 'w') dir = WEST;
						path.walks[0].destination = nextTile.tile;
						path.walks.unshift( new Walk(dir, Env.tileSize, null) );
					} else {
						path.walks[0].distance += Env.tileSize;
					}
					nextTile = nextTile.previousTile;
				}

				path.walks[0].destination = startTile.tile;
				path.start                = startTile.tile;
				return {
					path: path,
					start: startTile,
					end: nearestEnd
				};
			} else {
				return false; // No path found..
			}

			return false;

		};







		/************************************************************************************************
		 **************************


		 								 COORDINATE CALCULATIONS


																	 ************************************
		 ***********************************************************************************************/


		this.coordinates = (function(){

			return {
			globalFromLocal: (function(x, y, page, isReal){

				if (!(page instanceof Page)) {
					return new Error("No page provided");
				}

				if (!isReal) {
					x *= Env.tileSize;
					y *= Env.tileSize;
				}

				var pageY   = page.y * Env.tileSize,
					pageX   = page.x * Env.tileSize,
					globalY = y+pageY,
					globalX = x+pageX;

				if (isNaN(globalY) || isNaN(globalX)) {
					return new Error("Bad coordinated calculated");
				}

				return {
					y: globalY,
					x: globalX
				};

			}.bind(this)),

			globalTileFromLocal: (function(x, y, page, isReal){

				if (!(page instanceof Page)) {
					return new Error("No page provided");
				}

				if (isReal) {
					x /= Env.tileSize;
					y /= Env.tileSize;
				}

				var pageY   = page.y,
					pageX   = page.x,
					globalY = y+pageY,
					globalX = x+pageX;

				if (isNaN(globalY) || isNaN(globalX)) {
					return new Error("Bad coordinated calculated");
				}

				return {
					y: globalY,
					x: globalX
				};

			}.bind(this)),

			localFromGlobal: (function(x, y, isReal){

				var localTileX = (isReal? x/Env.tileSize : x),
					localTileY = (isReal? y/Env.tileSize : y);
				if (!isReal) {
					x *= Env.tileSize;
					y *= Env.tileSize;
				}

				var pageY  = parseInt( localTileY/Env.pageHeight ),
					pageX  = parseInt( localTileX/Env.pageWidth ),
					pageI  = this.pageIndex(pageX, pageY),
					page   = null,
					localY = y % (Env.tileSize*Env.pageHeight),
					localX = x % (Env.tileSize*Env.pageWidth);

				if (isNaN(pageI) || !this.pages[pageI]) {
					this.Log("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]", LOG_ERROR);
					return new Error("Bad page found");
				}

				page = this.pages[pageI];

				if (page.y != pageY*Env.pageHeight ||
					page.x != pageX*Env.pageWidth) {
						this.Log("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]", LOG_ERROR);
						return new Error("Bad page found");
				}


				if (isNaN(localY) || isNaN(localX)) {
					return new Error("Bad coordinated calculated");
				}


				return {
					y: localY,
					x: localX,
					page: page
				};
			}.bind(this)),

			localTileFromGlobal: (function(x, y, isReal){

				if (isReal) {
					x /= Env.tileSize;
					y /= Env.tileSize;
				}

				var pageY  = parseInt( y/Env.pageHeight ),
					pageX  = parseInt( x/Env.pageWidth ),
					pageI  = this.pageIndex(pageX, pageY),
					page   = null,
					localY = y % (Env.pageHeight),
					localX = x % (Env.pageWidth);


				if (isNaN(pageI) || !this.pages[pageI]) {
					this.Log("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]", LOG_ERROR);
					return new Error("Bad page found");
				}

				page = this.pages[pageI];

				if (page.y != pageY*Env.pageHeight ||
					page.x != pageX*Env.pageWidth) {
						this.Log("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]", LOG_ERROR);
						return new Error("Bad page found");
				}

				if (isNaN(localY) || isNaN(localX)) {
					return new Error("Bad coordinated calculated");
				}


				return {
					y: localY,
					x: localX,
					page: page
				};
			}.bind(this))
			};
		}.bind(this)());


		this.localFromGlobalCoordinates = function(x, y){
			var pageY  = parseInt( y/Env.pageHeight ),
				pageX  = parseInt( x/Env.pageWidth ),
				pageI  = this.pageIndex(pageX, pageY),
				page   = null,
				localY = y % (Env.pageHeight),
				localX = x % (Env.pageWidth);

			if (isNaN(pageI) || !this.pages[pageI]) {
				return new Error("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]");
			}

			page = this.pages[pageI];

			if (page.y != pageY*Env.pageHeight ||
				page.x != pageX*Env.pageWidth) {
					this.Log("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]", LOG_ERROR);
					return new Error("Bad page found");
			}

			if (isNaN(localY) || isNaN(localX)) {
				return new Error("Bad coordinated calculated");
			}


			return {
				y: localY,
				x: localX,
				page: page
			};
		};

		this.globalFromLocalCoordinates=function(x, y, page){

			if (!(page instanceof Page)) {
				return new Error("No page provided");
			}

			var pageY   = page.y,
				pageX   = page.x,
				globalY = y+pageY,
				globalX = x+pageX;

			if (isNaN(globalY) || isNaN(globalX)) {
				return new Error("Bad coordinated calculated");
			}


			return {
				y: globalY,
				x: globalX
			};
		};

		this.isTileInRange=function(tile){
			if (isNaN(tile.x) || isNaN(tile.y)) {
				return new Error("Tile has bad coordinates");
			}

			if (tile.x > this.mapWidth ||
				tile.y > this.mapHeight ||
				tile.x < 0 || tile.y < 0) {
					return false;
				}
			return true;
		};

		this.tileFromGlobalCoordinates = function(x, y){
			var tile    = new Tile(x, y),
				inRange = this.isTileInRange(tile);

			if (inRange === true) {
				return tile;
			} else if (inRange instanceof Error) {
				inRange.print();
				return inRange;
			} else {
				return new Error("Bad tile range: ("+ y +", "+ x +")");
			}
		};


		this.tileFromLocalCoordinates=function(x, y, page){

			var page              = page || this.curPage,
				globalCoordinates = null,
				tile              = null,
				inRange           = null;
			
			if (!(page instanceof Page)) {
				return new Error("No page provided, and no current page loaded");
			}

			globalCoordinates = this.globalFromLocalCoordinates(x, y, page);
			if (globalCoordinates instanceof Error) {
				return globalCoordinates;
			}

			tile    = new Tile(globalCoordinates.x, globalCoordinates.y);
			inRange = this.isTileInRange(tile);

			if (inRange === true) {
				return tile;
			} else if (inRange instanceof Error) {
				return inRange;
			} else {
				return new Error("Bad range: ("+ tile.y +","+ tile.x +")");
			}
			return tile;
		};

		this.findNearestTile=function(posX, posY) {
			// NOTE: global real coordinates return tile nearest to position
			var tileY   = Math.round(posY/Env.tileSize),
				tileX   = Math.round(posX/Env.tileSize),
				tile    = (new Tile(tileX, tileY)),
				inRange = this.isTileInRange(tile);

			if (inRange === true) {
				return tile;
			} else if (inRange instanceof Error) {
				return inRange;
			} else {
				return new RangeError("Bad range: ("+ tile.y +","+ tile.x +")");
			}
		};

		this.findNearestTiles = function(posX, posY) {
			// NOTE: global real coordinates
			var tiles   = [],
				onTileY = (posY % Env.tileSize === 0),
				onTileX = (posX % Env.tileSize === 0);


			if (!onTileY && !onTileX) {

				// FIXME: THIS SHOULDN"T OCCUR BUT QUITE OFTEN DOES!
				// this.Log("On this tile: "+ posX +", "+ posY, LOG_ERROR);
				// debugger; // NOTE: this seems to occur on client side, for other entities than the user
				// return new Error("findNearestTiles when not on a proper tileY NOR tileX");
				var nearestTile = this.findNearestTile(posX, posY);
				if (nearestTile instanceof Tile) {
					tiles.push( nearestTile );
				} else if (_.isError(nearestTile)) {
					return nearestTile;
				}

			} else if (onTileY && onTileX) {

				var nearestTile = this.findNearestTile(posX, posY);
				if (nearestTile instanceof Tile) {
					tiles.push( nearestTile );
				} else if (_.isError(nearestTile)) {
					return nearestTile;
				}

			} else {

				if (!onTileY) {
					var tileYfloor = Math.floor(posY/Env.tileSize), // global coordinates
						tileX      = Math.floor(posX/Env.tileSize),
						tileNorth  = (new Tile(tileX, tileYfloor)),
						tileSouth  = (new Tile(tileX, tileYfloor+1));

					if (tileNorth instanceof Tile && this.isTileInRange(tileNorth) === true) tiles.push( tileNorth );
					if (tileSouth instanceof Tile && this.isTileInRange(tileSouth) === true) tiles.push( tileSouth );
				}

				if (!onTileX) {
					var tileXfloor = Math.floor(posX/Env.tileSize), // global coordinates
						tileY      = Math.floor(posY/Env.tileSize),
						tileWest   = (new Tile(tileXfloor, tileY)),
						tileEast   = (new Tile(tileXfloor+1, tileY));

					if (tileWest instanceof Tile && this.isTileInRange(tileWest) === true) tiles.push( tileWest );
					if (tileEast instanceof Tile && this.isTileInRange(tileEast) === true) tiles.push( tileEast );
				}

			}

			return tiles;
		};

		this.isTileOpen = function(tile){
		   var localCoordinates = this.localFromGlobalCoordinates(tile.x, tile.y);

		   if (localCoordinates instanceof Error) {
			   return false;
		   }

		   return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
		};

		this.getTilesInRange = function(tile, range, filterOpenTiles){

			if (isNaN(range) || range < 0) return new Error("getTilesInRange expects range >= 0: "+range);
			
			var left   = null,
				right  = null,
				top    = null,
				bottom = null,
				tiles  = [];

			if (tile instanceof Array) {
				_.each(tile, function(t){
					if (left==null  || t.x < left)   left   = t.x;
					if (right==null || t.x > right)  right  = t.x;
					if (top==null   || t.y < top)    top    = t.y;
					if (bottom==null|| t.y > bottom) bottom = t.y;
				});
			} else {
				left   = tile.x;
				right  = tile.x;
				top    = tile.y;
				bottom = tile.y;
			}

			left   = Math.max(left - range, 0);
			right  = Math.min(right + range, this.mapWidth);
			top    = Math.max(top - range, 0);
			bottom = Math.min(bottom + range, this.mapHeight);

			// console.log("Bounds: {("+top+":"+bottom+"), ("+left+":"+right+")} :: ("+this.mapWidth+","+this.mapHeight+")");

			for (var y=top; y<=bottom; ++y) {
				for (var x=left; x<=right; ++x) {
					var tile = new Tile(x, y);
					if (!filterOpenTiles || this.isTileOpen(tile) === true) tiles.push( tile );
				}
			}

			return tiles;
		};

	};

	return Map;
});
