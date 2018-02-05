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
            this.registerHook('rightClickedEntity');
            this.registerHook('clickedTile');
            this.registerHook('clickedItem');
            this.registerHook('clickedInteractable');
        };

        this.clickedEntity = (entity, mouse) => {
            if (!this.doHook('clickedEntity').pre(entity, mouse)) return;
            this.Log("Clicked entity");
            this.doHook('clickedEntity').post(entity, mouse);
        };

        this.rightClickedEntity = (entity, mouse) => {
            if (!this.doHook('rightClickedEntity').pre(entity, mouse)) return;
            this.Log("Right Clicked entity");
            this.doHook('rightClickedEntity').post(entity, mouse);
        };

        this.clickedItem = (item, mouse) => {
            if (!this.doHook('clickedItem').pre(item, mouse)) return;
            this.Log("Clicked item");
            this.doHook('clickedItem').post(item, mouse);
        };

        this.clickedInteractable = (interactable, key, mouse) => {
            if (!this.doHook('clickedInteractable').pre(interactable, key, mouse)) return;
            this.Log("Clicked interactable");
            this.doHook('clickedInteractable').post(interactable, key, mouse);
        };

        this.clickedTile = (tile, mouse) => {
            if (!this.doHook('clickedTile').pre(tile, mouse)) return;
            this.doHook('clickedTile').post(tile, mouse);
        };

        this.unload = () => {
            this.unregisterAllHooks();
        };
    });

    return User;
});
