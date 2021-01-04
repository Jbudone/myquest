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
            this.registerHook('rightClicked');
            this.registerHook('middleDown');
            this.registerHook('middleUp');
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

        this.clickedTile = (tile, global, mouse) => {
            if (!this.doHook('clickedTile').pre(tile, global, mouse)) return;
            this.doHook('clickedTile').post(tile, global, mouse);
        };

        this.rightClicked = (mouse) => {
            if (!this.doHook('rightClicked').pre(mouse)) return;
            this.Log("Right Clicked");
            this.doHook('rightClicked').post(mouse);
        };

        this.middleMouseDown = (mouse) => {
            if (!this.doHook('middleDown').pre(mouse)) return;
            this.Log("Middle Mouse Down");
            this.doHook('middleDown').post(mouse);
        };

        this.middleMouseUp = (mouse) => {
            if (!this.doHook('middleUp').pre(mouse)) return;
            this.Log("Middle Mouse Up");
            this.doHook('middleUp').post(mouse);
        };

        this.unload = () => {
            this.unregisterAllHooks();
        };
    });

    return User;
});
