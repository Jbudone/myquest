
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

				// NOTE: when we die, we will follow our player upon respawn, and would like to have all of
				// our event listeners (walking, zoning, UI, dying, etc.) to persist
				if (The.player !== true) {
					this.listenTo(this, EVT_DIED, function(){
						this.stopAllEventsAndListeners();
					});
				}
			}
		}
	};

	return Movable;
});

