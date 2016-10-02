define(() => {

    const Page = {
        _init() {},

        checkZoningTile(x,y) {
            return false; // TODO: do we want clients to know about zoning spots?
        },

        unload() {

            this.Log(`Unloading Page ${this.index}`, LOG_DEBUG);

            for (const interactableCoord in this.interactables) {
                const interactableID = this.interactables[interactableCoord],
                    interactable     = this.area.interactables[interactableID],
                    ty               = parseInt(interactableCoord / Env.pageWidth, 10),
                    tx               = interactableCoord - ty * Env.pageWidth;

                for (let i = 0; i < interactable.positions.length; ++i) {
                    const tile = interactable.positions[i];
                    if (tile.page.index === this.index &&
                        tile.x === tx && tile.y === ty) {

                        interactable.positions.splice(i, 1);
                        break;
                    }
                }

                if (interactable.positions.length === 0) {
                    delete this.area.interactables[interactableID];
                }
            }


            for (const movableID in this.movables) {
                // NOTE: all we want is to unwatchEntity from the area, since removeEntity also removes it from this
                // page which is completely unecessary. However, removeEntity contains a hook which is hooked by the
                // game to remove the character script as well. So, we must remove the entity this way
                if (movableID != The.player.id) {
                    this.movables[movableID].unload();
                }
                this.area.removeEntity(this.movables[movableID]);
            }


            this.unloadListener();
            if (this.unhookAllHooks) {
                this.unhookAllHooks();
            }
        }
    };

    return Page;
});
