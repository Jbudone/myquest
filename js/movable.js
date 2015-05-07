define(['entity','animable','dynamic'], function(Entity, Animable, Dynamic) {

	var Movable = function(spriteID, page, params) {
		console.log("new Movable("+spriteID+")");
		this.base = Entity;
		this.base(spriteID, page);

		extendClass(this).with(Dynamic);

		// Position will always accurately reflect the movables position in the map. It is split between tile
		// and real coordinates. Since the movable could be part way between two tiles, it makes sense to
		// consider its real coordinates (x=tile.x*tileSize) and its tile coordinates. Note that these are
		// both global coordinates, and do not consider the offset within the page (local coordinates).
		//
		// Tile is the global discrete tile position within the map. Global is a continuous value (eg. as you
		// move between tile 0 and tile 1, your global.x goes from (tileSize/2) to ((1+tileSize)/2))
		//
		// This variable should be updated with updatePosition() immediately after the movable has moved
		// somewhere (eg. moving, zoning, respawning)
		//
		// Local coordinates used to be included within the position, but quickly caused problems. I've
		// removed local coordinates and will calculate those on the fly where necessary. This can be done by,
		// 	local.x = global.x % (Env.tileSize*Env.pageWidth)
		// 	local.y = global.y % (Env.tileSize*Env.pageHeight)
		// 	page.x  = parseInt(global.x / (Env.tileSize*Env.pageWidth))
		// 	page.y  = parseInt(global.y / (Env.tileSize*Env.pageHeight))
		// 	pageI   = page.y * map.pagesPerRow + page.x
		//
		// local.x and local.y may be outside of the current page. Since a movable may be walking between two
		// tiles which are on adjacent pages, and the movable is only considered to be standing on 1 tile at a
		// time, that current tile is the one which is rounded from the global position. In other words, take
		// the global position and round it to the nearest tile. So if a movable is currently standing on a
		// tile at the top of the page (y==0), but walking north to the next tile, his local.y will be less
		// than 0.
		//
		// NOTE: JS uses float64 numbers, so our safe range for numbers are Number.MAX_SAFE_INTEGER == 2^53.
		// This should be more than enough for even the largest maps
		//
		this.position = {
			tile:   { x: 0, y: 0 },
			global: { x: 0, y: 0 }
		};

		this.updatePosition = function(globalX, globalY){

			if (globalX !== undefined && globalX !== undefined) {
				this.position.global.x = globalX;
				this.position.global.y = globalY;
			}

			this.position.tile.x = parseInt(this.position.global.x / Env.tileSize);
			this.position.tile.y = parseInt(this.position.global.y / Env.tileSize);

			if (!_.isFinite(this.position.tile.x) || !_.isFinite(this.position.tile.y)) {
				throw new Error("Bad tile!");
			}
		};


		// Set any predefined parameters for the movable
		if (params) {
			for (var param in params) {
				this[param] = params[param];

				if (param == 'position') {
					if (!this.position.tile)   this.position.tile = {};
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
		this.moveSpeed = this.npc.speed;
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
 				if (_.isFunction(this.path.onFailed)) this.path.onFailed();
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
				if (this.path && _.isFunction(this.path.onFailed)) this.path.onFailed();
				this.path = null;
			}

			if (this.path) {
				// player step checks path, decrements from walk steps

				var delta = timeDelta;
				if (this.hasOwnProperty('isZoning')) delete this.isZoning;
				while (delta>this.moveSpeed && this.path) {

					if (!_.isArray(this.path.walks) ||
						this.path.walks.length === 0) {

						if (_.isFunction(this.path.onFailed)) this.path.onFailed();
						this.path = null;
						return UnexpectedError("Path of length 0 walks");
					}

					var path              = this.path,
						walk              = path.walks[0],
						steps             = (walk.distance - walk.walked),
						deltaSteps        = Math.floor(delta/this.moveSpeed),
						deltaTaken        = null,
						direction         = walk.direction,
						posK              = (walk.direction==NORTH||walk.direction==SOUTH?this.position.global.y:this.position.global.x),
						finishedWalk      = false,
						hasZoned		  = false;

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
						if (path.walks.length === 0) {
							// Finished path
							this.triggerEvent(EVT_FINISHED_PATH, path.id);
							if (_.isFunction(this.path.onFinished)) this.path.onFinished();
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
					// tile is a real number (not an int). We can compare tile to our current tile to
					// determine where we're moving. If tile rounds down to less than our current tile, we're
					// moving down; likewise if tile rounds up to more than our current tile, we're moving up.
					// Note that these are the only two possible rounding cases. If tile rounded down and
					// rounded are the same, and not equal to our current tile, then we've finished moving to
					// this new tile
					var tile = posK / Env.tileSize;
					if (direction==NORTH || direction==SOUTH) {
						if (Math.floor(tile) != this.position.tile.y || Math.ceil(tile) != this.position.tile.y) {
							if ((direction==NORTH && tile < this.position.tile.y) ||
								(direction==SOUTH && tile >= (this.position.tile.y+1))) {
								// Moved to new tile
								this.updatePosition(this.position.global.x, posK);
								this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
							} else {
								// Moving to new tile
								this.updatePosition(this.position.global.x, posK);
								this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
							}
						} else {
							// Moved back to center of current tile (changed direction of path)
							this.position.global.y = posK;
						}
					} else {
						if (Math.floor(tile) != this.position.tile.x || Math.ceil(tile) != this.position.tile.x) {
							if ((direction==WEST && tile < this.position.tile.x) ||
								(direction==EAST && tile >= (this.position.tile.x+1))) {
								// FIXME: use >= (this.position.tile.x+0.5) to allow reaching new tile while walking to it
								// 			NOTE: need to consider walking west and reaching next tile too early

								// Moved to new tile
								this.updatePosition(posK, this.position.global.y);
								this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
							} else {
								// Moving to new tile
								this.updatePosition(posK, this.position.global.y);
								this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
							}
						} else {
							// Moved back to center of current tile (changed direction of path)
							this.position.global.x = posK;
						}
					}


					hasZoned = this.hasOwnProperty('isZoning');
					if (!hasZoned) {

						// Movable has finished the walk. This is only a final step
						// to calibrate the user to the center of the tile
						if (finishedWalk) {
							// TODO: might need to change lastMoved to reflect this recalibration
							this.position.global.x = Env.tileSize*Math.round(this.position.global.x/Env.tileSize);
							this.position.global.y = Env.tileSize*Math.round(this.position.global.y/Env.tileSize);
						}
						this.updatePosition();
					
					}


					this.lastMoved += deltaTaken;
				}

				if (this.hasOwnProperty('isZoning')) delete this.isZoning;
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

			if (this.path && _.isFunction(this.path.onFailed)) {
				this.path.onFailed();
			}

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
			var mov = this,
				logWalk = function(walk) {
					var dir = null;
					     if (walk.direction == NORTH) dir = "NORTH";
					else if (walk.direction == SOUTH) dir = "SOUTH";
					else if (walk.direction == WEST)  dir = "WEST";
					else if (walk.direction == EAST)  dir = "EAST";
					console.log("		Walk: "+dir+"  ("+walk.distance+")");
					if (walk.started) console.log("			WALK ALREADY STARTED!!!");
				}, logPath = function(path) {
					console.log("	Path:");
					console.log("		FROM ("+mov.position.global.y+","+mov.position.global.x+")");
					for (var j=0; j<path.walks.length; ++j) {
						logWalk(path.walks[j]);
					}
				}

			return ({finished:function(success, failed){
				if (_.isFunction(success)) this.path.onFinished = success;
				if (_.isFunction(failed))  this.path.onFailed   = failed;
			}.bind(this)});
		};


		this.directionOfTarget = function(target){
			var myY          = this.position.global.y,
				myX          = this.position.global.x,
				yourY        = target.position.global.y,
				yourX        = target.position.global.x,
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
