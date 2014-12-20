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
		}
		this.eventsQueue = [];
		this.pages = {};
		this.pagesPerRow=null; // TODO: fetch this from server
		this.mapWidth=null;
		this.mapHeight=null;

		this.pageIndex=function(y,x){
			return this.pagesPerRow*y+x;
		};

		this.sheet = null;// Resources.findSheetFromFile('tilesheet.png'); // FIXME: should this be here?
		this.pathfinding = new Pathfinding(this);
		this.lastUpdated = now();

		this.getEntityFromPage = function(page, entityID){
			if (_.isNumber(page)) page = this.pages[page];
			
			if (page) {
				return page.movables[entityID];
			}

			return null;
		};


		/************************************************************************************************
		 **************************


		 								 MOVABLE EVENT HANDLING


																	 ************************************
		 ***********************************************************************************************/

		this.movables = {};

		// Watch Entity
		//
		// Listen to an entity within the map, whenever its moving and needs to be switched between pages
		this.registerHook('addedentity');
		this.checkEntityZoned = function(entity){

			if (!(entity instanceof Movable)) {
				this.Log("Checking for entity zoning, but not an entity..", LOG_ERROR);
				return UnexpectedError("Checking for entity zoning, but not an entity..");
			}

			// Check if entity in new page
			var pageY   = parseInt(entity.position.global.y / (Env.tileSize*Env.pageHeight)),
				pageX   = parseInt(entity.position.global.x / (Env.tileSize*Env.pageWidth)),
				pageI   = this.pageIndex(pageY, pageX),
				oldPage = null,
				newPage = null;

			// Moved to a new pages, need to set the proper local position
			if (pageI != entity.page.index) {
				newPage = this.pages[ pageI ];

				entity.position.local = this.coordinates.localFromGlobal(entity.position.global.x, entity.position.global.y, true);
			}

			
			// Zoned to new map?
			var tY = parseInt(entity.position.local.y / Env.tileSize),
				tX = parseInt(entity.position.local.x / Env.tileSize),
				zoning = (newPage || entity.page).checkZoningTile(tY, tX);

			if (zoning) {
				newPage = zoning;
			}

//console.log("Player at: ["+this.position.tile.x+", "+this.position.tile.y+"]");
			if (newPage) {
				oldPage = entity.page;
				if (zoning) {
					oldPage.triggerEvent(EVT_ZONE_OUT, entity, zoning);
					this.triggerEvent(EVT_ZONE_OUT, oldPage, entity, zoning);
				} else {
					this.Log("Zoning user ["+entity.id+"] from ("+entity.page.index+") to page ("+newPage.index+")");
					entity.page.zoneEntity(newPage, entity);
					entity.triggerEvent(EVT_ZONE, oldPage, newPage);
					this.triggerEvent(EVT_ZONE, entity, oldPage, newPage);
				}
			}
		};
		this.watchEntity = function(entity){

			if (entity.step) {
				if (entity instanceof Movable) {
					if (this.movables[entity.id]) return; // Movable already being watched
					if (!this.doHook('addedentity').pre(entity)) return;
					this.Log("Adding Entity["+entity.id+"] to map");
					this.movables[entity.id] = entity;

					// Listen to the entity moving to new pages
					this.listenTo(entity, EVT_MOVED_TO_NEW_TILE, function(entity){
						this.Log("Moving to tile.. ("+entity.position.tile.x+", "+entity.position.tile.y+")", LOG_DEBUG);
						this.checkEntityZoned(entity);
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
				}
			}
		};

		this.unwatchEntity = function(entity){

			this.stopListeningTo(entity);
			delete this.movables[entity.id];
		};


		this.registerHook('removedentity');
		this.removeEntity = function(entity){
			if (!(entity instanceof Movable)) return UnexpectedError("Entity not a Movable");

			if (!this.doHook('removedentity').pre(entity)) return;

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

			this.doHook('removedentity').post(entity);
		};



		/************************************************************************************************
		 **************************


		 								 PATHFINDING OPERATIONS


																	 ************************************
		 ***********************************************************************************************/




		this.recalibratePath=function(state, pathState, path, maxWalk){

			// NOTE: state { x/y (global real) }
			var map = this;
		   try {
			   // console.log("	Recalibrating path..");
			   // console.log("	Path State: ("+pathState.y+","+pathState.x+")");
			   // console.log("	Player (current) State: ("+state.y+","+state.x+")");



			   var logWalk = function(walk) {
				   var dir = null;
						if (walk.direction == NORTH) dir = "NORTH";
				   else if (walk.direction == SOUTH) dir = "SOUTH";
				   else if (walk.direction == WEST)  dir = "WEST";
				   else if (walk.direction == EAST)  dir = "EAST";
				   // console.log("		Walk: "+dir+"  ("+walk.distance+")");
			   }, logPath = function(path) {
				   return;
				   console.log("	Path:");
				   for (var j=0; j<path.walks.length; ++j) {
					   logWalk(path.walks[j]);
				   }
			   }



			   // 	> if state & reqstate not equal, extend path w/ position TO initial state
			   ///////////////////////////////////////

			   var findNearestTiles = function(posY, posX) {
				   // NOTE: use global real coordinates
				   // console.log("	Finding nearest tiles.. ("+ posY +","+ posX +")");
				   var tiles = map.findNearestTiles(posY, posX);

				   // filter open tiles
				   tiles.filter(function(tile){
					   var localCoordinates = map.localFromGlobalCoordinates(tile.y, tile.x);

					   if (localCoordinates instanceof Error) {
						   return false;
					   }

					   return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
				   });

				   return tiles;
			   }, findShortestPath = function(tilesStart, tilesEnd) {
				   console.log("	Finding shortest path..");

				   // TODO: remove this..
				   var path = map.findPath(tilesStart, tilesEnd);
				   if (!path) return false;
				   // console.log('found shortest path');
				   // console.log(path);
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

			   }, recalibrationWalk = function(tile, posY, posX) {
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
				   if (pathState.y != state.y ||  pathState.x != state.x) {

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
					   var startTiles = findNearestTiles( state.y, state.x ),
						   endTiles   = findNearestTiles( pathState.y, pathState.x ),
						   startPath  = null,
						   startTile  = null,
						   endTile    = null;

					   if (startTiles.length == 0) {
						   console.log("	No startTiles found.."+now());
						   console.log(player.position.local.y);
						   console.log(player.position.local.x);
						   return false;
					   } else {
						   startPath  = findShortestPath( startTiles, endTiles );
					   }
					   if (startPath) {
						   if (!startPath.path) {

							   // Player Position -> Path-Start Position
							   var tile      = startPath.tile;
								   startTile = tile;
								   endTile   = tile;

							   if (startTile.tile) throw "No startTile found..";
							   var recalibrationStart = recalibrationWalk(startTile, state.y, state.x);

							   // extend walk from position to start
							   for (var j=recalibrationStart.length-1; j>=0; --j) {
								   path.walks.unshift( recalibrationStart[j] );
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
									   // throw new Error("ISSUES");
								   }
							   }

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
								   // throw new Error("ISSUES");

							   }
							   startTile = startPath.startTile;
							   endTile   = startPath.endTile;

							   var recalibrationStart = recalibrationWalk(startTile.tile, state.y, state.x),
								   recalibrationEnd   = recalibrationWalk(endTile.tile, pathState.y, pathState.x);

							   // extend walk from position to start
							   for (var j=0; j<recalibrationStart.length; ++j) {
								   startPath.path.walks.unshift( recalibrationStart[j] );
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
									   // throw new Error("ISSUES");
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
						   var startTiles = findNearestTiles( state.y, state.x ),
							   endTiles   = findNearestTiles( pathState.y, pathState.x );
						   console.log(startTiles);
						   console.log(endTiles);
						   console.log("--------------------------------");
						   return false;
					   }


					   // var response = new Response(action.id),
						   // client   = your.client;
					   // response.success = false;
					   // client.send(response.serialize());
					   // your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes
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
		   } catch(e) {
			   console.log("Error figuring out user path..");
			   console.log(e.message);
			   return false;
		   }
		};
		
		this.findPath=function(fromTiles, toTiles){

			if (!fromTiles.length) throw "No tiles to start from..";

			function TileNode(tile, directionToTile, walkTime, previousTile, ignoreHeuristics){
				this.tile=tile;
				this.checked=false;
				this.previousDirection=directionToTile;
				this.weight=walkTime;
				this.nextTile=[];
				this.previousTile=previousTile;
				this.nearestDestination=null;
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

			var start = [],
				end   = [],
				nearestEnd = null,
				openTiles = {},
				weightToRecheckHeuristics = 1, // TODO: fix this
				totalCostOfPathfind = 0,
				maxWeight = 100, // TODO: better place to store this
				neighbours = {},
				// destination = {y: toTile.y, x: toTile.x},
				map = this,
				isOpenTile = function(tile){
					var localCoordinates = map.localFromGlobalCoordinates(tile.y, tile.x);

					if (localCoordinates instanceof Error) {
						return false;
					}

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

						try { north = map.tileFromGlobalCoordinates(tile.y-1, tile.x); }   catch(e){};
						try { east  = map.tileFromGlobalCoordinates(tile.y,   tile.x+1); } catch(e){};
						try { south = map.tileFromGlobalCoordinates(tile.y+1, tile.x); }   catch(e){};
						try { west  = map.tileFromGlobalCoordinates(tile.y,   tile.x-1); } catch(e){};

					if (north) neighbours.push( new TileNode(north,'n',weight,tileNode) );
					if (east)  neighbours.push( new TileNode(east,'e',weight,tileNode) );
					if (south) neighbours.push( new TileNode(south,'s',weight,tileNode) );
					if (west)  neighbours.push( new TileNode(west,'w',weight,tileNode) );

					if (north) ++totalCostOfPathfind;
					if (east) ++totalCostOfPathfind;
					if (south) ++totalCostOfPathfind;
					if (west) ++totalCostOfPathfind;
					return neighbours;
				}, hashCoordinates = function(y,x){
					var magicNumber = maxWeight+Env.pageWidth;
					return y*magicNumber+x;
				};


			// NOTE: must setup the toTiles first so that the fromTiles may properly estimate their nearest
			// destination tile
			for (var i=0; i<toTiles.length; ++i) {
				var toTile          = toTiles[i],
					toCoordinates   = { y: toTile.y, x: toTile.x },
					toNode          = new TileNode(toTile, null, 9999, null, true),
					index           = hashCoordinates(toCoordinates.y, toCoordinates.x);

				toNode.end = true;
				neighbours[index] = toNode;
			}

			for (var i=0; i<fromTiles.length; ++i) {
				var fromTile        = fromTiles[i],
					fromCoordinates = { y: fromTile.y, x: fromTile.x },
					fromNode        = new TileNode(fromTile, null, 0, null),
					index           = hashCoordinates(fromCoordinates.y, fromCoordinates.x);

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
						neighbourHash = hashCoordinates(neighbour.y, neighbour.x);

					if (neighbours[neighbourHash]) {

						// Path to neighbour already exists; use whichever one is cheaper
						var existingNeighbour = neighbours[neighbourHash];// neighbours[neighbourPage][neighbour.y][neighbour.x];
						if (existingNeighbour.hasOwnProperty('end')) {
							// Found path to end
							nearestEnd = existingNeighbour;
							nearestEnd.previousDirection = neighbourNode.previousDirection;
							nearestEnd.weight = neighbourNode.weight;
							nearestEnd.previousTile = neighbourNode.previousTile;
							break;
						} else if (existingNeighbour.weight <= neighbourNode.weight) {
							continue; // This neighbour is a cheaper path, ignore our current path..
						} else {
							existingNeighbour.expired = true;
							neighbours[neighbourHash] = neighbourNode;
							var estimatedCost = neighbourNode.estimateCost();
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
					return UnexpectedError("No page provided");
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
					return UnexpectedError("Bad coordinated calculated");
				}

				return {
					y: globalY,
					x: globalX
				};

			}.bind(this)),

			globalTileFromLocal: (function(x, y, page, isReal){

				if (!(page instanceof Page)) {
					return UnexpectedError("No page provided");
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
					return UnexpectedError("Bad coordinated calculated");
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
					pageI  = this.pageIndex(pageY, pageX),
					page   = null,
					localY = y % (Env.tileSize*Env.pageHeight),
					localX = x % (Env.tileSize*Env.pageWidth);

				if (isNaN(pageI) || !this.pages[pageI]) {
					this.Log("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]", LOG_ERROR);
					return new UnexpectedError("Bad page found");
				}

				page = this.pages[pageI];

				if (page.y != pageY*Env.pageHeight ||
					page.x != pageX*Env.pageWidth) {
						this.Log("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]", LOG_ERROR);
						return new MismatchError("Bad page found");
				}


				if (isNaN(localY) || isNaN(localX)) {
					return UnexpectedError("Bad coordinated calculated");
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
					pageI  = this.pageIndex(pageY, pageX),
					page   = null,
					localY = y % (Env.pageHeight),
					localX = x % (Env.pageWidth);


				if (isNaN(pageI) || !this.pages[pageI]) {
					this.Log("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]", LOG_ERROR);
					return new UnexpectedError("Bad page found");
				}

				page = this.pages[pageI];

				if (page.y != pageY*Env.pageHeight ||
					page.x != pageX*Env.pageWidth) {
						this.Log("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]", LOG_ERROR);
						return new MismatchError("Bad page found");
				}

				if (isNaN(localY) || isNaN(localX)) {
					return UnexpectedError("Bad coordinated calculated");
				}


				return {
					y: localY,
					x: localX,
					page: page
				};
			}.bind(this))
			};
		}.bind(this)());


		this.localFromGlobalCoordinates = function(y, x){
			var pageY  = parseInt( y/Env.pageHeight ),
				pageX  = parseInt( x/Env.pageWidth ),
				pageI  = this.pageIndex(pageY, pageX),
				page   = null,
				localY = y % (Env.pageHeight),
				localX = x % (Env.pageWidth);

			if (isNaN(pageI) || !this.pages[pageI]) {
				return new RangeError("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]");
			}

			page = this.pages[pageI];

			if (page.y != pageY*Env.pageHeight ||
				page.x != pageX*Env.pageWidth) {
					this.Log("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]", LOG_ERROR);
					return new MismatchError("Bad page found");
			}

			if (isNaN(localY) || isNaN(localX)) {
				return UnexpectedError("Bad coordinated calculated");
			}


			return {
				y: localY,
				x: localX,
				page: page
			};
		};

		this.globalFromLocalCoordinates=function(y, x, page){

			if (!(page instanceof Page)) {
				return UnexpectedError("No page provided");
			}

			var pageY   = page.y,
				pageX   = page.x,
				globalY = y+pageY,
				globalX = x+pageX;

			if (isNaN(globalY) || isNaN(globalX)) {
				return UnexpectedError("Bad coordinated calculated");
			}


			return {
				y: globalY,
				x: globalX
			};
		};

		this.isTileInRange=function(tile){
			if (isNaN(tile.x) || isNaN(tile.y)) {
				return UnexpectedError("Tile has bad coordinates");
			}

			if (tile.x > this.mapWidth ||
				tile.y > this.mapHeight ||
				tile.x < 0 || tile.y < 0) {
					return false;
				}
			return true;
		};

		this.tileFromGlobalCoordinates = function(y, x){
			var tile    = new Tile(y, x),
				inRange = this.isTileInRange(tile);

			if (inRange === true) {
				return tile;
			} else if (inRange instanceof Error) {
				inRange.print();
			} else {
				return new RangeError("Bad tile range: ("+ y +", "+ x +")");
			}
		};


		this.tileFromLocalCoordinates=function(y, x, page){

			var page              = page || this.curPage,
				globalCoordinates = null,
				tile              = null,
				inRange           = null;
			
			if (!(page instanceof Page)) {
				return UnexpectedError("No page provided, and no current page loaded");
			}

			globalCoordinates = this.globalFromLocalCoordinates(y, x, page);
			if (globalCoordinates instanceof Error) {
				return globalCoordinates;
			}

			tile    = new Tile(globalCoordinates.y, globalCoordinates.x);
			inRange = this.isTileInRange(tile);

			if (inRange === true) {
				return tile;
			} else if (inRange instanceof Error) {
				return inRange;
			} else {
				return new RangeError("Bad range: ("+ tile.y +","+ tile.x +")");
			}
			return tile;
		};

		this.findNearestTile=function(posY, posX) {
			// NOTE: global real coordinates return tile nearest to position
			var tileY   = Math.round(posY/Env.tileSize),
				tileX   = Math.round(posX/Env.tileSize),
				tile    = (new Tile(tileY, tileX)),
				inRange = this.isTileInRange(tile);

			if (inRange === true) {
				return tile;
			} else if (inRange instanceof Error) {
				return inRange;
			} else {
				return new RangeError("Bad range: ("+ tile.y +","+ tile.x +")");
			}
		};

		this.findNearestTiles = function(posY, posX) {
			// NOTE: global real coordinates
			var tiles   = [],
				onTileY = (posY % Env.tileSize === 0),
				onTileX = (posX % Env.tileSize === 0);


			if (!onTileY && !onTileX) {

				this.Log("On this tile: "+ posX +", "+ posY, LOG_ERROR);
				debugger;
				return new UnexpectedError("findNearestTiles when not on a proper tileY NOR tileX");

			} else if (onTileY && onTileX) {

				var nearestTile = this.findNearestTile(posY, posX);
				if (nearestTile instanceof Tile) {
					tiles.push( nearestTile );
				} else if (nearestTile instanceof Error) {
					return nearestTile;
				}

			} else {

				if (!onTileY) {
					var tileYfloor = Math.floor(posY/Env.tileSize), // global coordinates
						tileX      = Math.floor(posX/Env.tileSize),
						tileNorth  = (new Tile(tileYfloor, tileX)),
						tileSouth  = (new Tile(tileYfloor+1, tileX));

					if (tileNorth instanceof Tile && this.isTileInRange(tileNorth) === true) tiles.push( tileNorth );
					if (tileSouth instanceof Tile && this.isTileInRange(tileSouth) === true) tiles.push( tileSouth );
				}

				if (!onTileX) {
					var tileXfloor = Math.floor(posX/Env.tileSize), // global coordinates
						tileY      = Math.floor(posY/Env.tileSize),
						tileWest   = (new Tile(tileY, tileXfloor)),
						tileEast   = (new Tile(tileY, tileXfloor+1));

					if (tileWest instanceof Tile && this.isTileInRange(tileWest) === true) tiles.push( tileWest );
					if (tileEast instanceof Tile && this.isTileInRange(tileEast) === true) tiles.push( tileEast );
				}

			}

			return tiles;
		};

		this.isTileOpen = function(tile){
		   var localCoordinates = this.localFromGlobalCoordinates(tile.y, tile.x);

		   if (localCoordinates instanceof Error) {
			   return false;
		   }

		   return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
		};

		this.getTilesInRange = function(tile, range, filterOpenTiles){

			if (isNaN(range) || range < 0) return new RangeError("getTilesInRange expects range >= 0: "+range);
			
			var left   = null,
				right  = null,
				top    = null,
				bottom = null,
				tiles  = [];

			if (tile instanceof Array) {
				_.each(tile, function(t){
					// console.log("	getTilesInRange including tile("+t.y+","+t.x+")");
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
					var tile = new Tile(y, x);
					if (!filterOpenTiles || this.isTileOpen(tile) === true) tiles.push( tile );
				}
			}

			return tiles;
		};


		/************************************************************************************************
		 **************************


		 								 Startup


																	 ************************************
		 ***********************************************************************************************/


		try {
			this.loadMap();
		} catch(e) {
			this.Log(e, LOG_ERROR);
		}
	};

	return Map;
});
