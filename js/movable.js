
define(['resources','entity','animable'], function(Resources, Entity, Animable) {

	var Movable = function(spriteID, page) {
		this.base = Entity;
		this.base(spriteID, page);
		Ext.extend(this,'movable');

		this.sprite=(new Animable(spriteID));

		this.moving=false;
		this.direction=null;
		this.speed=100;
		this.moveSpeed=8;
		this.lastMoved=now();
		this.path=null;
		this.zoning=false;

		this.stepsToX=null;
		this.stepsToY=null;

		this.lastStep=0;
		this.step=_.wrap(this.step,function(step,time){

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
						console.log("Finished walk! ("+walk.distance+") -> ("+pY+","+pX+")"); // TODO: why does this show as different on server/client?
						if (!path.walks.length) {
							// Finished path
							this.triggerEvent(EVT_FINISHED_PATH, path.id);
							this.path = null;
							console.log("Finished path! ("+this.posY+","+this.posX+")");

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
						     if (direction==EAST)       this.sprite.animate('walk_right');
						else if (direction==WEST)       this.sprite.animate('walk_left');
						else if (direction==SOUTH)      this.sprite.animate('walk_down');
						else if (direction==NORTH)      this.sprite.animate('walk_up');
						
					}

					if (direction==EAST || direction==SOUTH) posK += deltaSteps;
					else                                     posK -= deltaSteps;

					if (direction==NORTH || direction==SOUTH) this.posY = posK;
					else                                      this.posX = posK;

					if (finishedWalk) {
						// TODO: might need to change lastMoved to reflect this recalibration
						var oldY = this.posY,
							oldX = this.posX;
						this.posX = Env.tileSize*Math.round(this.posX/Env.tileSize);
						this.posY = Env.tileSize*Math.round(this.posY/Env.tileSize);
						console.log("Finished paths! ("+this.posY+","+this.posX+")["+this.posY/16+","+this.posX/16+"] from ("+oldY+","+oldX+")");
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
		
		this.addPath=function(path, priority) {
			// add/replace path
			// TODO: implement priority better?
			
			if (this.path && priority) {
				this.path = path; // replace current path with this
				this.triggerEvent(EVT_PREPARING_WALK, path.walks[0]);
				return;
			}


				this.path = path; // replace current path with this
			// this.paths.push(path);
			this.triggerEvent(EVT_PREPARING_WALK, path.walks[0]);
		};


	};


	return Movable;
});
