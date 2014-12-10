define(['entity','animable','dynamic'], function(Entity, Animable, Dynamic) {

	var Movable = function(spriteID, page, params) {
		console.log("new Movable("+spriteID+")");
		this.base = Entity;
		this.base(spriteID, page);

		extendClass(this).with(Dynamic);

		// Position will always accurately reflect the movables position in the
		// map. It is split up between local and global position; local refers
		// to the offset within the current page, global refers to the offset
		// within the map. 
		//
		// Tile is the global discrete tile position within the map. Global &
		// local are both continuous values (eg. as you move between tile 0 and
		// tile 1, your local.x goes from (tileSize/2) to ((1+tileSize)/2))
		//
		// This variable should be updated with updatePosition() immediately
		// after the movable has moved somewhere (eg. moving, zoning,
		// respawning)
		//
		// local.x and local.y may be outside of the current page. Since a movable may be walking between two tiles which are on adjacent pages, and the movable is only considered to be standing on 1 tile at a time, that current tile is the one which is rounded from the global position. In other words, take the global position and round it to the nearest tile. So if a movable is currently standing on a tile at the top of the page (y==0), but walking north to the next tile, his local.y will be less than 0.
		//
		this.position = {
			tile:   { x: 0, y: 0 },
			local:  { x: 0, y: 0 },
			global: { x: 0, y: 0 }
		};

		this.updatePosition = function(localX, localY){

			if (!this.page) return; // In case we try to update while in the middle of zoning

			if (localX !== undefined && localY !== undefined) {
				this.position.local.x = localX;
				this.position.local.y = localY;
			} else {
				localX = this.position.local.x;
				localY = this.position.local.y;
			}

			
			this.position.global.x = localX + this.page.x * Env.tileSize;
			this.position.global.y = localY + this.page.y * Env.tileSize;
			this.position.tile.x = parseInt(this.position.global.x / Env.tileSize)
			this.position.tile.y = parseInt(this.position.global.y / Env.tileSize)
		};


		// Set any predefined parameters for the movable
		if (params) {
			for (var param in params) {
				this[param] = params[param];

				if (param == 'position') {
					if (!this.position.tile)   this.position.tile = {};
					if (!this.position.local)  this.position.local = {};
					if (!this.position.global) this.position.global = {};
					this.updatePosition();
				}
			}
		}

		Ext.extend(this,'movable');

		this.sprite=(new Animable(this.npc.sheet)); // FIXME: should not need animable for server

		this.moving    = false;
		this.direction = null;
		this.speed     = 50;
		this.moveSpeed = 10;
		this.lastMoved = now();
		this.path      = null;
		this.zoning    = false;

		this.physicalState = new State(STATE_ALIVE);


		this.lastStep=0;
		this.faceDirection = function(direction){
			if (this.direction != direction) {
				this.direction = direction;
				var dir="";
				     if (direction == NORTH) dir = "up";
				else if (direction == SOUTH) dir = "down";
				else if (direction == WEST)  dir = "left";
				else if (direction == EAST)  dir = "right";
				if (dir) {
					this.sprite.idle('walk_'+dir);
				}
			}
		};

		// FIXME: I put this listener up to fix a problem where the path was
		// trying to run even though it wasn't cleared after zoning but before
		// the page was set... This is probably a necessary functionality
		// though, BUT it didn't seem to trigger before step() did, fix things
		// up here..
		this.listenTo(this, EVT_ZONE_OUT, function(){

			if (this.path) {
				this.path = null;
			}
		}, HIGH_PRIORITY);

		this.step=_.wrap(this.step,function(step,time){

			if (this.physicalState.state !== STATE_ALIVE) {
				this.handlePendingEvents();
				return;
			}
			var stepResults = step.apply(this, [time]); // TODO: generalize this wrap/apply operation for basic inheritance

			var timeDelta = time - this.lastMoved;

			// Have we zoned? Disallow stepping page-specific things
			if (!this.page) {
				this.path = null;
			}

			if (this.path) {
				// player step checks path, decrements from walk steps

				var delta = timeDelta;
				while (delta>this.moveSpeed && this.path) {

					if (!_.isArray(this.path.walks) ||
						this.path.walks.length === 0) {

						this.path = null;
						return UnexpectedError("Path of length 0 walks");
					}

					var path              = this.path,
						walk              = path.walks[0],
						steps             = (walk.distance - walk.walked),
						deltaSteps        = Math.floor(delta/this.moveSpeed),
						deltaTaken        = null,
						direction         = walk.direction,
						posK              = (walk.direction==NORTH||walk.direction==SOUTH?this.position.local.y:this.position.local.x),
						finishedWalk      = false;

					if (deltaSteps > steps) {
						// TODO: change lastMoved to when this move WOULD have finished to satisfy steps
						deltaSteps = steps;
						deltaTaken = deltaSteps * this.moveSpeed;
						delta -= deltaTaken;
					} else {
						deltaTaken = delta;
						delta = 0;
					}

					if (steps === 0) {
						// Finished walk
						finishedWalk = true;
						this.triggerEvent(EVT_FINISHED_WALK, direction);
						path.walks.splice(0,1);
						var pY=this.position.local.y,
							pX=this.position.local.x;
						// console.log("["+this.id+"] Finished walk! ("+walk.distance+") -> ("+pY+","+pX+")"); // TODO: why does this show as different on server/client?
						if (path.walks.length === 0) {
							// Finished path
							this.triggerEvent(EVT_FINISHED_PATH, path.id);
							this.path = null;

							// Finished moving
							this.moving = false; // TODO: necessary?
							this.sprite.idle();

							this.triggerEvent(EVT_FINISHED_MOVING);
							this.lastMoved += delta;
							break;
						} else {
							this.triggerEvent(EVT_PREPARING_WALK, path.walks[0]);
						}
					}

					walk.walked = Math.min(walk.distance, walk.walked + deltaSteps);

					if (!walk.started) {
						walk.started = true;
						this.direction = direction;
						     if (direction==EAST)       this.sprite.animate('walk_right', true);
						else if (direction==WEST)       this.sprite.animate('walk_left', true);
						else if (direction==SOUTH)      this.sprite.animate('walk_down', true);
						else if (direction==NORTH)      this.sprite.animate('walk_up', true);
						
					}

					if (direction==EAST || direction==SOUTH) posK += deltaSteps;
					else                                     posK -= deltaSteps;


					// Movement calculation
					//
					// tile is a real number (not an int). We can compare tile
					// to our current tile to determine where we're moving. If
					// tile rounds down to less than our current tile, we're
					// moving down; likewise if tile rounds up to more than our
					// current tile, we're moving up. Note that these are the
					// only two possible rounding cases. If tile rounded down
					// and rounded are the same, and not equal to our current
					// tile, then we've finished moving to this new tile
					var tile = posK / Env.tileSize;
					if (direction==NORTH || direction==SOUTH) {
						if (Math.floor(tile) != this.tileY || Math.ceil(tile) != this.tileY) {
							if (Math.floor(tile) == Math.ceil(tile)) {
								// Moved to new tile
								this.tileY = tile;
								this.updatePosition(this.position.local.x, posK);
								this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
							} else {
								// Moving to new tile
								this.updatePosition(this.position.local.x, posK);
								this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
							}
						} else {
							// Moved back to center of current tile (changed direction of path)
							this.position.local.y = posK;
						}
					} else {
						if (Math.floor(tile) != this.tileX || Math.ceil(tile) != this.tileX) {
							if (Math.floor(tile) == Math.ceil(tile)) {
								// Moved to new tile
								this.tileX = tile;
								this.updatePosition(posK, this.position.local.y);
								this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
							} else {
								// Moving to new tile
								this.updatePosition(posK, this.position.local.y);
								this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
							}
						} else {
							// Moved back to center of current tile (changed direction of path)
							this.position.local.x = posK;
						}
					}


					// Movable has finished the walk. This is only a final step
					// to calibrate the user to the center of the tile
					if (finishedWalk) {
						// TODO: might need to change lastMoved to reflect this recalibration
						this.position.local.x = Env.tileSize*Math.round(this.position.local.x/Env.tileSize);
						this.position.local.y = Env.tileSize*Math.round(this.position.local.y/Env.tileSize);
					}
					this.updatePosition();
					


					this.lastMoved += deltaTaken;
				}
			} else {
				this.lastMoved = time;
			}
			this.sprite.step(time);


			var dynamicHandler = this.handler('step');
			if (dynamicHandler) {
				dynamicHandler.call(timeDelta);
			}

			return stepResults;
		});
		
		this.addPath=function(path, priority){
			// add/replace path
			// TODO: implement priority better?
			
			if (this.path && priority) {
				this.path = path; // replace current path with this
				this.triggerEvent(EVT_PREPARING_WALK, path.walks[0]);
				return;
			}

			for (var j=0; j<path.walks.length; ++j) {
				path.walks[j].started = false; // in case walk has already started on server
				path.walks[j].steps   = 0;
			}


			this.path = path; // replace current path with this
			this.triggerEvent(EVT_PREPARING_WALK, path.walks[0]);
			var mov=this;
			   var logWalk = function(walk) {
				   var dir = null;
						if (walk.direction == NORTH) dir = "NORTH";
				   else if (walk.direction == SOUTH) dir = "SOUTH";
				   else if (walk.direction == WEST)  dir = "WEST";
				   else if (walk.direction == EAST)  dir = "EAST";
				   console.log("		Walk: "+dir+"  ("+walk.distance+")");
				   if (walk.started) console.log("			WALK ALREADY STARTED!!!");
			   }, logPath = function(path) {
				   console.log("	Path:");
				   console.log("		FROM ("+mov.position.local.y+","+mov.position.local.x+")");
				   for (var j=0; j<path.walks.length; ++j) {
					   logWalk(path.walks[j]);
				   }
			   }
		};



		this.inRangeOf = function(target, range){

			if ( target instanceof Tile ) {

				var _this         = this,
					range         = range || 1,
					myY           = this.page.y * Env.tileSize + this.position.local.y,
					myX           = this.page.x * Env.tileSize + this.position.local.x,
					myNearTiles   = this.page.map.findNearestTiles( myY, myX );
				
				for (var i=0; i<myNearTiles.length; ++i) {
					if (myNearTiles[i].y === target.y &&
						myNearTiles[i].x === target.x) {

						return true;
					}
				}

			} else {

				// TODO: optimize this...
				var _this         = this,
					range         = range || 1,
					myY           = this.page.y * Env.tileSize + this.position.local.y,
					myX           = this.page.x * Env.tileSize + this.position.local.x,
					yourPage      = target.page,
					yourY         = yourPage.y * Env.tileSize + target.position.local.y,
					yourX         = yourPage.x * Env.tileSize + target.position.local.x,
					yourNearTiles = this.page.map.findNearestTiles( yourY, yourX ),
					myNearTiles   = this.page.map.findNearestTiles( myY, myX ),
					tiles         = this.page.map.getTilesInRange( myNearTiles, range, true ),
					safeTiles     = {},
					magicNumber   = Env.pageWidth,
					hashTile      = function(tile){ return tile.y*magicNumber+tile.x; };

				tiles = tiles.filter(function(tile){
					return _this.tileAdjacentTo(tile, _this);
				});

				for (var i=0; i<tiles.length; ++i) {
					safeTiles[ hashTile(tiles[i]) ] = tiles[i];
				}

				for (var i=0; i<yourNearTiles.length; ++i) {
					var hash = hashTile( yourNearTiles[i] );
					if (safeTiles[hash]) return true;
				}

			}

				
			return false;
		};

		this.tileAdjacentTo = function(tile, target){
			var	yourPage     = target.page,
				yourY        = yourPage.y * Env.tileSize + target.position.local.y,
				yourX        = yourPage.x * Env.tileSize + target.position.local.x,
				tY           = tile.y * Env.tileSize,
				tX           = tile.x * Env.tileSize;
			if (Math.abs(yourY - tY) < 2*Env.tileSize && yourX == tX) {
				return true;
			}
			if (Math.abs(yourX - tX) < 2*Env.tileSize && yourY == tY) {
				return true;
			}
			return false;
		};

		this.directionOfTarget = function(target){
			var page         = this.page,
				myY          = page.y * Env.tileSize + this.position.local.y,
				myX          = page.x * Env.tileSize + this.position.local.x,
				yourPage     = target.page,
				yourY        = yourPage.y * Env.tileSize + target.position.local.y,
				yourX        = yourPage.x * Env.tileSize + target.position.local.x,
				direction    = null;

			     if (myY > yourY) direction = NORTH;
			else if (myY < yourY) direction = SOUTH;
			else if (myX > yourX) direction = WEST;
			else if (myX < yourX) direction = EAST;
			return direction;
		};
	};


	return Movable;
});
