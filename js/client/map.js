define(['page','movable'], function(Page,Movable){

	var Map={

		_init: function(){
		},

		curPage:null,

		loadMap: function(map){

			if (map) {
				this.id          = map.id;
				this.pagesPerRow = map.pagesPerRow;
				this.mapWidth    = map.mapWidth;
				this.mapHeight   = map.mapHeight;
				this.sheet       = Resources.findSheetFromFile(map.tileset);
			}

			for (var entID in this.movables) {
				var movable = this.movables[entID];
				if (entID == The.player.id) continue;
				delete this.movables[entID];
				this.unwatch(movable);
			}

			this.stopListeningTo(this, EVT_ZONE);
			this.listenTo(this, EVT_ZONE, function(map, entity, oldPage, newPage){
				if (!newPage) {
					this.unwatchEntity(entity);
				}
			});
		},

		addPages: function(addedPages, isZoning){

			for (var pageI in addedPages) {
				var page             = null,
					pageI            = parseInt(pageI),
					evtPage          = JSON.parse(addedPages[pageI]);
				if (!this.pages[pageI]) this.pages[pageI] = new Page(this);
				page = this.pages[pageI];

				this.Log("Adding page to map ("+pageI+")");
				page.index       = pageI;
				if (isNaN(evtPage.y)) this.Log("Bad page coordinates", LOG_ERROR);
				if (isNaN(evtPage.x)) this.Log("Bad page coordinates", LOG_ERROR);
				page.y           = evtPage.y;
				page.x           = evtPage.x;
				page.tiles       = evtPage.tiles;
				page.sprites     = evtPage.sprites;
				page.collidables = evtPage.collidables;

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
								The.player.posY         = movable.posY;
								The.player.posX         = movable.posX;
								The.player.sprite.state = movable.state;
								The.player.zoning       = false;
								//The.player.page         = this.pages[pageI];
								this.pages[pageI].addEntity(The.player);
								if (!this.movables[entityID]) this.watchEntity(The.player);

							} else {

								// FIXME: is this necessary here ??
								// The.player.posY         = movable.posY;
								// The.player.posX         = movable.posX;
								// The.player.page.zoneEntity(this.pages[pageI], The.player);
								// The.map.curPage = this.pages[pageI];

							}
						} else {
							this.Log("	Adding movable to page");
							var entity = new Movable(movable.spriteID, page);
							entity.id           = movable.id;
							entity.posY         = movable.posY;
							entity.posX         = movable.posX;
							entity.sprite.state = movable.state;
							entity.zoning       = movable.zoning;
							entity.health       = movable.health;
							entity.page         = this.pages[pageI];
							entity.updatePosition(entity.posX, entity.posY);

							if (movable.path) {
								var path = JSON.parse(movable.path);
								// for (var j=0; j<path.walks.length; ++j) { // TODO: is this necessary? 
								// 	var walk = path.walks[j];
								// 	walk.started = false; // in case walk has already started on server
								// }
								entity.addPath(path);
							}

							this.pages[pageI].addEntity(entity);
							this.watchEntity(entity);
						}

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
		// zone: function(direction) {
			/*
			var newPage=null;
			     if (direction=='n') newPage=this.curPage.neighbours.north;
			else if (direction=='w') newPage=this.curPage.neighbours.west;
			else if (direction=='s') newPage=this.curPage.neighbours.south;
			else if (direction=='e') newPage=this.curPage.neighbours.east;

			if (newPage) {
				this.zoning = true;
				var borderX=Env.pageBorder*Env.tileSize,
					borderY=Env.pageBorder*Env.tileSize;

				if (!newPage.neighbours.west) borderX=0;
				if (!newPage.neighbours.north) borderY=0;
				console.log("Zoning: "+direction);
				var oldPage = this.curPage;
				this.curPage=newPage;

				this.triggerEvent(EVT_ZONE, direction);

				// How do we know we've finished zoning?
				// 	Player: finished moving (also disallow any further movement, OR stack movements if player
				// 			currently zoning)
				var timeOfZoning=(new Date()).getTime(),
					minTimeToZone=0; // TODO: calculate based off min steps to safe spot, and char movespeed
				this.listenTo(The.player, EVT_FINISHED_WALK, function(player){
						this.zoning = false;
						this.stopListeningTo(The.player, EVT_FINISHED_WALK);
				});


				// Clear old movables from old page
				// NOTE: this is an important step since those old movables will be replaced with new movables
				// upon zoning in; and could otherwise cause conflicts/issues with other event listeners upon
				// zoning between pages (eg. the UI)
				if (oldPage) {
					for (var movableID in oldPage.movables) {
						oldPage.stopListeningTo( oldPage.movables[ movableID ] );
						delete oldPage.movables[ movableID ];
					}
				}
			}
			*/
		},

		step: function(time) {
			// process events queue
			this.handlePendingEvents();
			for (var i in this.pages) {
				var page = this.pages[i];
				page.step(time);
			}
			this.handlePendingEvents(); // events from pages
		}
	};

	return Map;
});
