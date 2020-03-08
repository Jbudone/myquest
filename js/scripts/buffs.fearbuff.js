define(['scripts/buffs.base'], function(BuffBase){

    const FearBuff = function() {

        BuffBase.call(this);

        this.server = {

			activate(character, args) {
                console.log("FEARED!");

                // FIXME: prevent any paths during this time


                // Find an open, nearby tile
                const filterOpenTiles = (tile) => {
                    const localCoords = area.localFromGlobalCoordinates(tile.x, tile.y),
                        distFromPos   = Math.abs(tile.x - curTile.x) + Math.abs(tile.y - curTile.y);
                    return (localCoords.page && distFromPos >= 2);
                };


                const area     = character.entity.page.area,
                    curTile    = new Tile(character.entity.position.tile.x, character.entity.position.tile.y),
                    openTiles  = area.findOpenTilesAbout(curTile, 25, filterOpenTiles, 1000);

                if (openTiles.length > 0) {
                    const openTileIdx = Math.floor(Math.random() * (openTiles.length - 1)),
                        openTile      = openTiles[openTileIdx];

                    character.brain.instincts.movement.goToTile(openTile, 0).then(() => {
                        // FIXME: Re-fear again
                    });
                }


            },

            deactivate(character, args, modified) {
                console.log("Not feared anymore!");


                // FIXME: Restore previous state (combat? autoattack)
            }

        };

        this.client = {

			activate(character, args) {
                console.log("FEARED!");
            },

            deactivate(character, args, modified) {
                console.log("Not feared anymore!");
            },

        };

        this.initialize(); // Setup from Base
    };

    FearBuff.prototype = Object.create(BuffBase.prototype);
    FearBuff.prototype.constructor = FearBuff;

	return FearBuff;
});
