define(function(){
	var Page = {
		_init: function(){

			this.listenTo(this, EVT_ADDED_ENTITY, function(page, entity){

				this.listenTo(entity, EVT_DIED, function(entity){

					this.stopListeningTo(entity);
					delete this.movables[entity.id];
				}, HIGH_PRIORITY);
			});
		},

		checkZoningTile: function(y,x) {
			return false; // TODO: do we want clients to know about zoning spots?
		},

		unload: function(){
			console.warn("Unloading Page ["+this.index+"]");
			this.stopAllEventsAndListeners();
		}
	};

	return Page;
});
