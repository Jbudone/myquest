define(function(){
	var Page = {
		_init: function(){

		},

		checkZoningTile: function(x,y) {
			return false; // TODO: do we want clients to know about zoning spots?
		},

		unload: function(){
			console.warn("Unloading Page ["+this.index+"]");


			for (var interactableCoord in this.interactables) {
				var interactableID = this.interactables[interactableCoord],
					interactable   = this.map.interactables[interactableID],
					ty             = parseInt(interactableCoord / Env.pageWidth),
					tx             = interactableCoord - ty*Env.pageWidth;

				for (var i=0; i<interactable.positions.length; ++i) {
					var tile = interactable.positions[i];
					if (tile.page.index === this.index &&
						tile.x == tx && tile.y == ty) {

						interactable.positions.splice(i, 1);
						break;
					}
				}

				if (interactable.positions.length == 0) {
					delete this.map.interactables[interactableID];
				}
			}


			for (var movableID in this.movables) {
				this.map.unwatchEntity(this.movables[movableID]);
			}


			this.stopAllEventsAndListeners();
		}
	};

	return Page;
});
