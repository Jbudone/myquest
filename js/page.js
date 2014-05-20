define(['resources','eventful','movable'], function(Resources,Eventful,Movable){




	/* Page
	 *
	 * Map is stored in pages; each page fills up the entire view of the screen. Pages are linked in an
	 * octree, and at any given moment the current page and its immediate neighbours are loaded into memory
	 *
	 * Pages have a messaging service to communicate with the server. Players are attached to a queue on the
	 * server's page, and all updates are streamed to the player. 
	 *
	 * NOTE: the edges of the page are shared with its neighbours, and movables will belong to both of the
	 * 		pages at the same time
	 *********************************************************/
	var Page = function(map){
		extendClass(this).with(Eventful);
		Ext.extend(this,'page');

		this.baseTile = null; // Base tile 
		this.tiles = []; // Specific tiles to render ontop of base

		this.sprites = {};
		this.movables = {};

		// A matrix of collidable tiles; each element is a number which represents the i_th row of this page.
		// That number is a bitmask where 1 represents a collision and 0 is an open tile
		this.collidables = [];
		for (var y=0; y<Env.pageHeight; ++y) { this.collidables[y]=0; }

		this.updateList = [];
		this.eventsQueue = [];
		this.eventsBuffer = []; // To be sent out to connected users
		this.clients = [];

		this.map   = map;
		this.index = null;
		this.y     = null;
		this.x     = null;
		this.neighbours = {
			northwest:null,
			north:null,
			northeast:null,
			southeast:null,
			south:null,
			southwest:null
		};

		this.addEntity = function(entity) {
			if (entity.step) {
				this.updateList.push(entity);
				this.movables[entity.id] = entity;

				// TODO: check if movable before checking zone_out
				if (entity instanceof Movable) {
					this.triggerEvent(EVT_ADDED_ENTITY, entity);
					console.log("Adding Entity["+entity.id+"] to page: "+this.index);
					this.listenTo(entity, EVT_STEP, function(entity){

						if (entity.zoning) return; // Cannot zone again while zoning
						var zoning=null;

						// check zoning tiles
						var tY = parseInt(entity.posY / Env.tileSize),
							tX = parseInt(entity.posX / Env.tileSize);
						zoning = this.checkZoningTile(tY, tX);

						if (!zoning) {
							var border=Env.pageBorder*Env.tileSize;
							if (entity.posX < 0) {
								zoning='w';
							} else if (entity.posX > Env.pageWidth*Env.tileSize-border) {
								zoning='e';
							} else if (entity.posY < 0) {
								zoning='n';
							} else if (entity.posY > Env.pageHeight*Env.tileSize-border) {
								zoning='s'
							}
						}

						if (zoning) {

							var direction = zoning,
								newPage   = null;
							     if (direction=='n') newPage=this.neighbours.north;
							else if (direction=='w') newPage=this.neighbours.west;
							else if (direction=='s') newPage=this.neighbours.south;
							else if (direction=='e') newPage=this.neighbours.east;
							else {
								// Zoning to a new map
								newPage = zoning;
							}

							if (newPage) {
								entity.zoning = true;

								delete this.movables[entity.id];
								for (var i=0; i<this.updateList.length; ++i) {
									if (this.updateList[i] == entity) {
										this.updateList.splice(i,1);
										break;
									}
								}

								this.stopListeningTo(entity, EVT_STEP);
								this.stopListeningTo(entity, EVT_PREPARING_WALK);

								     if (direction=='n') entity.posY += Env.pageHeight*Env.tileSize;
								else if (direction=='w') entity.posX += Env.pageWidth*Env.tileSize;
								else if (direction=='e') entity.posX -= Env.pageWidth*Env.tileSize;
								else if (direction=='s') entity.posY -= Env.pageHeight*Env.tileSize;
								else {
									this.stopListeningTo(entity, EVT_FINISHED_WALK);
									if (Env.isServer ||
										entity.id == The.player.id) {
										console.log("ZONING OUT!");
										console.log(newPage);
										this.triggerEvent(EVT_ZONE_OUT, entity, newPage);
									}
									return; // Avoid page-zones from below
								}
									

								if (Env.isServer ||
								    entity.id == The.player.id) {

									newPage.addEntity(entity);
									entity.triggerEvent(EVT_ZONE, newPage, direction);
									this.listenTo(entity, EVT_FINISHED_WALK, function(entity){

										entity.zoning=false;
										console.log("Entity ["+entity.id+"] no longer ZONING");
										this.stopListeningTo(entity, EVT_FINISHED_WALK);
									});
								}
								console.log("Zoned user ["+entity.id+"] to page ("+newPage.index+")");
							}
						}
					});

				}
				// TODO: if wakable/sleepable? add listener for wakeup/sleep
			}

		};

		this.step = function(time) {
			this.handlePendingEvents();
			// TODO: process events queue
			for (var i=0; i<this.updateList.length; ++i) {
				var update = this.updateList[i];
				try {
					update.step(time);
				} catch(e) {
					console.log("Error stepping movable: "+i);
					console.log(e);
					console.log(e.stack);
					if (process) process.exit();
				}
			}
		}; 

	};

	return Page;

});
