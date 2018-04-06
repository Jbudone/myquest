

var _ = require('underscore'),
	Promise = require('bluebird'),
	fs=Promise.promisifyAll(require('fs')),
	exec = require('child_process').exec;


var Count = function(obj){ var n=0; for(var l in obj){ ++n; } return n; };

var AreaHashes = {},
	areaHashFile = '../resources/data/areahashes.json';

var kUSE_JPS = false;

fs.readFile(areaHashFile, function(err, data){
	if (err) {
		// Assume no areahashes.json file, just do from scratch
		console.log(err);
		return;
	}

	var json = JSON.parse(data);
	for (var areaId in json) {
		if (json[areaId]) {
			AreaHashes[areaId] = json[areaId];
		}
	}

	exportAreas();
});

var exportAreas = function(){

	fs.readFile('../resources/data/world.json', function(err, data){
		if (err) {
			console.log(err);
			return;
		}

		var avatars = null,
			tilesheets = {},
			getIDFromAvatar = new Function(),
			areasToUpdate = 0;

		(new Promise(function(succeeded, failed){

			var filesToLoad = 2;

			// Fetch Avatars
			fs.readFileAsync('../resources/data/avatars.json').then(JSON.parse).then(function(data){
				if (data && data.avatars) {
					avatars = data.avatars;
				}

				if (--filesToLoad == 0) {
					console.log('loaded avatars');
					succeeded();
				}
			}).catch(function(){
				console.error("Error loading avatars file..");
				failed();
			}).catch(function(){
				console.error("Error parsing avatars file..");
				failed();
			});

			// Fetch Tilesheets
			fs.readFileAsync('../resources/data/sheets.json').then(JSON.parse).then(function(data){
				if (data && data.tilesheets) {
					var list = data.tilesheets.list;
					for (var i=0; i<list.length; ++i) {
						tilesheets[list[i].image] = list[i];
					}
				}

				if (--filesToLoad == 0) {
					succeeded();
				}
			}).catch(function(){
				console.error("Error loading avatars file..");
				failed();
			}).catch(function(){
				console.error("Error parsing avatars file..");
				failed();
			});

		})).then(function(){

			var world = JSON.parse(data);

			_.each(world.areas, function(areaFile, areaName){
				var areaID = areaName,
					filename = '../resources/maps/' + world.areas[areaID];

				exec("md5sum "+filename+".tmx | awk '{printf \"%s\", $1}'", function(err, stdout, stderr){

					if (err) {
						console.log(err);
						return;
					}

					var areaHash = stdout;
					if (AreaHashes[areaID] && AreaHashes[areaID] == areaHash) {
						console.log("Area ("+areaID+") hasn't been changed. Skipping");
						return;
					}

					AreaHashes[areaID] = areaHash;
					++areasToUpdate;

					console.log("Processing area: "+areaID);


					exec('tiled --export-map '+filename+'.tmx '+filename+'.json', function(){
					
						fs.readFile(filename + '.json', function(err,data){
							if (err) {
								console.log(err);
								return;
							}

							var json = JSON.parse(data);


							/* Area
							 *
							 * AreaFile:
							 * 	Area: {
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
							 *
							 * JSON.tilesets:
							 * 			The array of tilesets used in this area. Every tile has a gid which references its
							 * 			position in the tilesheet, as well as which tilesheet. Each tilesheet has a
							 * 			starting gid, and the position of the tile is
							 * 				TilesheetPosition(tile.gid - tilesheet.firstgid)
							 * 				tilesheet: { name: "", firstgid: 0,
							 * 							image: "", imageheight: 1024, imagewidth: 1024,
							 * 							tilewidth: 16, tileheight: 16 }
							 *
							 *
							 * 	Each Area gets converted into a Areafile JSON object, and placed into a file (areaFile).
							 * 	AreaFile: {
							 *		properties: { height, width, pageWidth, pageHeight },
							 *
							 * 	}
							 *
							 * TODO:
							 * 	> make use of areas
							 * 	> keep a hashsum of already exported areas (to avoid re-exporting unchanged areas)
							 * 	> double check zones to make sure they all link
							 *******************************************************/

							var areaJSON = { AreaFile: { Area: {'id':areaID, pages:{}, spawns:{}, interactables:{}}, properties: {pageWidth:null, pageHeight:null, width:null, height:null, tilesets:[]} } },
								area = areaJSON.AreaFile.Area,
								tilesets = json.tilesets,
								pageWidth = 30,
								pageHeight = 14,
								tileSize = 16,
								layers = {
									base: null,
									sprites: null,
									zoning: null,
									spawns: null,
									items: null,
									interactables: null,
									areas: null // TODO
								},
								interactableNameCount = {},
								forcedNeighbours = null,
								jumpPoints = null,
								areaHeight = null,
								areaWidth = null;

							if (kUSE_JPS) {
								area.jumpPoints = [];
								area.forcedNeighbours = {};
								area.collisions = {};
								forcedNeighbours = area.forcedNeighbours;
								jumpPoints = area.jumpPoints;
							}

				
							areaJSON.AreaFile.properties.width      = null;
							areaJSON.AreaFile.properties.height     = null;
							areaJSON.AreaFile.properties.pageWidth  = pageWidth;
							areaJSON.AreaFile.properties.pageHeight = pageHeight;


							// ==================================================================================
							// Layers
							//
							// Prepare various layers for area
							// NOTE: the width/height of the layer must be listed here, so that we don't attempt to fetch
							// 		elements out of range in that layer
							for(var i=0; i<json.layers.length; ++i) {
								var layer = json.layers[i];
                                if (!layers.hasOwnProperty(layer.name)) {
                                    console.error("Unexpected layer ("+ layer.name +")");
                                    continue;
                                }

								layers[layer.name] = {
									data: layer,
									width: layer.width,
									height: layer.height
								};
							}

							if (!_.isObject(layers['base'])) throw new Error("No base tiles found");
							if (!_.isObject(layers['zoning'])) throw new Error("No zoning spots found");


							// base layer must be loaded into an array of tiles. This is because the pages in here are
							// different than the pages in the game. When the server loads the area, it will rebuild the
							// pages into its own environment pages. The server will take advantage of default or commonly
							// used base tiles; it will strip out the common tile(s) and leave a sparse list of base tiles
							layers['base'].data  = layers['base'].data.data;
							layers['base'].tiles = [];


							// Zones layer separates the out (zone points that zone you into another area), and in (points
							// to which you zone in)
							layers['zoning'].data = layers['zoning'].data.objects;
							area.zones = { in: [], out: [] };
							layers['zoning'].out = area.zones.out;
							layers['zoning'].in = area.zones.in;


							layers['sprites'].data  = layers['sprites'].data.data;
							if (layers['spawns'] !== null) layers['spawns'].data = layers['spawns'].data.data;
							if (layers['items'] !== null) layers['items'].data = layers['items'].data.data;
							if (layers['interactables'] !== null) layers['interactables'].data = layers['interactables'].data.objects;


							areaJSON.AreaFile.properties.height = Math.ceil(layers.base.height/pageHeight)*pageHeight;
							areaJSON.AreaFile.properties.width  = Math.ceil(layers.base.width/pageWidth)*pageWidth;

							areaHeight = areaJSON.AreaFile.properties.height;
							areaWidth = areaJSON.AreaFile.properties.width;
							// ==================================================================================


			var getTilesetFromGID = function(gid){
				var tileset = null;
				for (var i=0; i<tilesets.length; ++i) {
					if (gid >= tilesets[i].firstgid) {
						tileset = tilesets[i];
					} else {
						break;
					}
				}
				return tileset;
			};

			var getTileIDFromTileset = function(tileset){
				var image = tileset.image,
					startsAt = image.lastIndexOf('../');
				if (startsAt == -1) {
					return image;
				} else {
					return image.substr(startsAt+2);
				}
			};

			var addForcedNeighbour = function(forcedNeighbourID, creatorID, forceNoReject){
				if (!forcedNeighbours[forcedNeighbourID]) forcedNeighbours[forcedNeighbourID] = {creators:{}, forceNoReject:false};
				forcedNeighbours[forcedNeighbourID].creators[creatorID] = true;

				// Force no rejection?
				// This may be the case for things like page borders
				if (forceNoReject) {
					forcedNeighbours[forcedNeighbourID].forceNoReject = true;
				}
			};

			var rejectForcedNeighbour = function(forcedNeighbourID, rejectID){
				if (!forcedNeighbours[forcedNeighbourID]) return;
				if (forcedNeighbours[forcedNeighbourID].forceNoReject == true) return; // May not reject this
				delete forcedNeighbours[forcedNeighbourID].creators[rejectID];
				if (_.isEmpty(forcedNeighbours[forcedNeighbourID].creators)) {
					delete forcedNeighbours[forcedNeighbourID];
				}
			};




							// Setup all tilesheets
							for (var i=0; i<tilesets.length; ++i) {
								var tileset = tilesets[i];

								areaJSON.AreaFile.properties.tilesets.push({
									image: tileset.image,
									name: tileset.name,
									gid: {
										first: tileset.firstgid - 1,
										last: (tileset.imageheight / tileset.tileheight) *
											  (tileset.imagewidth /  tileset.tilewidth) +
											  tileset.firstgid - 2 // NOTE: 2 because firstgid had -1
									},
									tileWidth: tileset.tilewidth,
									tileHeight: tileset.tileHeight,
									rows: (tileset.imageheight / tileset.tileheight),
									columns: (tileset.imagewidth / tileset.tilewidth),
									height: tileset.imageheight,
									width: tileset.imagewidth
								});
							}



							// Build base tiles & sprites
							//
							// The width and height of the area is determined by the base tiles. Any other items from other
							// layers which are listed outside of that range are ignored
							//
							for(var y=0; y<areaHeight; y+=pageHeight) {
								area.pages[y]={};
								for(var x=0; x<areaWidth; x+=pageWidth) {
									var page = {
										tiles: [],
										sprites: {},
										items: {},
										interactables: {}
									};
									area.pages[y][x] = page;

									if (kUSE_JPS) {
										page.jumpPoints = {north:[], south:[], west:[], east:[]}; // only the borders
									}

									// go through tiles and apply
									for(var iy=0; iy<pageHeight; ++iy) {
										for(var ix=0; ix<pageWidth; ++ix) {

											var outOfRange = ((x+ix) > layers.base.width || (y+iy) > layers.base.height), // Since the area dimensions are rounded up to fit in pages, we could be out of range of the exported area
												baseTile = outOfRange ? 0 : layers.base.data[(iy+y)*layers.base.width+(ix+x)];

											page.tiles.push(baseTile);
											if (page.tiles[page.tiles.length-1] == null) page.tiles[page.tiles.length-1] = 1;

											if (kUSE_JPS) {
												// Setup JPS at borders of area
												if ((y+iy) == 0 || (x+ix) == 0 || (y+iy) == (areaHeight-1) || (x+ix) == (areaWidth-1)) {
													// Add forced neighbour, and set forceNoRejection to true so that any
													// blocks whose cardinal neighbour is this tile may not reject it.
													// NOTE: that if this block also happens to be collidable, it will
													// automatically delete the forced neighbour here rather than reject it
													var tileID = areaWidth*(y+iy)+(x+ix);
													addForcedNeighbour(tileID, tileID, true);
												}
											}

											// Check if there's a sprite at this spot
											if ( y+iy<layers.sprites.height && x+ix<layers.sprites.width && // Within sprite layer range?
												 (iy+y)*layers.sprites.width+(ix+x)<layers.sprites.data.length) {
												var sprite = layers.sprites.data[(iy+y)*layers.sprites.width+(ix+x)];
												if (sprite != 0) {
													page.sprites[iy*pageWidth + ix] = sprite;

													if (kUSE_JPS) {

														// Find out if sprite is collidable
														var spriteTile   = getTilesetFromGID(sprite),
															spriteTileID = getTileIDFromTileset(spriteTile),
															spriteSheet  = tilesheets[spriteTileID].data.collisions,
															isCollidable = (spriteSheet.indexOf(''+(sprite-1)) >= 0);
														// console.log('['+spriteTileID+']('+sprite+') collidable? ' + (isCollidable ? 'yes' : 'nope'));
														if (isCollidable) {
															
															// Collidable; check for Jump Points for JPS+
															// TODO: set primary jump points (all around sprite; check neighbours
															// 			of jump points in hashtable to unset those if necessary
															//
															// Set the primary (forced neighbour) and straight (walls) jump
															// point numbers for neighbours.
															//
															//
															// |---|---|   J - Forced Neighbour
															// |JJJ|   |   X - Wall
															// |JJJ|   |
															// |---|---|
															// | 1 |XXX|   Consider only the two neighbours to the southwest
															// | -1|XXX|   block. The north point is 1 (distance of 1 to next
															// |---|---|   forced neighbour), and -1 for nearest distance to
															// 			   wall to the east.
															//
															// Distances:   x > 0:  distance to forced neighbour
															// 				x < 0:  negative distance to wall
															// 				x = 0:  nearest collision/force-neighbour is
															// 						outside of page
															//
															// Forced Neighbours
															//
															// 	JPS+ works by placing a number in each direction of every
															// 	tile. This number determines the distance to the nearest
															// 	forced neighbour or wall. If the number is positive then its a
															// 	forced neighbour, and negative is a wall. A forced neighbour
															// 	is a tile in which something changes (eg. new page, able to
															// 	make a turn). If the nearest force neighbour or wall is
															// 	outside of the page we use 0 for the distance; this helps with
															// 	compressing distances by storing smaller numbers
															//
															// 	- Primary Forced Neighbour:
															//
															// 			These are the corners of a set of collidable blocks.
															// 			Note that if a tile is the corner of one collidable
															// 			but adjacent to another collidable which also happens
															// 			to be adjacent to the first collidable, then the tile
															// 			is not a valid primary jump point
															//
															//
															// 			* *   A single block has a primary jump point
															// 			 X    at each corner
															// 			* *
															//
															//
															// 			*  *  If a block has an east neighbour, then
															// 			 XX   skip northeast/southeast primary jump
															// 			*  *  points
															//
															//
															// 			* *   The same goes for north/south neighbours
															// 			 X
															// 			 X
															// 			* *
															//
															//
															// 	- Page Border Forced Neighbour:
															//
															// 			There needs to be a forced neighbour at the (inner)
															// 			border of the page. This isn't strictly necessary in
															// 			JPS+, but is adopted here to avoid players being
															// 			able to sense walls which are pages ahead of them.
															// 			Some of the bonuses out of this is that we can also
															// 			fit numbers into bytes (1 int per tile), and quickly
															// 			change JPS+ numbers when things change in the area (ie.
															// 			dynamic areas).
															//
															//
															// 	Weird Cases
															//
															// 			X    The bottom block may think that the above FN
															// 			X	 isn't necessary.
															// 		   * *
															// 		     X    
															//
															//
															// 		   X X   The lower left block may think that the east FN
															// 		   X*    isn't necessary
															//
															//
															// 		   The only cases where an FN can be rejected by another
															// 		   block is when the two blocks are adjacent to each
															// 		   other. However, it could be the case that two blocks
															// 		   create an FN, but then a new block (which is adjacent
															// 		   to one of the other blocks) attempts to reject the FN,
															// 		   the FN may have been necessary due to the non-adjacent
															// 		   block (see the 2nd example weird case). Best way to
															// 		   handle this is to keep a hashtable of the blocks which
															// 		   create an FN, then an adjacent block may attempt to
															// 		   reject the FN by removing the adjacent block from that
															// 		   FN's hashtable list. If the hashtable is empty then
															// 		   remove the FN
															//
															//
															//
															// Setup Process
															//
															// Since we don't know collidables ahead of time, simply remove
															// cardinal (north/west/east/south) primary jump points if they
															// exist for each block. We always know of collidables to our
															// north, west, and northwest regions however. So do a double
															// check for the following blocks which will affect primary jumps
															//
															// 	neighbour | jump-point
															// 	----------|------------
															// 	 north    | northwest, northeast
															// 	 west     | northwest, southwest
															// 	northwest | northwest
															//

															var validJumpPoints = 0,
																NORTH           = 1<<0,
																EAST            = 1<<1,
																SOUTH           = 1<<2,
																WEST            = 1<<3,
																NORTHWEST       = 1<<4,
																vertNorth       = areaWidth*(y+iy-1),
																vertCenter      = areaWidth*(y+iy),
																vertSouth       = areaWidth*(y+iy+1),
																horzWest        = x+ix-1,
																horzCenter      = x+ix,
																horzEast        = x+ix+1,
																tileID          = vertCenter+horzCenter,
																collisions      = 0;

															area.collisions[tileID] = true;

															// Find all valid neighbours (within area)
															if ((y+iy-1) > 0)                  validJumpPoints  |= NORTH;
															if ((y+iy+1) < areaHeight)          validJumpPoints  |= SOUTH;
															if ((x+ix-1) > 0)                  validJumpPoints  |= WEST;
															if ((x+ix+1) < areaWidth)           validJumpPoints  |= EAST;


															// Find all existing neighbour collisions
															// NOTE: we only know of collisions to the north/northwest/west
															if ((validJumpPoints & (NORTH|WEST)) == (NORTH|WEST) &&
																area.collisions[vertNorth+horzWest]) collisions |= NORTHWEST;

															if ((validJumpPoints & NORTH) &&
																area.collisions[vertNorth+horzCenter]) collisions |= NORTH;

															if ((validJumpPoints & WEST) &&
																area.collisions[vertCenter+horzWest]) collisions |= WEST;



															// Add forced neighbours to all appropriate corners

															// Northwest
															if ((validJumpPoints & (NORTH|WEST)) == (NORTH|WEST)) {
																if ((collisions & (NORTH|WEST|NORTHWEST)) == 0) {
																	addForcedNeighbour(vertNorth+horzWest, tileID);
																}
															}

															// Northeast
															if ((validJumpPoints & (NORTH|EAST)) == (NORTH|EAST)) {
																if ((collisions & NORTH) == 0) {
																	addForcedNeighbour(vertNorth+horzEast, tileID);
																}
															}

															// Southwest
															if ((validJumpPoints & (SOUTH|WEST)) == (SOUTH|WEST)) {
																if ((collisions & WEST) == 0) {
																	addForcedNeighbour(vertSouth+horzWest, tileID);
																}
															}

															// Southeast
															if ((validJumpPoints & (SOUTH|EAST)) == (SOUTH|EAST)) {
																addForcedNeighbour(vertSouth+horzEast, tileID);
															}



															// Remove cardinal jump points if they were set
															// We're rejecting each cardinal forced neighbour with respect to
															// tiles that could be adjacent to us. Remember that we only know
															// of adjacent neighbours to our north/northwest/west; and because
															// we're only looking at cardinal directions, we're only concerned
															// with north/west neighbours

															rejectForcedNeighbour(vertNorth+horzCenter, vertCenter+horzWest);  // North (West neighbour)
															rejectForcedNeighbour(vertSouth+horzCenter, vertCenter+horzWest);  // South (West neighbour)
															rejectForcedNeighbour(vertCenter+horzWest, vertNorth+horzCenter);  // West  (North neighbour)
															rejectForcedNeighbour(vertCenter+horzEast, vertNorth+horzCenter);  // East  (North neighbour)


															// if there's a forced neighbour ON this sprite, remove it
															// regardless of its creators
															delete forcedNeighbours[vertCenter+horzCenter];

														}

													}

												}
											}

											// Check if there's an item here
											if (layers.items &&
												 y+iy<layers.items.height && x+ix<layers.items.width && // Within item layer range?
												 (iy+y)*layers.items.width+(ix+x)<layers.items.data.length) {
												var item = layers.items.data[(iy+y)*layers.items.width+(ix+x)];
												if (item != 0) {
													page.items[iy*pageWidth + ix] = item;
												}
											}


                                            // Check if there's an NPC spawn here
                                            if (layers.spawns &&
												 y+iy<layers.spawns.height && x+ix<layers.spawns.width && // Within item layer range?
												 (iy+y)*layers.spawns.width+(ix+x)<layers.spawns.data.length) {

												var spawn = layers.spawns.data[(iy+y)*layers.spawns.width+(ix+x)];
												if (spawn != 0) {

                                                    var spawnStartGID = 0;
                                                    for (var i=0; i<tilesets.length; ++i) {
                                                        if (tilesets[i].name == "npcs") { // TODO: abstract this
                                                            spawnStartGID = tilesets[i].firstgid;
                                                        }
                                                    }

                                                    var spawnObj = {
                                                        id: avatars[spawn - spawnStartGID]
                                                    };

                                                    area.spawns[(y+iy)*areaWidth+(x+ix)] = spawnObj;
												}
                                            }
										}
									}
								}
							}


							if (kUSE_JPS) {


								// JPS+ Setup
								///////////////////
								var NORTH      = 0,
									SOUTH      = 2,
									WEST       = 1,
									EAST       = 3,
									FNEIGHBOUR = 5,
									COLLISION  = 6,
									directions = [NORTH, SOUTH, WEST, EAST],
									xPoints    = {};

								for (var tileID in forcedNeighbours) {
									var x = tileID % areaWidth,
										y = (tileID - x) / areaWidth;
									xPoints[tileID] = { x: x, y: y, t: FNEIGHBOUR };
								}

								for (var tileID in area.collisions) {
									var x = tileID % areaWidth,
										y = (tileID - x) / areaWidth;
									xPoints[tileID] = { x: x, y: y, t: COLLISION };
								}

								for (var tileID in xPoints) {
									var xPoint = xPoints[tileID],
										x      = null,
										y      = null,
										t      = xPoint.t;

									// Walk outwards in each direction until we hit a stop point
									var _distance     = 0,
										distanceAdder = (t == COLLISION ? -1 : 1),
										distance      = null,
										inNewPage     = false;

									// North
									x = xPoint.x;
									y = xPoint.y;
									distance = _distance;
									inNewPage = false;
									while (++y < layers.base.height) {
										if (y%pageHeight==0) {
											inNewPage = true;
											distance = 0;
										}

										if (!inNewPage) distance += distanceAdder;

										var id = y*areaWidth + x;
										jumpPoints[4*id+NORTH] = distance;
										if (xPoints[id]) break;
									}

									// South
									x = xPoint.x;
									y = xPoint.y;
									distance = _distance;
									inNewPage = false;
									while (--y >= 0) {
										if ((y+1)%pageHeight==0) {
											inNewPage = true;
											distance = 0;
										}

										if (!inNewPage) distance += distanceAdder;

										var id = y*areaWidth + x;
										jumpPoints[4*id+SOUTH] = distance;
										if (xPoints[id]) break;
									}

									// West
									x = xPoint.x;
									y = xPoint.y;
									distance = _distance;
									inNewPage = false;
									while (++x < areaWidth) {
										if (x%pageWidth==0) {
											inNewPage = true;
											distance = 0;
										}

										if (!inNewPage) distance += distanceAdder;

										var id = y*areaWidth + x;
										jumpPoints[4*id+WEST] = distance;
										if (xPoints[id]) break;
									}

									// East
									x = xPoint.x;
									y = xPoint.y;
									distance = _distance;
									inNewPage = false;
									while (--x >= 0) {
										if ((x+1)%pageWidth==0) {
											inNewPage = true;
											distance = 0;
										}

										if (!inNewPage) distance += distanceAdder;

										var id = y*areaWidth + x;
										jumpPoints[4*id+EAST] = distance;
										if (xPoints[id]) break;
									}
								}

								// Add jump points to each page (borders)
								for (var pageY in area.pages) {
									var pagesY = area.pages[pageY];
									for (var pageX in pagesY) {
										var page   = pagesY[pageX],
											top    = parseInt(pageY),
											bottom = parseInt(pageY) + pageHeight,
											left   = parseInt(pageX),
											right  = parseInt(pageX) + pageWidth,
											x      = null,
											y      = null;


										// North/South
										for (x=left; x<right; ++x) {
											page.jumpPoints.north.push( jumpPoints[4*(top*areaWidth+x)+NORTH] );
											page.jumpPoints.south.push( jumpPoints[4*((bottom-1)*areaWidth+x)+SOUTH] );
										}

										// West/East
										for (y=top; y<bottom; ++y) {
											page.jumpPoints.west.push( jumpPoints[4*(y*areaWidth+left)+WEST] );
											page.jumpPoints.east.push( jumpPoints[4*(y*areaWidth+right-1)+EAST] );
										}
									}
								}

							}

							




							// Zoning Layer
							///////////////////
							for (var i=0; i<layers.zoning.data.length; ++i) {

								// find tile 
								var zone   = layers.zoning.data[i],
									tx     = (zone.x / tileSize),
									ty     = (zone.y / tileSize),
									txE    = (zone.x+zone.width) / tileSize,
									tyE    = (zone.y+zone.height) / tileSize,
									tiles  = [],
									zoneIn = zone.properties.hasOwnProperty('spot');
								if (zone.x % tileSize !== 0 || zone.y % tileSize !== 0) {
									console.log("Bad zone tile: ("+zone.y+","+zone.x+") for area ["+areaID+"]");
									continue;
								}

								if ((zone.x+zone.width) % tileSize !== 0 || (zone.y+zone.height) % tileSize !== 0) {
									console.log("Bad zone tile end: ("+(zone.y+zone.height)+","+(zone.x+zone.width)+") for area ["+areaID+"]");
									continue;
								}
									
								// create rect array of tiles from tileStart to tileEnd (if zoning is a spot, only use start tile)
								for (var iy=0; iy<(tyE-ty); ++iy) {
									for (var ix=0; ix<(txE-tx); ++ix) {
										var tile = { y: (ty+iy), x: (tx+ix) };
										for (var prop in zone.properties) {
											tile[prop] = zone.properties[prop];
										}
										tiles.push(tile);
										if (zoneIn) {
											layers.zoning.in.push(tile);
										} else {
											layers.zoning.out.push(tile);
										}
										if (zoneIn) break;
									}
									if (zoneIn) break;
								}

							}



							// Interactables Layer
							///////////////////
							if (layers.interactables) {

								for (var i=0; i<layers.interactables.data.length; ++i) {
									var interactable = layers.interactables.data[i],
										tx           = (interactable.x / tileSize),
										ty           = (interactable.y / tileSize),
										txE          = (interactable.x+interactable.width) / tileSize,
										tyE          = (interactable.y+interactable.height) / tileSize,
										tiles        = [],
										name         = interactable.name;

									if (interactable.x % tileSize !== 0 || interactable.y % tileSize !== 0) {
										throw new Error("Bad interactable tile: ("+interactable.y+","+interactable.x+") for area ["+areaID+"]");
									}

									if ((interactable.x+interactable.width) % tileSize !== 0 || (interactable.y+interactable.height) % tileSize !== 0) {
										throw new Error("Bad interactable tile end: ("+(interactable.y+interactable.height)+","+(interactable.x+interactable.width)+") for area ["+areaID+"]");
									}

									if (!name) throw new Error("No name given for interactable");

									if (name.indexOf('#') != -1) {
										if (!interactableNameCount.hasOwnProperty(name)) interactableNameCount[name] = 0;
										var count = interactableNameCount[name]++;
										name = name.replace(/#/g, count);
									}
									if (area.interactables.hasOwnProperty(name)) throw new Error("Duplicate interactable found: "+name);
										
									// create rect array of tiles from tileStart to tileEnd (if zoning is a spot, only use start tile)
									for (var iy=0; iy<(tyE-ty); ++iy) {
										for (var ix=0; ix<(txE-tx); ++ix) {
											var tile = { y: (ty+iy), x: (tx+ix) };
											tiles.push(tile);
										}
									}

									area.interactables[name] = {
										tiles: tiles
									};


								}
							}

							
							console.log('Writing area ('+filename+') to file');

							fs.writeFileAsync(filename, JSON.stringify(areaJSON), function(err){
								if (err) {
									console.log(err);
									return;
								}
								console.log("Successfully exported area: "+filename);
								console.log("	NPC Count: " + Count(area.spawns));
							}).then(function(){
								if (--areasToUpdate == 0) {
									writeHashes();
								}
							});
						});
					});
				});

			});

		});

	});

};

var writeHashes = function(){

	fs.writeFile(areaHashFile, JSON.stringify(AreaHashes), function(err){
		if (err) {
			console.log(err);
			return;
		}
		console.log("Updated area hash file");
	});
};
