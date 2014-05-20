
define(['AI'], function(AI){
	var Movable={
		_init: function() {
			if (this.npc.AI) {
				console.log("Giving AI to "+this.npc.name+" ("+this.id+")");
				this.brain = new AI.Core(this);

				this.step=_.wrap(this.step,function(step,time){
					var stepResults = step.apply(this, [time]);
					this.brain.step(time);
				});

				this.listenTo(this, EVT_DIED, function(){
					this.stopAllEventsAndListeners();
				});
			}
		}
	};

	return Movable;
});

