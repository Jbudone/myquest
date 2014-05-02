
define(['resources','sprite'], function(Resources,Sprite){


	var Animable = function(spriteID){
		Ext.extend(this,'animable');
		this.base = Sprite;
		this.base(spriteID);

		this.animations=Resources.animations[spriteID].animations;
		this.animation=null;

		this.lastStep=0;
		this.spriteStep=0;
		this.speed=100;
		this.animate=function(spriteID){
			if (this.animation != this.animations[spriteID]) {
				this.animation=this.animations[spriteID];
				this.state.y = this.animation.row*this.tileSize;
				this.state.x = 0;
				if (this.animation.sheet) this.state.sheet = this.animation.sheet;
				else delete this.state.sheet;
			}
		};
		this.idle=function(){
			this.animation=null;
		};
		this.step=function(time){
		
			if (this.animation) {
				if (time-this.lastStep >= this.speed) {
					// update animation
					++this.spriteStep;
					if (this.spriteStep>=this.animation.length) this.spriteStep=0;
					this.state.x = this.spriteStep*this.tileSize;

					this.lastStep=time;
				}
			}
		};
	};

	return Animable;
});
