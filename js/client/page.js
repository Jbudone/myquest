define(function(){
	var Page = {
		_init: function(){

		},

		checkZoningTile: function(x,y) {
			return false; // TODO: do we want clients to know about zoning spots?
		},

		unload: function(){

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
				// NOTE: all we want is to unwatchEntity from the map, since removeEntity also removes it from
				// this page which is completely unecessary. However, removeEntity contains a hook which is
				// hooked by the game to remove the character script as well. So, we must remove the entity
				// this way
				if (movableID != The.player.id) {
					this.movables[movableID].unload();
				}
				this.map.removeEntity(this.movables[movableID]);
			}


			this.unloadListener();
			if (this.hasOwnProperty('unhookAllHooks')) {
				this.unhookAllHooks();
			}
		}
	};

	return Page;
});
