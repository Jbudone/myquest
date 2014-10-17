
define(['sprite'], function(Sprite){


	var Animable = function(spriteID){
		Ext.extend(this,'animable');
		this.base = Sprite;
		this.base(spriteID);

		this.animations=Resources.sprites[spriteID].data.animations;
		this.animation=null;
		this.repeating=null;

		this.lastStep=0;
		this.spriteStep=0;
		this.speed=100;
		this.animate=function(spriteID, repeat){
			if (Env.isServer) return;
			if (this.animation != this.animations[spriteID]) {
				console.log("Animating "+spriteID);
				this.animation=this.animations[spriteID];
				this.repeating=repeat;
				this.state.y = this.animation.row*this.tileSize;
				this.state.x = 0;
				// if (this.animation.sheet) this.state.sheet = this.animation.sheet;
				// else delete this.state.sheet;
			}
		};
		this.dirAnimate=function(spriteID, direction, repeat){
			if (Env.isServer) return;
				 if (direction == NORTH) dir = "up";
			else if (direction == SOUTH) dir = "down";
			else if (direction == WEST)  dir = "left";
			else if (direction == EAST)  dir = "right";
			if (this.animations[spriteID+'_'+dir]) {
				this.animate(spriteID+'_'+dir, repeat);
			} else if (this.animations[spriteID]) {
				this.animate(spriteID, repeat);
			} else {
				console.error('Could not animate ['+spriteID+'] in direction ('+direction+')');
			}
		};
		this.idle=function(onAnimation){
			if (onAnimation) {
				console.log("Idling in animation: "+onAnimation);
				var animation = this.animations[onAnimation];
				this.state.y = animation.row*this.tileSize;
				this.state.x = 0;
				this.animation=null;
			} else if (this.animation) {
				this.state.y = this.animation.row*this.tileSize;
				this.state.x = 0;
				this.animation=null;
			}
		};
		this.step=function(time){
		
			if (this.animation) {
				if (time-this.lastStep >= this.speed) {
					// update animation
					++this.spriteStep;
					if (this.spriteStep>=this.animation.length) {
						this.spriteStep=0;
						if (!this.repeating) {
							this.animation = null;
						}
					}
					this.state.x = this.spriteStep*this.tileSize;

					this.lastStep=time;
				}
			}
		};
	};

	return Animable;
});
