define(function(){

	var Movable={
		_init: function() { },


        teleport(x, y) {

            // FIXME: Stop current path
            Log(`Teleporting: (${x}, ${y})`, LOG_DEBUG);
            const area = this.page.area,
                oldPage = this.page,
                tile = { x, y },
                globalPos = {
                    x: x * Env.tileSize,
                    y: y * Env.tileSize
                };

            const inRange = area.isTileInRange(tile);
            if (!inRange) {
                Log(`Could not teleport to tile (${x}, ${y}): tile not within range`);
                return false;
            }

            const isOpen = area.isTileOpen(tile);
            if (!isOpen) {
                Log(`Could not teleport to tile (${x}, ${y}): tile not an open space`);
                return false;
            }

            this.cancelPath();
            this.updatePosition(globalPos.x, globalPos.y);

            const localCoordinates = area.localFromGlobalCoordinates(x, y),
                newPage = localCoordinates.page;
            assert(newPage, "Page not found for destination-teleport tile");

            // Tell client that he's teleported first; currently the client anticipates that he's zoned from his own
            // path, but since its a teleport we need him to set his curPage through EVT_TELEPORT *before* receiving
            // zoning stuff
            this.triggerEvent(EVT_TELEPORT, newPage.index, { x, y });

            // We need to let others know that this entity has teleported. Otherwise they have no way of knowing
            // that the entity has left, or that an entity has entered this page
            this.page.broadcast(EVT_TELEPORT, {
                entityId: this.id,
                oldPage: oldPage.index,
                newPage: this.page.index,
                tile: { x, y }
            });

            area.checkEntityZoned(this);
            return true;
        }
	};

	return Movable;
});
