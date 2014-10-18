define(['entity','animable'], function(Entity, Animable) {

	var Movable = function(spriteID, page, params) {
		console.log("new Movable("+spriteID+")");
		this.base = Entity;
		this.base(spriteID, page);

		if (params) {
			for (var param in params) {
				this[param] = params[param];
			}
		}

		Ext.extend(this,'movable');

		this.sprite=(new Animable(this.npc.sheet));

		this.moving=false;
		this.direction=null;
		this.speed=50;
		this.moveSpeed=10;
		this.lastMoved=now();
		this.path=null;
		this.zoning=false;

		this.stepsToX=null;
		this.stepsToY=null;

		this.physicalState = new State(STATE_ALIVE);

		this.health=this.npc.health;
		this.hurt = function(hit, attacker){
			if (this.physicalState.state !== STATE_ALIVE) return;
			this.health -= hit;
			this.triggerEvent(EVT_ATTACKED, attacker, hit);
			console.log("["+this.id+"] AM HURT: "+this.health+"/"+this.npc.health);
			if (this.health<=0) {
				console.log("["+this.id+"] I died :(");
				this.physicalState.transition(STATE_DEAD);
				this.triggerEvent(EVT_DIED);
			}
		};



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
		this.step=_.wrap(this.step,function(step,time){

			if (this.physicalState.state !== STATE_ALIVE) {
				this.handlePendingEvents();
				return;
			}
			var stepResults = step.apply(this, [time]); // TODO: generalize this wrap/apply operation for basic inheritance

			if (this.path) {
				// player step checks path, decrements from walk steps

				var delta = time - this.lastMoved;
				while (delta>this.moveSpeed) {
					var path              = this.path,
						walk              = path.walks[0],
						steps             = (walk.distance - walk.walked),
						deltaSteps        = Math.floor(delta/this.moveSpeed),
						deltaTaken        = null,
						direction         = walk.direction,
						posK              = (walk.direction==NORTH||walk.direction==SOUTH?this.posY:this.posX),
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
						var pY=this.posY,
							pX=this.posX;
						// console.log("["+this.id+"] Finished walk! ("+walk.distance+") -> ("+pY+","+pX+")"); // TODO: why does this show as different on server/client?
						if (!path.walks.length) {
							// Finished path
							this.triggerEvent(EVT_FINISHED_PATH, path.id);
							this.path = null;
							// console.log("["+this.id+"] Finished path! ("+this.posY+","+this.posX+")");

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

					if (direction==NORTH || direction==SOUTH) {
						// floor[ posX ] !== floor[ posK ] --> moved tiles (left first)
						// ceil[ posX ]  !== ceil[ posK ]  --> moved tiles (right first)
						//
						// store tileX, tileY
						// cur: tileX, tileY
						//
						// if floor[tileX] == ceil[tileX] !== tileX --> moved to new tile
						// if (floor[tileX] !== tileX || ceil[tileX] !== tileX) --> moving to new tile
						var tile = posK / Env.tileSize;
						if (Math.floor(tile) != this.tileY || Math.ceil(tile) != this.tileY) {
							// Moving to new tile
							if (Math.floor(tile) == Math.ceil(tile)) {
								// Moved to new tile
								this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
								this.tileY = tile;

								this.position.tile.y = this.tileY + this.page.y;
							} else {
								this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
							}
						}
						this.posY = posK;
						this.position.local.y = this.posY;
						this.position.global.y = this.posY + this.page.y * Env.tileSize;
					} else {
						var tile = posK / Env.tileSize;
						if (Math.floor(tile) != this.tileX || Math.ceil(tile) != this.tileX) {
							// Moving to new tile
							if (Math.floor(tile) == Math.ceil(tile)) {
								// Moved to new tile
								this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
								this.tileX = tile;
								this.position.tile.x = this.tileX + this.page.x;
							} else {
								this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
							}
						}
						this.posX = posK;
						this.position.local.x = this.posX;
						this.position.global.x = this.posX + this.page.x * Env.tileSize;
					}

					if (finishedWalk) {
						// TODO: might need to change lastMoved to reflect this recalibration
						var oldY = this.posY,
							oldX = this.posX;
						this.posX = Env.tileSize*Math.round(this.posX/Env.tileSize);
						this.posY = Env.tileSize*Math.round(this.posY/Env.tileSize);
						// console.log("["+this.id+"] Finished paths! ("+this.posY+","+this.posX+")["+this.posY/16+","+this.posX/16+"] from ("+oldY+","+oldX+")");
						this.position.global.y = this.posY + this.page.y * Env.tileSize;
						this.position.global.x = this.posX + this.page.x * Env.tileSize;
						this.position.local.y = this.posY;
						this.position.local.x = this.posX;
					}
					


					this.lastMoved += deltaTaken;
				}
			} else {
				this.lastMoved = time;
			}
			// this.base.step(time); // NOTE: base class already stepped
			this.sprite.step(time);

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
			// this.paths.push(path);
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
				   console.log("		FROM ("+mov.posY+","+mov.posX+")");
				   for (var j=0; j<path.walks.length; ++j) {
					   logWalk(path.walks[j]);
				   }
			   }

			// console.log("Added path to entity ["+this.id+"] at ("+this.posY+","+this.posX+")");
			// logPath(path);
		};



		this.inRangeOf = function(target, range){

			if ( target instanceof Tile ) {

				var _this         = this,
					range         = range || 1,
					myY           = this.page.y * Env.tileSize + this.posY,
					myX           = this.page.x * Env.tileSize + this.posX,
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
					myY           = this.page.y * Env.tileSize + this.posY,
					myX           = this.page.x * Env.tileSize + this.posX,
					yourPage      = target.page,
					yourY         = yourPage.y * Env.tileSize + target.posY,
					yourX         = yourPage.x * Env.tileSize + target.posX,
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
				yourY        = yourPage.y * Env.tileSize + target.posY,
				yourX        = yourPage.x * Env.tileSize + target.posX,
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
				myY          = page.y * Env.tileSize + this.posY,
				myX          = page.x * Env.tileSize + this.posX,
				yourPage     = target.page,
				yourY        = yourPage.y * Env.tileSize + target.posY,
				yourX        = yourPage.x * Env.tileSize + target.posX,
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
