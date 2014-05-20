

define(['resources','eventful','page'], function(Resources,Eventful,Page){
	
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
		console.log("Loading map...");
		Ext.extend(this,'map');
		extendClass(this).with(Eventful);

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

		this.sheet = null;// Resources.findSheetFromFile('tilesheet.png');

		this.loadMap();

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
					   try {
						   var localCoordinates = map.localFromGlobalCoordinates(tile.y, tile.x),
							   index            = localCoordinates.y*Env.pageWidth + localCoordinates.x;
						   return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
					   } catch (e) {
						   return false;
					   }
				   });

				   return tiles;
			   }, findShortestPath = function(tilesStart, tilesEnd) {
				   // console.log("	Finding shortest path..");

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
						   console.log(player.posY);
						   console.log(player.posX);
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

			// TODO: A*
			// 	> find start tile, to tile
			// 	> wrap tile in TileNode{ checked:false, tile:.. }
			// 	> neighbours: list of open tiles, their min weight, previous direction (from previous tile to
			// 				this). When creating neighbour tile try to select from this instead, otherwise
			// 				create new neighbour
			// 	> find neighbours, add to open tiles (if not collidable & in page or border of neighbourpage)
			// 	> repeat while neighbours
			// 	> work backwards along neighbours previous directions to build path

			function TileNode(tile,directionToTile,walkTime,previousTile){
				this.tile=tile;
				this.checked=false;
				this.previousDirection=directionToTile;
				this.weight=walkTime;
				this.nextTile=[];
				this.previousTile=previousTile;
			};

			var start = [], // new TileNode(fromTile,null,0,null),
				end   = [], //new TileNode(toTile,null,null,null),
				nearestEnd = null,
				openTiles = [],
				maxWeight = 100, // TODO: better place to store this
				neighbours = {},
				// destination = {y: toTile.y, x: toTile.x},
				map = this,
				estimateCost = function(tile) {
					// TODO: tileNodes include nearest to-tile (estimated by coordinates); redecide nearest
					// to-tile every X tiles along path (when weight % X == 0)
					// TODO: store open tiles as {[]} assoc array where key is the cost heuristic: Object.keys(tiles)[0] for lowest-weight select
				}, isOpenTile = function(tile){
					try {
						var localCoordinates = map.localFromGlobalCoordinates(tile.y, tile.x),
							index            = localCoordinates.y*Env.pageWidth + localCoordinates.x;
						return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);

						return true;
					} catch (e) {
						return false;
					}
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
					return neighbours;
				}, hashCoordinates = function(y,x){
					var magicNumber = maxWeight+Env.pageWidth;
					return y*magicNumber+x;
				};

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
				openTiles.push( fromNode );
			}

			for (var i=0; i<toTiles.length; ++i) {
				var toTile          = toTiles[i],
					toCoordinates   = { y: toTile.y, x: toTile.x },
					toNode          = new TileNode(toTile, null, 9999, null),
					index           = hashCoordinates(toCoordinates.y, toCoordinates.x);

				toNode.end = true;
				neighbours[index] = toNode;
			}



			while (openTiles.length) {
				var tileNode       = openTiles.shift(),
					tileNeighbours = [];

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
							// TODO: will this EVER occur ???
							console.log('The UNEXPECTED has happened!! A*');
							throw new UnexpectedError("Unexpected neighbour in path with weight less than this..");
						}
					} else {
						// add neighbour
						neighbours[neighbourHash] = neighbourNode;
						openTiles.push(neighbourNode);
					}
				}
				if (nearestEnd) break; // Turns out one of the neighbours was the end
			}


			if (nearestEnd) { 
				// Build path working backwards from this..
				console.log("Path found is: "+nearestEnd.weight+" steps..");

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



		this.localFromGlobalCoordinates=function(y, x) {
			var pageY  = parseInt( y/Env.pageHeight ),
				pageX  = parseInt( x/Env.pageWidth ),
				pageI  = this.pageIndex(pageY, pageX),
				page   = null,
				localY = y % (Env.pageHeight),
				localX = x % (Env.pageWidth);

			if (pageI<0 || !this.pages[pageI]) throw new RangeError("Page index out of range: ("+ pageY +","+ pageX +")["+ pageI +"]");
			page = this.pages[pageI];

			if (page.y != pageY*Env.pageHeight ||
				page.x != pageX*Env.pageWidth) throw new MismatchError("Mismatched page fetched: ("+ page.y +","+ page.x +") found. Expected: ["+ pageY*Env.pageHeight +","+ pageX*Env.pageWidth +"]");

			return {
				y: localY,
				x: localX,
				page: page
			};
		};

		this.globalFromLocalCoordinates=function(y, x, page) {
			var pageY   = page.y,
				pageX   = page.x,
				globalY = y+pageY,
				globalX = x+pageX;

			return {
				y: globalY,
				x: globalX
			};
		};

		this.isTileInRange=function(tile) {
			if (tile.x > this.mapWidth ||
				tile.y > this.mapHeight ||
				tile.x < 0 || tile.y < 0) {
					return false;
				}
			return true;
		};

		this.tileFromGlobalCoordinates=function(y, x) {
			var tile = new Tile(y, x);
			if (!this.isTileInRange(tile)) {
				throw new RangeError("Bad range: ("+ y +","+ x +")");
			}
			return tile;
		};


		this.tileFromLocalCoordinates=function(y, x, page) {
			var page = page || this.curPage,
				globalCoordinates = this.globalFromLocalCoordinates(y, x, page),
				tile = new Tile(globalCoordinates.y, globalCoordinates.x);
			if (!this.isTileInRange(tile)) {
				throw new RangeError("Bad range: ("+ tile.y +","+ tile.x +")");
			}
			return tile;
		};

		this.findNearestTile=function(posY, posX) {
			// NOTE: global real coordinates
			// return tile nearest to position
			var tileY = Math.round(posY/Env.tileSize),
				tileX = Math.round(posX/Env.tileSize),
				tile  = (new Tile(tileY, tileX));
			if (!this.isTileInRange(tile)) {
				throw new RangeError("Bad range: ("+ tile.y +","+ tile.x +")");
			}

			return tile;
		};

		this.findNearestTiles = function(posY, posX) {
			// NOTE: global real coordinates
			var tiles = [],
				onTileY = (posY % Env.tileSize == 0),
				onTileX = (posX % Env.tileSize == 0);


			if (!onTileY && !onTileX) {
				throw new UnexpectedError("findNearestTiles when not on a proper tileY NOR tileX");
			} else if (onTileY && onTileX) {
				tiles.push( this.findNearestTile(posY, posX) );
			} else {

				if (!onTileY) {
					var tileYfloor = Math.floor(posY/Env.tileSize), // global coordinates
						tileX      = Math.floor(posX/Env.tileSize),
						tileNorth  = null,
						tileSouth  = null;

					try { tileNorth = (new Tile(tileYfloor, tileX));  } catch(e) {}
					try { tileSouth = (new Tile(tileYfloor+1, tileX)); } catch(e) {}

					if (tileNorth && this.isTileInRange(tileNorth)) tiles.push( tileNorth );
					if (tileSouth && this.isTileInRange(tileSouth)) tiles.push( tileSouth );
				}

				if (!onTileX) {
					var tileXfloor = Math.floor(posX/Env.tileSize), // global coordinates
						tileY      = Math.floor(posY/Env.tileSize),
						tileWest   = null,
						tileEast   = null;

					try { tileWest = (new Tile(tileY, tileXfloor));   } catch(e) {}
					try { tileEast = (new Tile(tileY, tileXfloor+1)); } catch(e) {}

					if (tileWest && this.isTileInRange(tileWest)) tiles.push( tileWest );
					if (tileEast && this.isTileInRange(tileEast)) tiles.push( tileEast );
				}

			}

			return tiles;
		};

		this.isTileOpen = function(tile){
		   try {
			   var localCoordinates = this.localFromGlobalCoordinates(tile.y, tile.x),
				   index            = localCoordinates.y*Env.pageWidth + localCoordinates.x;
			   return (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
		   } catch (e) {
			   return false;
		   }
		};

		this.getTilesInRange = function(tile, range, filterOpenTiles){

			if (range < 0) throw new RangeError("getTilesInRange expects range >= 0: "+range);
			
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
					if (!filterOpenTiles || this.isTileOpen(tile)) tiles.push( tile );
				}
			}

			return tiles;
		};

	};

	return Map;
});
