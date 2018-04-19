define(['sprite', 'eventful'], function(Sprite, Eventful){

    let entities = 0;

    const Entity = function(spriteID, page) {
        this.spriteID = spriteID;
        this.id       = (++entities);
        this.npc      = Resources.npcs[spriteID];
        this.page     = page;
        this.name     = this.npc.name;

        extendClass(this).with(Eventful);

        this.sprite = Resources.sprites[this.npc.sheet];
        this.step   = (time) => {
            this.triggerEvent(EVT_STEP);
            this.handlePendingEvents();
        };

        Ext.extend(this, 'entity');
    };


    return Entity;
});
