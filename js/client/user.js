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
		this.clickedEntity = function(entity){
			if (!this.doHook('clickedEntity').pre(entity)) return;
			this.Log("Clicked entity");

			this.doHook('clickedEntity').post(entity);
			// server.attackEntity(ui.hoveringEntity)
			// 	  .then(function(){
			// 		  The.player.brain.setTarget(ui.hoveringEntity);
			// 	  });
		};

		this.clickedTile = function(tile){
			if (!this.doHook('clickedTile').pre(tile)) return;
			this.doHook('clickedTile').post(tile);
		};

	});

	return User;
});
