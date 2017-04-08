define(['hookable', 'dynamic', 'loggable'], (Hookable, Dynamic, Loggable) => {

    const User = (new function(){
        extendClass(this).with(Hookable);
        extendClass(this).with(Dynamic);
        extendClass(this).with(Loggable);

        this.setLogGroup('User');
        this.setLogPrefix('User');

        const handleEvent = (evt) => {
            if (_.isUndefined(evt)) return;
        };

        this.initialize = () => {
            this.registerHook('initializedUser');
            this.registerHook('clickedEntity');
            this.registerHook('clickedTile');
            this.registerHook('clickedItem');
            this.registerHook('clickedInteractable');
        };

        this.clickedEntity = (entity) => {
            if (!this.doHook('clickedEntity').pre(entity)) return;
            this.Log("Clicked entity");
            this.doHook('clickedEntity').post(entity);
        };

        this.clickedItem = (item) => {
            if (!this.doHook('clickedItem').pre(item)) return;
            this.Log("Clicked item");
            this.doHook('clickedItem').post(item);
        };

        this.clickedInteractable = (interactable, key) => {
            if (!this.doHook('clickedInteractable').pre(interactable, key)) return;
            this.Log("Clicked interactable");
            this.doHook('clickedInteractable').post(interactable, key);
        };

        this.clickedTile = (tile) => {
            if (!this.doHook('clickedTile').pre(tile)) return;
            this.doHook('clickedTile').post(tile);
        };

        this.unload = () => {
            this.unregisterAllHooks();
        };
    });

    return User;
});
