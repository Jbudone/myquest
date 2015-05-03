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
			}, HIGH_PRIORITY);
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

						if (isZoning && The.map.pages[pageI].movables[entityID]) continue; // incase zoned in as we received this
						if (entityID == The.player.id) {
							if (!isZoning) {

								this.Log("	Adding player (me) to page");
								The.player._character       = movable._character;
								The.player.position.local = {
									y: movable.localY,
									x: movable.localX
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
							entity.id               = movable.id;
							entity.position.local.y = movable.localY;
							entity.position.local.x = movable.localX;
							entity.sprite.state     = movable.state;
							entity.zoning           = movable.zoning;
							entity._character       = movable._character;
							entity.page             = this.pages[pageI];
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

			this.stopAllEventsAndListeners();
			if (this.hasOwnProperty('unhookAllHooks')) {
				this.unhookAllHooks();
			}
			this.unregisterAllHooks();

			this.stopListeningTo(EVERYTHING);
		}
	};

	return Map;
});
