define(function(){
	var Page = {
		_init: function(){

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
