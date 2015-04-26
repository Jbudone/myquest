define(['hookable', 'dynamic', 'loggable'], function(Hookable, Dynamic, Loggable){

	var User = (new function(){
		extendClass(this).with(Hookable);
		extendClass(this).with(Dynamic);
		extendClass(this).with(Loggable);
		this.setLogGroup('User');
		this.setLogPrefix('(User) ');

		var handleEvent = function(evt){
			if (_.isUndefined(evt)) return;
		};

		this.registerHook('clickedEntity');
		this.registerHook('clickedTile');
		this.registerHook('clickedItem');
		this.registerHook('clickedInteractable');
		this.clickedEntity = function(entity){
			if (!this.doHook('clickedEntity').pre(entity)) return;
			this.Log("Clicked entity");
			this.doHook('clickedEntity').post(entity);
		};

		this.clickedItem = function(item){
			if (!this.doHook('clickedItem').pre(item)) return;
			this.Log("Clicked item");
			this.doHook('clickedItem').post(item);
		};

		this.clickedInteractable = function(interactable){
			if (!this.doHook('clickedInteractable').pre(interactable)) return;
			this.Log("Clicked interactable");
			this.doHook('clickedInteractable').post(interactable);
		};

		this.clickedTile = function(tile){
			if (!this.doHook('clickedTile').pre(tile)) return;
			this.doHook('clickedTile').post(tile);
		};

	});

	return User;
});
