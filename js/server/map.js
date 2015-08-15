define(['page', 'movable'], function(Page, Movable){

	var Map={
		_init: function(){
			
			this.registerHook('addcharacterlessentity');
		},

		clients: {},
		zones: {},
		spawns: {},

		loadMap: function(){
			// Initialize map
			var pageHeight    = Env.pageHeight, // TODO: global maps properties elsewhere
				pageWidth     = Env.pageWidth,
				mapHeight     = this.map.properties.height, // TODO: figure out height/width
				mapWidth      = this.map.properties.width,
				spawns        = this.map.data.spawns,
				map           = this.map.data.pages,
				zones         = this.map.data.zones,
				interactables = this.map.data.interactables,
				mapPageHeight = this.map.properties.pageHeight,
				mapPageWidth  = this.map.properties.pageWidth,
				pages         = this.pages;

			//this.sheet = Resources.findSheetFromFile(this.map.properties.tileset);
			this.sheets = [];
			for (var i=0; i<this.map.properties.tilesets.length; ++i) {
				var sheet = Resources.findSheetFromFile(this.map.properties.tilesets[i].image);
				if (!_.isObject(sheet)) continue;
				this.sheets.push( sheet );
				_.last(this.sheets).gid = {
					first: this.map.properties.tilesets[i].gid.first,
					last: this.map.properties.tilesets[i].gid.last
				};
			}

			this.pagesPerRow = Math.ceil(mapWidth/pageWidth); // Number of pages in an entire row of the entire map
			this.mapWidth    = mapWidth;
			this.mapHeight   = mapHeight;

			this.jumpPoints  = new Int16Array(this.map.data.jumpPoints);
			this.forcedNeighbours = this.map.data.forcedNeighbours;

			// TODO: render borders for pages; pageWidth-2*border included here
			// TODO: HEAVY HEAVY HEAVY testing of various page sizes vs. map pages
			// Build up the pages for each cell of the mapfile
			for (var mapYCoord=0; map[mapYCoord]; mapYCoord+=mapPageHeight) {
				var mapY = map[mapYCoord];
				for (var mapXCoord=0; mapY[mapXCoord]; mapXCoord+=mapPageWidth) {


					// Build up each page in this cell
					//
					// 	Go through each row in the cell
					// 		Go through each page in the row
					// 			StartingPoint: y*width + x
					// 			Tiles: page[0:StartingPoint] . cell[0:EndOfPageOrCell] . page[]
					//
					//
					//	GLOSSARY
					//		eMAP, ePAGE: the map/page from the exported JSON file
					//		map, page: the map/page in the game
					//
					//	mapCell: ePAGE
					//	mapPageWH: ePAGE width/height
					//	mapXYCoord: ePAGE x/y position
					//
					//	pageWH: page width/height
					//	pgXY: page x/y index
					//	pageXY: page x/y position
					//
					// NOTE: map starts at 0 since the cell.tiles is spliced each time, so those spliced tiles
					// 		are removed from the array
					mapCell = mapY[mapXCoord];
					for (var y=0; y<mapPageHeight; ++y) {
						for (var pageX = Math.floor(mapXCoord/pageWidth); pageX*pageWidth < mapXCoord+mapPageWidth; ++pageX) {
							var pageY      = Math.floor((mapYCoord+y)/pageHeight),
								cellY      = y,//Math.max(pageY-mapYCoord, 0), // y offset in current cell of mapgrid
								cellX      = mapXCoord + pageX - Math.floor(mapXCoord/pageWidth),
								cellI      = cellY*mapPageWidth + cellX,
								pgY        = pageY*pageHeight, // Global position of page in entire map
								pgX        = pageX*pageWidth,
								pgBegin    = ((cellY+mapYCoord-pgY)%pageHeight)*pageWidth + Math.max(0, mapXCoord - pgX),
								count      = Math.min( pageWidth - ( mapXCoord - pgX ),
													   mapXCoord + mapPageWidth - pgX,
													   pageWidth ),
								pageI      = pageY*this.pagesPerRow + pageX,
								page       = null,
								tiles      = [],
								sprites    = [];
							
							if (!pages[pageI]) {
								pages[pageI] = (new Page(this));
								pages[pageI].jumpPoints = this.map.data.pages[pgY][pgX].jumpPoints;	
							}

							page       = pages[pageI];
							page.index = pageI;
							page.y     = pgY;
							page.x     = pgX;


							// TODO: improve this by traversing through Y page blocks rather than each row of y
							tiles = [].concat( page.tiles.splice(0, pgBegin),
												mapCell.tiles.splice(0, count),
												page.tiles );
							page.tiles = tiles;


							/*
							for (var j=0; j<count; ++j) {
								if (mapCell.sprites.hasOwnProperty(y*mapPageWidth+j)) {
									var sprite = mapCell.sprites[y*mapPageWidth+j],
										ix      = (Math.max(0, mapXCoord - pgX)) + j, // TODO: use above
										iy      = (mapYCoord + cellY - pgY), // TODO: use above
										index  = iy*pageWidth + ix;
									if (sprite == 1) debugger; // 1080 coord
									page.sprites[index] = {
										sprite: sprite
									};

									var sheet = null;
									for (var i=0; i<this.sheets.length; ++i) {
										if (sprite >= this.sheets[i].gid.first &&
											sprite <= this.sheets[i].gid.last) {

											sheet = this.sheets[i];
										}
									}

									if (sheet == null) {
										return UnexpectedError("Unexpected sprite ("+ sprite +") doesn't match any spritesheet gid range");
									}

									// set collision mask if necessary
									if (sheet.data.collisions !== undefined && sheet.data.collisions.indexOf(sprite-1) >= 0) {
										page.collidables[iy] |= 1<<ix;
										page.sprites[index].collidable = true;
									}

									// set floating details
									if (sheet.data.floating !== undefined && sheet.data.floating.indexOf(sprite-1) >= 0) {
										page.sprites[index].floating = true;
									}

									// TODO: search if this sprite has any animations

									if (!page.sprites[index].hasOwnProperty('floating')) {
										page.sprites[index].static = true;
									}
								}
							}
							*/
							/* FIXME: sprites are objects w/ key=map_coord & val=spawn_obj
							 * 			Choice: either keep sprite part in here and use sprites.hasOwnProperty(map_coordinate) to add sprite
							 *			Choice2: pull sprite addition out of here then use for..in on sprites and determine page index & coordinates from spawn map positions
							// Setup sprites
							sprites = mapCell.sprites.splice(0, count);
							for (var j=0; j<sprites.length; ++j) {
								if (sprites[j] !== 0) {
									var sprite = sprites[j],
										ix      = (Math.max(0, mapXCoord - pgX)) + j, // TODO: use above
										iy      = (mapYCoord + cellY - pgY), // TODO: use above
										index  = iy*pageWidth + ix;

									page.sprites[index] = { 
										sprite: sprite
									};

									var sheet = null;
									for (var i=0; i<this.sheets.length; ++i) {
										if (sprite >= this.sheets[i].gid.first &&
											sprite <= this.sheets[i].gid.last) {

											sheet = this.sheets[i];
										}
									}

									if (sheet == null) {
										return UnexpectedError("Unexpected sprite ("+ sprite +") doesn't match any spritesheet gid range");
									}

									// set collision mask if necessary
									if (sheet.data.collisions !== undefined && sheet.data.collisions.indexOf(sprite-1) >= 0) {
										page.collidables[iy] |= 1<<ix;
										page.sprites[index].collidable = true;
									}

									// set floating details
									if (sheet.data.floating !== undefined && sheet.data.floating.indexOf(sprite-1) >= 0) {
										page.sprites[index].floating = true;
									}

									// TODO: search if this sprite has any animations

									if (!page.sprites[index].hasOwnProperty('floating')) {
										page.sprites[index].static = true;
									}
								}
							}
							*/
						}
					}



					for (var spriteCoord in mapCell.sprites) {

						var sprite = mapCell.sprites[spriteCoord],
							coord  = parseInt(spriteCoord),
							eY     = Math.floor(coord / mapPageWidth),
							eX     = coord - eY*mapPageWidth,
							mY     = mapYCoord + eY,
							mX     = mapXCoord + eX,
							pageY  = Math.floor(mY / pageHeight),
							pageX  = Math.floor(mX / pageWidth),
							pageI  = pageY*this.pagesPerRow + pageX,
							pY     = mY - pageY*pageHeight,
							pX     = mX - pageX*pageWidth,
							index  = pY*pageWidth + pX,
							page   = pages[pageI];


						if (pY < 0 || pX < 0) continue; // Belongs in another page

									page.sprites[index] = {
										sprite: sprite
									};

									var sheet = null;
									for (var i=0; i<this.sheets.length; ++i) {
										if (sprite >= this.sheets[i].gid.first &&
											sprite < this.sheets[i].gid.last) {

											sheet = this.sheets[i];
										}
									}

									if (sheet == null) {
										return new Error("Unexpected sprite ("+ sprite +") doesn't match any spritesheet gid range");
									}

									// set collision mask if necessary
									if (sheet.data.collisions !== undefined && sheet.data.collisions.indexOf(sprite-1) >= 0) {
										page.collidables[pY] |= 1<<pX;
										page.sprites[index].collidable = true;
									}

									// set floating details
									if (sheet.data.floating !== undefined && sheet.data.floating.indexOf(sprite-1) >= 0) {
										page.sprites[index].floating = true;
									}

									// TODO: search if this sprite has any animations

									if (!page.sprites[index].hasOwnProperty('floating')) {
										page.sprites[index].static = true;
									}
					}

					for (var itemCoord in mapCell.items) {

						var sprite = mapCell.items[itemCoord],
							coord  = parseInt(itemCoord),
							eY     = Math.floor(coord / mapPageWidth),
							eX     = coord - eY*mapPageWidth,
							mY     = mapYCoord + eY,
							mX     = mapXCoord + eX,
							pageY  = Math.floor(mY / pageHeight),
							pageX  = Math.floor(mX / pageWidth),
							pageI  = pageY*this.pagesPerRow + pageX,
							pY     = mY - pageY*pageHeight,
							pX     = mX - pageX*pageWidth,
							index  = pY*pageWidth + pX,
							page   = pages[pageI];


						if (pY < 0 || pX < 0) continue; // Belongs in another page

						var item = {
								sprite: sprite,
								id: null,
								coord: index,
								page: pageI
							};

						var sheet = null;
						for (var i=0; i<this.sheets.length; ++i) {
							if (sprite >= this.sheets[i].gid.first &&
								sprite < this.sheets[i].gid.last) {

								sheet = this.sheets[i];
							}
						}

						if (sheet == null) {
							return new Error("Unexpected sprite ("+ sprite +") doesn't match any spritesheet gid range");
						}

						if (!sheet.hasOwnProperty('data')) {
							return new Error("Sheet ("+ sheet.file +") does not have data property");
						}

						if (!sheet.data.hasOwnProperty('objects')) {
							return new Error("Sheet ("+ sheet.file +") does not have any objects; yet item ("+ sprite +") references sheet");
						}

						
						item.id = sheet.data.objects[sprite - sheet.gid.first - 1];
						page.items[index] = item;

					}


				}
			}

			this.pages = pages; // TODO: is this necessary? remove and check, pls
			this.zones = zones;
			var pagesWithZones = {};
			for (var i=0; i<this.zones.out.length; ++i) {
				var zone = this.zones.out[i];

				var pageY  = parseInt( zone.y/Env.pageHeight ),
					pageX  = parseInt( zone.x/Env.pageWidth ),
					pageI  = this.pagesPerRow*pageY+pageX,
					localY = zone.y % (Env.pageHeight),
					localX = zone.x % (Env.pageWidth),
					tile   = new Tile(localX, localY);
				tile.page = pages[pageI];


				tile.page.zones[localY*Env.pageWidth+localX] = zone;
				if (!pagesWithZones[tile.page.index]) pagesWithZones[tile.page.index] = tile.page;
			}

			// for (var pageI in pagesWithZones) {
			// 	this.listenTo(pagesWithZones[pageI], EVT_ZONE_OUT, function(page, entity, zone) {
			// 		this.triggerEvent(EVT_ZONE_OUT, entity, zone);
			// 	});
			// }

			this.spawns = spawns;
			// console.log("Spawns: ");
			// console.log(this.spawns);
			var pagesWithSpawns = {};
			for (var spawnCoord in this.spawns) {
				var spawn = this.spawns[spawnCoord],
					ty    = parseInt(spawnCoord/mapWidth),
					tx    = spawnCoord % mapWidth,
					pageY = parseInt(ty/Env.pageHeight),
					pageX = parseInt(tx/Env.pageWidth),
					pageI  = this.pagesPerRow*pageY+pageX,
					localY = ty % (Env.pageHeight),
					localX = tx % (Env.pageWidth),
					tile   = new Tile(localX, localY);
				tile.page = pages[pageI];
				// console.log(spawn);
				// console.log("   ("+ty+","+tx+")");

				tile.page.spawns[localY*Env.pageWidth+localX] = spawn;
				if (!pagesWithSpawns[tile.page.index]) pagesWithSpawns[tile.page.index] = tile.page;
			}

			for (var pageI in pagesWithSpawns) {
				var page = pagesWithSpawns[pageI];
				// TODO: listen to stuff on the spawn
				// this.listenTo(pagesWithSpawns[pageI], EVT_ZONE_OUT, function(page, entity, zone) {
				// 	this.triggerEvent(EVT_ZONE_OUT, entity, zone);
				// });
			}



			console.log("Interactables: ");
			for (var interactableID in interactables) {
				var interactable = interactables[interactableID],
					positions = null;

				this.interactables[interactableID] = {
					positions: [],
					script: interactable.type
				};
				positions = this.interactables[interactableID].positions;

				for (var i=0; i<interactable.tiles.length; ++i) {
					var mapTile = interactable.tiles[i],
						localY  = mapTile.y % (Env.pageHeight),
						localX  = mapTile.x % (Env.pageWidth),
						pageY   = parseInt(mapTile.y/Env.pageHeight),
						pageX   = parseInt(mapTile.x/Env.pageWidth),
						pageI   = this.pagesPerRow*pageY+pageX,
						tile    = new Tile(localX, localY);
					tile.page = pages[pageI];
					positions.push(tile);

					// Add to page
					tile.page.interactables[localY*Env.pageWidth+localX] = interactableID;
				}
			}


			// page octree
			var farTopLeft=pages[0],
				topPage=null,
				pagesY=Math.ceil(mapHeight/pageHeight),
				pagesX=Math.ceil(mapWidth/pageWidth);
			for (var i in pages) {
				var page  = pages[i],
					pageY =	Math.floor(i/pagesX),
					pageX = i%pagesX,
					top   = pagesY-1,
					right = pagesX-1;

				// South
				if (pageY<top) {
					page.neighbours.south = pages[(pageY+1)*pagesX + pageX];
					page.neighbours.south.neighbours.north = page;
				}

				// North
				if (pageY>0) {
					page.neighbours.north = pages[(pageY-1)*pagesX + pageX];
					page.neighbours.north.neighbours.south = page;
				}

				// West
				if (pageX>0) {
					page.neighbours.west = pages[pageY*pagesX + (pageX-1)];
					page.neighbours.west.neighbours.east = page;
				}

				// East
				if (pageX<right) {
					page.neighbours.east = pages[pageY*pagesX + (pageX+1)];
					page.neighbours.east.neighbours.west = page;
				}

				// Southwest
				if (pageY<top && pageX>0) {
					page.neighbours.southwest = pages[(pageY+1)*pagesX + (pageX-1)];
					page.neighbours.southwest.neighbours.northeast = page;
				}

				// Southeast
				if (pageY<top && pageX<right) {
					page.neighbours.southeast = pages[(pageY+1)*pagesX + (pageX+1)];
					page.neighbours.southeast.neighbours.northwest = page;
				}

				// Northeast
				if (pageY>0 && pageX<right) {
					page.neighbours.northeast = pages[(pageY-1)*pagesX + (pageX+1)];
					page.neighbours.northeast.neighbours.southwest = page;
				}

				// Northwest
				if (pageY>0 && pageX>0) {
					page.neighbours.northwest = pages[(pageY-1)*pagesX + (pageX-1)];
					page.neighbours.northwest.neighbours.southeast = page;
				}


				page.initialize();

				page.hook('addcharacterlessentity', this).before(function(entity){
					this.doHook('addcharacterlessentity').pre(entity);
				});
			}
		},

		initialSpawn: function(){
			var page = null;
			for (var pageID in this.pages) {
				page = this.pages[pageID];
				page.initialSpawn();
			}
		},

		zoneIn: function(entity, zone){
			var tile = null;

			if (!(entity instanceof Movable)) return new Error("Entity not a movable");
			if (!zone || !zone.spawn) return new Error("No zone provided");

			if (!this.zones) return new Error("Zones not set!");
			if (!_.isArray(this.zones.in)) return new Error("Zones-in not set!");


			for (var i=0; i<this.zones.in.length; ++i) {
				var localZone = this.zones.in[i];
				if (localZone.spot == zone.spawn) {
					this.Log("Found localZone");
					this.Log(localZone);
					tile = this.localFromGlobalCoordinates(localZone.x, localZone.y);
					break;
				}
			}

			if (!tile) {
				console.log(this.zones.in);
				throw new Error("No tile found for zone");
			}

			if (!_.isError(tile)) {
				if (entity.path && _.isFunction(entity.path.onFailed)) entity.path.onFailed();
				entity.path = null;
				entity.position = {
					global: {
						x: (tile.x + tile.page.x)*Env.tileSize,
						y: (tile.y + tile.page.y)*Env.tileSize,
					},
					tile: {
						x: tile.x + tile.page.x,
						y: tile.y + tile.page.y
					}
				};
				tile.page.addEntity(entity);
				if (!this.movables[entity.id]) {
					var result = this.watchEntity(entity);
					if (_.isError(result)) {
						return result;
					}
				}
				entity.zoning = false;
				return tile.page;
			} else if (_.isError(tile)) {
				this.Log(zone, LOG_ERROR);
				return tile;
			}
		},

		step: function(time) {
			// process events queue
			this.handlePendingEvents();
			var eventsBuffer = {},
				result = null;
			for (var i in this.pages) {
				var page = this.pages[i];
				result = page.step(time);
				if (_.isError(result)) return result;
				var pageEvents = page.fetchEventsBuffer();
				if (pageEvents) eventsBuffer[page.index] = pageEvents;
			}
			this.handlePendingEvents(); // events from pages

			var dynamicHandler = this.handler('step');
			if (dynamicHandler) {
				result = dynamicHandler.call(time - this.lastUpdated);
				if (_.isError(result)) return result;
			}
			this.lastUpdated = time;

			return eventsBuffer;

		},
	};

	return Map;
});
