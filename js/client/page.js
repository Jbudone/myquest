define(function(){
	var Page = {
		_init: function(){

			this.listenTo(this, EVT_ADDED_ENTITY, function(page, entity){

				//  FIXME: brain
				// this.listenTo(entity.character, EVT_DIED, function(character){

				// 	this.stopListeningTo(character);
				// 	this.stopListeningTo(character.entity);
				// 	delete this.movables[character.entity.id];
				// }, HIGH_PRIORITY);
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
