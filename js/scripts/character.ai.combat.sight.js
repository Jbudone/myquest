define(['SCRIPTINJECT', 'hookable', 'scripts/character.ai.ability'], (SCRIPTINJECT, Hookable, Ability) => {

    /* SCRIPTINJECT */

    // Sight
    //
    //  TODO
    //   - keep track of tiles in game
    //      > allow hooking/unhooking tiles; create a hash & add/remove tile
    //      > game hook character movement; check if tile exists, if so then trigger hook
    //   - listen to tile
    //   - trigger movement on tile; callback here
    //   - initial look: clear current tiles/listening & listen to surrounding tiles; keep track of outer most
    //   tiles
    //   - update: (on guard) loop through outer most tiles & update
    //   - only consider non-collision tiles
    //   - Might be worth it to setup megatiles (clumped convex regions of non-collidable tiles), then have
    //   tiles point to which megatiles they belong to, and triggerEvent on each of those regions. Then we
    //   could update sight infrequently and efficiently
    //
    //   Edge tiles: used for efficiently updating which tiles we're watching

    const Sight = function(game, combat, character) {

        Ability.call(this);

        extendClass(this).with(Hookable);

        this.tiles = [];
        this.tile  = null;

        this.onReady = function(){};

        const _sight = this,
            sightRange = 2;

        let _script = null;

        this.server = {

            initialize() {
                _script = this;

                _sight.start();
            },

            standGuard: () => {

            },

            stopGuarding: () => {

            },

            start: () => {

                character.hook('guard', this).after(() => {
                    this.updatePosition();
                    this.look();

                    character.hook('moved', this).after(() => {
                        character.hook('moved', this).remove();
                        this.clearTiles();
                    });

                });


                this.updatePosition();
                this.look();

                this.registerHook('see');
                this.onReady();
            },

            updatePosition: () => {
                const pos = character.entity.position.tile;
                this.tile = pos;
            },

            addTile: (tile) => {
                this.tiles.push(tile);
                game.tile(tile.x, tile.y).listen(this, (character) => {
                    if (!this.doHook('see').pre(character)) return;
                    this.doHook('see').post(character);
                });
            },

            clearTiles: () => {
                for (let i = 0; i < this.tiles.length; ++i) {
                    const tile = this.tiles[i];
                    game.tile(tile.x, tile.y).forget(this);
                }
                this.tiles = [];
            },

            look: () => {

                this.clearTiles();
                if (!_.isObject(this.tile)) return;

                const tilesToTest   = [],
                    tilesConsidered = {},
                    myTile          = this.tile;

                const hashTile = (x, y) => y * character.entity.page.area.areaWidth + x;
                const isInRange = (x, y) => Math.abs(x - myTile.x) <= sightRange && Math.abs(y - myTile.y) <= sightRange;

                tilesToTest.push(this.tile);
                tilesConsidered[ hashTile(tilesToTest[0]) ] = true;
                while (tilesToTest.length) {
                    const tile = tilesToTest.shift();

                    if (isInRange(tile.x, tile.y)) {
                        this.addTile(tile);

                        const north  = { x: tile.x, y: tile.y - 1 },
                            west     = { x: tile.x - 1, y: tile.y },
                            south    = { x: tile.x, y: tile.y + 1 },
                            east     = { x: tile.x + 1, y: tile.y },
                            tryTiles = [north, west, south, east];

                        for (let i = 0; i < tryTiles.length; ++i) {
                            const nTile = tryTiles[i],
                                hash    = hashTile(nTile.x, nTile.y);

                            if (!tilesConsidered[hash]) {
                                tilesToTest.push(nTile);
                                tilesConsidered[hash] = true;
                            }
                        }
                    }
                }
            }
        };

    };

    Sight.prototype = Object.create(Ability.prototype);
    Sight.prototype.constructor = Sight;

    return Sight;
});
