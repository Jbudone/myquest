define(['AI'], function(AI){

	var Movable={
		_init: function() {
			if (this.npc.AI) {
				console.log("Giving AI to "+this.npc.name+" ("+this.id+")");
				this.brain = new AI.Core(this);
				if (this.npc.name!=='player') {
					this.brain.addComponent(AI.Components['Follow']);
					this.brain.addComponent(AI.Components['Respawn'], {respawnPoint: new Tile(
							this.position.local.y/Env.tileSize + this.page.y,
							this.position.local.x/Env.tileSize + this.page.x,
							this.page.map)});
				} else {
					this.brain.addComponent(AI.Components['PlayerRespawn'], {respawnPoint: this.respawnPoint});				
				}
				this.brain.addComponent(AI.Components['Combat']);

				this.step=_.wrap(this.step,function(step,time){
					var stepResults = step.apply(this, [time]);
					this.brain.step(time);
				});

				this.brain.triggerEvent(EVT_BORED);

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
			this.brain.triggerEvent(EVT_RESPAWNING);
		}
	};

	return Movable;
});
