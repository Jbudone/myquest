define(['page', 'movable'], function(Page, Movable){

	var Map={
		_init: function(){
			
		},

		clients: {},
		zones: {},
		spawns: {},

		loadMap: function(){
			// Initialize map
			var pageHeight=Env.pageHeight, // TODO: global maps properties elsewhere
				pageWidth=Env.pageWidth,
				mapHeight=this.map.properties.height, // TODO: figure out height/width
				mapWidth=this.map.properties.width,
				map=this.map.data,
				mapPageHeight=this.map.properties.pageHeight,
				mapPageWidth=this.map.properties.pageWidth,
				pages=this.pages;

			this.sheet = Resources.findSheetFromFile(this.map.properties.tileset);
			this.pagesPerRow=Math.ceil(mapWidth/pageWidth); // Number of pages in an entire row of the entire map
			this.mapWidth = mapWidth;
			this.mapHeight = mapHeight;

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
					// NOTE: map starts at 0 since the cell.tiles is spliced each time, so those spliced tiles
					// 		are removed from the array
					mapCell = mapY[mapXCoord];
					for (var y=0; y<mapPageHeight; ++y) {
						for (var pageX = Math.floor(mapXCoord/pageWidth); pageX*pageWidth < mapXCoord+mapPageWidth; ++pageX) {
							var pageY      = Math.floor((mapYCoord+y)/pageHeight),
								cellY      = y,//Math.max(pageY-mapYCoord, 0), // y offset in current cell of mapgrid
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
							
							if (!pages[pageI]) pages[pageI] = (new Page(this));
							page = pages[pageI];
							page.index = pageI;
							page.y     = pgY;
							page.x     = pgX;


							// TODO: improve this by traversing through Y page blocks rather than each row of y
							tiles = [].concat( page.tiles.splice(0, pgBegin),
												mapCell.tiles.splice(0, count),
												page.tiles );
							page.tiles = tiles;

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

									// set collision mask if necessary
									if (this.sheet.data.collisions !== undefined && this.sheet.data.collisions.indexOf(sprite-1) >= 0) {
										page.collidables[iy] |= 1<<ix;
										page.sprites[index].collidable = true;
									}

									// set floating details
									if (this.sheet.data.floating !== undefined && this.sheet.data.floating.indexOf(sprite-1) >= 0) {
										page.sprites[index].floating = true;
									}

									// TODO: search if this sprite has any animations

									if (!page.sprites[index].hasOwnProperty('floating')) {
										page.sprites[index].static = true;
									}
								}
							}
						}
					}


				}
			}

			this.pages = pages; // TODO: is this necessary? remove and check, pls
			this.zones = map.zones;
			var pagesWithZones = {};
			for (var i=0; i<this.zones.out.length; ++i) {
				var zone = this.zones.out[i];

				var pageY  = parseInt( zone.y/Env.pageHeight ),
					pageX  = parseInt( zone.x/Env.pageWidth ),
					pageI  = this.pagesPerRow*pageY+pageX,
					localY = zone.y % (Env.pageHeight),
					localX = zone.x % (Env.pageWidth),
					tile   = new Tile(localY, localX);
				tile.page = pages[pageI];


				tile.page.zones[localY*Env.pageWidth+localX] = zone;
				if (!pagesWithZones[tile.page.index]) pagesWithZones[tile.page.index] = tile.page;
			}

			// for (var pageI in pagesWithZones) {
			// 	this.listenTo(pagesWithZones[pageI], EVT_ZONE_OUT, function(page, entity, zone) {
			// 		this.triggerEvent(EVT_ZONE_OUT, entity, zone);
			// 	});
			// }

			this.spawns = map.spawns;
			console.log("Spawns: ");
			console.log(this.spawns);
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
					tile   = new Tile(localY, localX);
				tile.page = pages[pageI];
				console.log(spawn);
				console.log("   ("+ty+","+tx+")");

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
			}
		},

		zoneIn: function(entity, zone){
			var tile = null;

			if (!(entity instanceof Movable)) return UnexpectedError("Entity not a movable");
			if (!zone || !zone.spawn) return UnexpectedError("No zone provided");

			if (!this.zones) return UnexpectedError("Zones not set!");
			if (!_.isArray(this.zones.in)) return UnexpectedError("Zones-in not set!");


			for (var i=0; i<this.zones.in.length; ++i) {
				var localZone = this.zones.in[i];
				if (localZone.spot == zone.spawn) {
					this.Log("Found localZone");
					this.Log(localZone);
					tile = this.localFromGlobalCoordinates(localZone.y, localZone.x);
					break;
				}
			}

			if (!(tile instanceof Error)) {
				entity.path = null;
				entity.position = {
					tile: new Tile(tile.y + tile.page.y, tile.x + tile.page.x),
					global: null,
					local: null
				};
				entity.position.local  = { x: tile.x * Env.tileSize, y: tile.y * Env.tileSize };
				entity.position.global = this.coordinates.globalFromLocal( entity.position.local.x, entity.position.local.x, tile.page, true );
				tile.page.addEntity(entity);
				if (!this.movables[entity.id]) this.watchEntity(entity);
				entity.zoning = false;
				return tile.page;
			} else if (tile instanceof Error) {
				this.Log(zone, LOG_ERROR);
				return tile;
			}
		},

		step: function(time) {
			// process events queue
			this.handlePendingEvents();
			var eventsBuffer = {};
			for (var i in this.pages) {
				var page = this.pages[i];
				page.step(time);
				var pageEvents = page.fetchEventsBuffer();
				if (pageEvents) eventsBuffer[page.index] = pageEvents;
			}
			this.handlePendingEvents(); // events from pages

			var dynamicHandler = this.handler('step');
			if (dynamicHandler) {
				dynamicHandler.call(time - this.lastUpdated);
			}
			this.lastUpdated = time;

			return eventsBuffer;

		},
	};

	return Map;
});
