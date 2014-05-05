define(['server/AI'], function(AI){

	var Entity={
		_init: function() {
			if (this.npc.AI) {
				console.log("Giving AI to "+this.npc.name+" ("+this.id+")");
				this.AI = new AI(this);

				this.step=_.wrap(this.step,function(step,time){
					var stepResults = step.apply(this, [time]);
					this.AI.step(time);
				});
			}
		}
	};

	return Entity;
});
