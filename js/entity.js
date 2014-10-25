define(['sprite','eventful'], function(Sprite, Eventful){

	var entities = 0;

	function Entity(spriteID, page) {
		this.spriteID = spriteID;
		this.id = (++entities);
		this.npc=Resources.npcs[spriteID];
		this.page = page;
		extendClass(this).with(Eventful);

		// NOTE: player zoning handled in server/player.js file
		// if (!(Env.isServer && spriteID == 'player')) {
		// 	this.listenTo(this, EVT_ZONE, function(me, newPage){
		// 		this.page = newPage;
		// 	}, HIGH_PRIORITY);
		// }

		this.sprite=Resources.sprites[this.npc.sheet];
		this.posX=32*2;
		this.posY=32*2;
		this.tileX=0;
		this.tileY=0;
		this.step=function(time){
			this.triggerEvent(EVT_STEP);
			this.handlePendingEvents();
		}

		Ext.extend(this,'entity');
	};


	return Entity;
});
