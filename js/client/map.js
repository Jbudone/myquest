define(['page','movable'], function(Page,Movable){

	var Map={

		_init: function(){
		},

		curPage:null,

		loadMap: function(map){

			var result = null;
			if (map) {
				this.id          = map.id;
				this.pagesPerRow = map.pagesPerRow;
				this.mapWidth    = map.mapWidth;
				this.mapHeight   = map.mapHeight;
				//this.sheet       = Resources.findSheetFromFile(map.tileset);
				this.sheets = [];
				for (var i=0; i<map.tilesets.length; ++i) {
					var sheet = Resources.findSheetFromFile(map.tilesets[i].image);
					if (!_.isObject(sheet)) continue;
					this.sheets.push( sheet );
					_.last(this.sheets).gid = {
						first: map.tilesets[i].gid.first,
						last: map.tilesets[i].gid.last
					};
				}

				this.jumpPoints = new Int16Array(4*map.mapHeight*map.mapWidth);
				this.collisions = {};

			}

			for (var entID in this.movables) {
				var movable = this.movables[entID];
				if (entID == The.player.id) continue;
				delete this.movables[entID];
				result = this.unwatch(movable);
				if (_.isError(result)) return result;
			}

			this.stopListeningTo(this, EVT_ZONE);
			this.listenTo(this, EVT_ZONE, function(map, entity, oldPage, newPage){
				if (!newPage) {
					var result = null;
					result = this.removeEntity(entity);
					if (_.isError(result)) throw result;
				}
			});

			this.listenTo(this, EVT_ZONE_OUT, function(oldMap, oldPage, entity, zone) {
				var result = null;
				result = this.removeEntity(entity);
				if (_.isError(result)) throw result;
			});
		},

		addPages: function(addedPages, isZoning){

			var result = null;
			for (var pageI in addedPages) {
				var page             = null,
					pageI            = parseInt(pageI),
					evtPage          = JSON.parse(addedPages[pageI]);
				if (!this.pages[pageI]) this.pages[pageI] = new Page(this);
				page = this.pages[pageI];

				this.Log("Adding page to map ("+pageI+")");
				page.index         = pageI;
				page.y             = evtPage.y;
				page.x             = evtPage.x;
				page.tiles         = evtPage.tiles;
				page.sprites       = evtPage.sprites;
				page.collidables   = evtPage.collidables;
				page.items         = evtPage.items;
				page.interactables = evtPage.interactables;
				page.jumpPoints    = evtPage.jumpPoints;
				page.forcedNeighbours    = evtPage.forcedNeighbours;


				// TODO: fill in page JumpPoints (not just borders); OR map JumpPoints?
				var forcedNeighbours = {},
					jumpPoints       = this.jumpPoints;

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

				var y = page.y,
					x = page.x;
				for (var iy=0; iy<Env.pageHeight; ++iy) {
					var collisionRow = page.collidables[iy];
					if (!collisionRow) continue;

					for (var ix=0; ix<Env.pageWidth; ++ix) {
						if (collisionRow & (1 << ix)) {
							// Collision Tile

							var validJumpPoints = 0,
								NORTH           = 1<<0,
								EAST            = 1<<1,
								SOUTH           = 1<<2,
								WEST            = 1<<3,
								NORTHWEST       = 1<<4,
								vertNorth       = this.mapWidth*(y+iy-1),
								vertCenter      = this.mapWidth*(y+iy),
								vertSouth       = this.mapWidth*(y+iy+1),
								horzWest        = x+ix-1,
								horzCenter      = x+ix,
								horzEast        = x+ix+1,
								tileID          = vertCenter+horzCenter,
								collisions      = 0;

							this.collisions[tileID] = true;

							// Find all valid neighbours (within map)
							if ((y+iy-1) > 0)                  validJumpPoints  |= NORTH;
							if ((y+iy+1) < this.mapHeight)     validJumpPoints  |= SOUTH;
							if ((x+ix-1) > 0)                  validJumpPoints  |= WEST;
							if ((x+ix+1) < this.mapWidth)      validJumpPoints  |= EAST;


							// Find all existing neighbour collisions
							// NOTE: we only know of collisions to the north/northwest/west
							if ((validJumpPoints & (NORTH|WEST)) == (NORTH|WEST) &&
								this.collisions[vertNorth+horzWest]) collisions |= NORTHWEST;

							if ((validJumpPoints & NORTH) &&
								this.collisions[vertNorth+horzCenter]) collisions |= NORTH;

							if ((validJumpPoints & WEST) &&
								this.collisions[vertCenter+horzWest]) collisions |= WEST;



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


				// Add page borders to forced neighbours
				for (var ix=0; ix<Env.pageWidth; ++ix) {
					var tileID = this.mapWidth*y + (x+ix);
					addForcedNeighbour(tileID, tileID, true);
				}
				



				// JPS+ Setup
				///////////////////
				var NORTH      = 0,
					SOUTH      = 2,
					WEST       = 1,
					EAST       = 3,
					FNEIGHBOUR = 5,
					COLLISION  = 6,
					SKIP       = 7,
					BORDER     = 8,
					bNORTH     = 1<<0,
					bSOUTH     = 1<<1,
					bWEST      = 1<<2,
					bEAST      = 1<<3,
					bFN        = 1<<4,
					directions = [NORTH, SOUTH, WEST, EAST],
					width      = this.mapWidth,
					bottom     = this.mapHeight,
					xPoints    = {};


				// XPoint: A point of interest in the map (in terms of preprocessing JPS+)
				//
				// This is either a forced neighbour, collision point, or a border of the page
				// The border of the page is important here because pages are streamed from the server and we
				// don't know what lays ahead outside of our vision boundary. We get the page border JP's from
				// the server as pages are streamed
				var XPoint = function(x, y, t){
					this.x = x;
					this.y = y;
					this.t = t;
					this.skip = false;
					this.border = 0;

					var b = 0;
					if (x % Env.pageWidth == 0) b |= bWEST;
					if ((x+1) % Env.pageWidth == 0) b |= bEAST;
					if (y % Env.pageHeight == 0) b |= bNORTH;
					if ((y+1) % Env.pageHeight == 0) b |= bSOUTH;
					this.border = b;
				};

				// for (var tileID in this.forcedNeighbours) {
				// 	xPoints[tileID] = { t: SKIP, border: bFN };
				// }

				// All forced neighbours from page
				// NOTE: some forced neighbours may be out of range of this page; we save these for another
				// page
				for (var tileID in forcedNeighbours) {
					var x = tileID % width,
						y = (tileID - x) / width;

					if (x < page.x || x >= (page.x + Env.pageWidth) ||
						y < page.y || y >= (page.y + Env.pageHeight)) {

						// FIXME: What if the page which contains this forced neighbour has already been
						// added? We'd need to handle it now. Is it necessary to pend the forced neighbour at
						// all? Maybe we should store a list of pages and their associated forcedNeighbours
						// (ShortArray of tileID's) for this
						// console.error('SKIPPED TILE: ('+x+','+y+')');
						this.pendingForcedNeighbours[tileID] = new XPoint(x, y, FNEIGHBOUR);
						this.forcedNeighbours[tileID] = true; // Store this new ForcedNeighbour in the map
						xPoints[tileID] = this.pendingForcedNeighbours[tileID];
					} else {
						xPoints[tileID] = new XPoint(x, y, FNEIGHBOUR);
						this.forcedNeighbours[tileID] = true; // Store this new ForcedNeighbour in the map
					}
				}

				for (var tileID in this.collisions) {
					var x = tileID % width,
						y = (tileID - x) / width;

					xPoints[tileID] = new XPoint(x, y, COLLISION);
				}

				for (var tileID in this.pendingForcedNeighbours) {
					var x = tileID % width,
						y = (tileID - x) / width;

					// Is the pending forced neighbour meant for this page?
					if (x >= page.x && x < (page.x + Env.pageWidth) &&
						y >= page.y && y < (page.y + Env.pageHeight)) {

						xPoints[tileID] = this.pendingForcedNeighbours[tileID];
						delete this.pendingForcedNeighbours[tileID];
					}
				}


				// Add Page Border points to xPoints
				// Borders are only traversed in their reverse direction, since they are not true JPs
				// NOTE: some of the borders may already be contained in xPoints because of an FN or Collision

				var top = page.y,
					bot = page.y + Env.pageHeight,
					left = page.x,
					right = page.x + Env.pageWidth,
					tileID = null;

				// North/South page borders
				for (var x=left; x<right; ++x) {
					tileID = top*width + x;
					if (!xPoints.hasOwnProperty(tileID)) xPoints[tileID] = new XPoint(x, top, BORDER);

					tileID = (bot-1)*width + x;
					if (!xPoints.hasOwnProperty(tileID)) xPoints[tileID] = new XPoint(x, bot-1, BORDER);
				}

				// West/East page borders
				for (y=top; y<bot; ++y) {
					tileID = y*width + left;
					if (!xPoints.hasOwnProperty(tileID)) xPoints[tileID] = new XPoint(left, y, BORDER);

					tileID = y*width + right - 1;
					if (!xPoints.hasOwnProperty(tileID)) xPoints[tileID] = new XPoint(right-1, y, BORDER);
				}

				for (var tileID in xPoints) {
					var xPoint = xPoints[tileID],
						x      = null,
						y      = null,
						t      = xPoint.t,
						b      = xPoint.border,
						id     = null;


					// NOTE: the jumpPoint may have been created by a collision point from a neighbour page
					// if (xPoint.x % Env.pageWidth == 0) xPoint.border |= bWEST;
					// if ((xPoint.x+1) % Env.pageWidth == 0) xPoint.border |= bEAST;
					// if (xPoint.y % Env.pageHeight == 0) xPoint.border |= bNORTH;
					// if ((xPoint.y+1) % Env.pageHeight == 0) xPoint.border |= bSOUTH;

					// b = xPoint.border || null;
					// if (this.forcedNeighbours[tileID] || this.collisions[tileID]) b |= bFN;

					// if (t == SKIP) continue;

					// Walk outwards in each direction until we hit a stop point
					var _distance     = (t == COLLISION ? 1 : 0),
						_distanceAdder = (t == COLLISION ? -1 : 1),
						distanceAdder = null,
						distance      = null;




					if (t != BORDER || b & bNORTH) {

						// North
						x = xPoint.x;
						y = xPoint.y;
						distance = _distance;
						distanceAdder = _distanceAdder;
						if (t == BORDER) {
							// Page Border
							id = y*width + x;
							distance = page.jumpPoints.north[x%Env.pageWidth];
							jumpPoints[4*id+NORTH] = distance;
							distanceAdder = Math.sign(distance);
						}

						while (++y % Env.pageHeight != 0) {
							distance += distanceAdder;

							id = y*width + x;
							jumpPoints[4*id+NORTH] = distance;

							// Stop traversing if we've hit a forced neighbour or collision point
							if (this.forcedNeighbours[id] || this.collisions[id]) break;
						}

					}


					if (t != BORDER || b & bSOUTH) {

						// South
						x = xPoint.x;
						y = xPoint.y;
						distance = _distance;
						distanceAdder = _distanceAdder;
						if (t == BORDER) {
							// Page Border
							id = y*width + x;
							distance = page.jumpPoints.south[x%Env.pageWidth];
							jumpPoints[4*id+SOUTH] = distance;
							distanceAdder = Math.sign(distance);
						}

						while (y-- % Env.pageHeight != 0) {
							distance += distanceAdder;

							id = y*width + x;
							jumpPoints[4*id+SOUTH] = distance;

							// Stop traversing if we've hit a forced neighbour or collision point
							if (this.forcedNeighbours[id] || this.collisions[id]) break;
						}

					}


					if (t != BORDER || b & bWEST) {

						// West
						x = xPoint.x;
						y = xPoint.y;
						distance = _distance;
						distanceAdder = _distanceAdder;
						if (t == BORDER) {
							// Page Border
							id = y*width + x;
							distance = page.jumpPoints.west[y%Env.pageHeight];
							jumpPoints[4*id+WEST] = distance;
							distanceAdder = Math.sign(distance);
						}

						while (++x % Env.pageWidth != 0) {
							distance += distanceAdder;

							id = y*width + x;
							jumpPoints[4*id+WEST] = distance;

							// Stop traversing if we've hit a forced neighbour or collision point
							if (this.forcedNeighbours[id] || this.collisions[id]) break;
						}

					}


					if (t != BORDER || b & bEAST) {

						// East
						x = xPoint.x;
						y = xPoint.y;
						distance = _distance;
						distanceAdder = _distanceAdder;
						if (t == BORDER) {
							// Page Border
							id = y*width + x;
							distance = page.jumpPoints.east[y%Env.pageHeight];
							jumpPoints[4*id+EAST] = distance;
							distanceAdder = Math.sign(distance);
						}

						while (x-- % Env.pageWidth != 0) {
							distance += distanceAdder;

							id = y*width + x;
							jumpPoints[4*id+EAST] = distance;

							// Stop traversing if we've hit a forced neighbour or collision point
							if (this.forcedNeighbours[id] || this.collisions[id]) break;
						}

					}
				}
				
				
				/*
FIXME FIXME FIXME FIXME FIXME
			// Base tiles are quite often reused in pages. To improve performance, we create an object
			// reference for unique tiles and then have the tile element reference that object
			// NOTE: this function MUST be bound to the page with which the tile belongs
			var _mapRef      = this,
				prepareTiles = function(tile){

				if (!(this instanceof Page)) {
					_mapRef.Log("Prepare Tiles was called without being bound to a page", LOG_ERROR);
					throw new UnexpectedError("Failed to prepare tile");
				}

				if (!this.tileObjects
			};
				new Uint8Array(tiles.map(prepareTiles.bind(page)));
				*/

				if (evtPage.movables) {

					if (isZoning) {
						for (var entityID in page.movables) {
							if (entityID == The.player.id) continue;
							page.stopListeningTo(page.movables[entityID]);
							delete page.movables[entityID];
						}
					}

					for (var entityID in evtPage.movables) {
						var movable = evtPage.movables[entityID];

						if (isZoning && The.map.movables[entityID]) continue; // incase zoned in as we received this
						if (entityID == The.player.id) {
							if (!isZoning) {

								this.Log("	Adding player (me) to page");
								The.player._character       = movable._character;
								The.player.position.global = {
									y: movable.position.global.y,
									x: movable.position.global.x
								};
								The.player.sprite.state = movable.state;
								The.player.zoning       = false;
								//The.player.page         = this.pages[pageI];
								result = this.pages[pageI].addEntity(The.player);
								if (_.isError(result)) throw result;
								if (!this.movables[entityID]) {
									result = this.watchEntity(The.player);
									if (_.isError(result)) throw result;
								}

							}
						} else {
							this.Log("	Adding movable to page");
							var entity = new Movable(movable.spriteID, page);
							entity.id                = movable.id;
							entity.position.global.y = movable.position.global.y;
							entity.position.global.x = movable.position.global.x;
							entity.sprite.state      = movable.state;
							entity.zoning            = movable.zoning;
							entity._character        = movable._character;
							entity.page              = this.pages[pageI];
							if (movable.hasOwnProperty('name')) {
								entity.name = movable.name;
							}
							entity.updatePosition();

							if (movable.path) {
								var path = JSON.parse(movable.path);
								// for (var j=0; j<path.walks.length; ++j) { // TODO: is this necessary? 
								// 	var walk = path.walks[j];
								// 	walk.started = false; // in case walk has already started on server
								// }
								result = entity.addPath(path);
								if (_.isError(result)) {
									debugger;
									return result;
								}
							}

							result = this.pages[pageI].addEntity(entity);
							if (_.isError(result)) {
								debugger;
								return result;
							}
							result = this.watchEntity(entity);
							if (_.isError(result)) {
								debugger;
								return result;
							}
						}

					}
				}


				if (evtPage.interactables) {
					
					for (var interactableCoord in evtPage.interactables) {
						var interactableID = evtPage.interactables[interactableCoord],
							tileY          = parseInt(interactableCoord / Env.pageWidth),
							tileX          = interactableCoord - (tileY*Env.pageWidth),
							tile           = new Tile(tileX, tileY);

						tile.page = evtPage.index;
						if (!this.interactables.hasOwnProperty(interactableID)) {
							this.interactables[interactableID] = {
								positions: [], 
							};
						}

						this.interactables[interactableID].positions.push(tile);
					}
				}

				// figure out neighbours..
				if ((pageI%this.pagesPerRow)!=0 && this.pages[pageI-1]) { // West Neighbour
					page.neighbours.west = this.pages[pageI-1];
					page.neighbours.west.neighbours.east = page;
				}

				if (((pageI+1)%this.pagesPerRow)!=0 && this.pages[pageI+1]) { // East Neighbour
					page.neighbours.east = this.pages[pageI+1];
					page.neighbours.east.neighbours.west = page;
				}

				if ((pageI-this.pagesPerRow)>=0 && this.pages[pageI-this.pagesPerRow]) { // North Neighbour
					page.neighbours.north = this.pages[pageI-this.pagesPerRow];
					page.neighbours.north.neighbours.south = page;
				}

				if (this.pages[pageI+this.pagesPerRow]) { // South Neighbour
					page.neighbours.south = this.pages[pageI+this.pagesPerRow];
					page.neighbours.south.neighbours.north = page;
				}

				if (pageI%this.pagesPerRow!=0 && (pageI-this.pagesPerRow)>=0 && this.pages[pageI-1-this.pagesPerRow]) { // Northwest Neighbour
					page.neighbours.northwest = this.pages[pageI-1-this.pagesPerRow];
					page.neighbours.northwest.neighbours.southeast = page;
				}


				if (((pageI+1)%this.pagesPerRow)!=0 && (pageI-this.pagesPerRow)>=0 && this.pages[pageI+1-this.pagesPerRow]) { // Northeast Neighbour
					page.neighbours.northeast = this.pages[pageI+1-this.pagesPerRow];
					page.neighbours.northeast.neighbours.southwest = page;
				}

				if (((pageI+1)%this.pagesPerRow)!=0 && this.pages[pageI+1+this.pagesPerRow]) { // Southeast Neighbour
					page.neighbours.southeast = this.pages[pageI+1+this.pagesPerRow];
					page.neighbours.southeast.neighbours.northwest = page;
				}

				if ((pageI%this.pagesPerRow)!=0 && this.pages[pageI-1+this.pagesPerRow]) { // Southwest Neighbour
					page.neighbours.southwest = this.pages[pageI-1+this.pagesPerRow];
					page.neighbours.southwest.neighbours.northeast = page;
				}

					
			}

		},

		zoning: false,
		zone: function(newPage) {
			this.curPage = newPage;
		},

		step: function(time) {
			// process events queue
			this.handlePendingEvents();
			var result = null;
			for (var i in this.pages) {
				var page = this.pages[i];
				result = page.step(time);
				if (_.isError(result)) return result;
			}
			this.handlePendingEvents(); // events from pages

			var dynamicHandler = this.handler('step');
			if (dynamicHandler) {
				result = dynamicHandler.call(time - this.lastUpdated);
				if (_.isError(result)) return result;
			}
			this.lastUpdated = time;

		},

		unload: function(){

			for (var pageI in this.pages) {
				this.pages[pageI].unload();
			}

			this.unloadListener();
			if (this.hasOwnProperty('unhookAllHooks')) {
				this.unhookAllHooks();
			}
			this.unregisterAllHooks();
		}
	};

	return Map;
});
