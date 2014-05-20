define(['AI'], function(AI){

	var Movable={
		_init: function() {
			if (this.npc.AI) {
				console.log("Giving AI to "+this.npc.name+" ("+this.id+")");
				this.brain = new AI.Core(this);
				if (this.npc.name!=='player')
					this.brain.addComponent(AI.Components['Follow']);
				this.brain.addComponent(AI.Components['Combat']);

				this.step=_.wrap(this.step,function(step,time){
					var stepResults = step.apply(this, [time]);
					this.brain.step(time);
				});

				this.listenTo(this, EVT_DIED, function(){
					var me = this,
						respawn = this.respawn;
					console.log("["+this.id+"] RESPAWNING IN "+this.npc.spawn);
					setTimeout(function(){
						respawn.apply(me);
					}, this.npc.spawn);
				});

			}
		},
		respawn: function(){
			console.log("RESPAWNING!!");
			this.physicalState.transition(STATE_ALIVE);
			this.path = null;
			this.zoning = false;
			this.lastMoved=now();
			this.health=this.npc.health;
			this.lastStep=0;
			this.sprite.idle();
			this.brain.reset();
			this.pendingEvents=[];
			console.log("["+this.id+"] RESPAWNED");
			this.page.addEntity(this);
		}
	};

	return Movable;
});
