
define(['resources','sprite','eventful'], function(Resources, Sprite, Eventful){

	var entities = 0;

	function Entity(spriteID) {
		Ext.extend(this,'entity');
		extendClass(this).with(Eventful);


		this.spriteID = spriteID;
		this.id = (++entities);
		this.npc=Resources.npcs[spriteID];
		this.sprite=Resources.sprites[this.npc.sheet];
		this.posX=32*2;
		this.posY=32*2;
		this.step=function(time){
			this.triggerEvent(EVT_STEP);
			this.handlePendingEvents();
		}

	};


	return Entity;
});
