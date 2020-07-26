define(['scripts/eventnodes.base'], function(EventNodeBase){

	const AnimSpriteEventNode = function() {

        EventNodeBase.call(this);
		
		this.server = {

            PlayerNearby(owner, character) {
                if (!owner.a) owner.a = 0;
                console.log("SOMEONE NEARBY CAMPFIRE");
                owner.broadcast('PlayerNearby', owner.a++);
                if (owner.a > 100) owner.a = 1;
            },

			activate(resArgs, instanceArgs, modified, state, owner) {

                console.log("Activating EventNode");
                modified.spriteIdx = 0;
                modified.timer = resArgs.timer;

                const region = instanceArgs.region[0], // FIXME: Only 1 tile for position now
                    page     = state.page,
                    globalY  = Math.floor(region / page.area.areaWidth),
                    globalX  = region - globalY * page.area.areaWidth;

                const watchingTiles = [];

                const evtCallback = owner.addEvent('PlayerNearby');

                const range = 8;
                for (let y = globalY - range; y < globalY + range; ++y) {
                    for (let x = globalX - range; x < globalX + range; ++x) {
                        watchingTiles.push({ x, y });
                        page.area.game.tile(x, y).listen(this, evtCallback);
                    }
                }

                state.watchingTiles = watchingTiles;


                // FIXME: If we continue watching tiles need to expand outwards to avoid collisions
                /*
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

                */
            },

            step(resArgs, instanceArgs, modified, owner, delta) {

                modified.timer -= delta;
                if (modified.timer <= 0) {
                    return false;
                }
                console.log("Step timer: " + modified.timer);

                modified.spriteIdx = (modified.spriteIdx + 1) % resArgs.animation['0'].length;
                owner.broadcast('SpriteIdx', modified.spriteIdx);
                return true;
            },

            deactivate(resArgs, instanceArgs, modified, owner) {

                modified.spriteIdx = 0;
                owner.broadcast('SpriteIdx', modified.spriteIdx);
            }
        };


		this.client = {

            PlayerNearby(owner, args) {
                console.log("RECEIVED EVENT FROM SERVER");
                console.log(args);

                // FIXME: Add effects to owner.modified.effects; then update renderer
                owner.localSprite.effects = args; 
            },

            SpriteIdx(owner, args) {
                owner.modified.spriteIdx = args;
            },

            updateSprite() {

            },

			activate(resArgs, instanceArgs, modified, state, owner) {

                modified.spriteIdx = 0;
                modified.animTimer = 0; // Force initial step to blit

                const region = instanceArgs.region[0], // FIXME: Only 1 tile for position now
                    globalY  = Math.floor(region / The.area.areaWidth),
                    globalX  = region - globalY * The.area.areaWidth;

                const localCoords = The.area.localFromGlobalCoordinates(globalX, globalY),
                    localSprite = localCoords.page.sprites[ localCoords.y * Env.pageWidth + localCoords.x ];

                localSprite.sprite = resArgs.animation['0'][modified.spriteIdx] + 1;
                localSprite.static = false;
                owner.localSprite = localSprite;

                owner.addEvent('PlayerNearby');
                owner.addEvent('SpriteIdx');
            },

            step(resArgs, instanceArgs, modified, owner, delta) {

                modified.animTimer -= delta;
                if (modified.animTimer > 0) {
                    return;
                }

                modified.animTimer += resArgs.animSpeed;
                modified.spriteIdx = (modified.spriteIdx + 1) % resArgs.animation['0'].length;


                const region = instanceArgs.region[0], // FIXME: Only 1 tile for position now
                    globalY  = Math.floor(region / The.area.areaWidth),
                    globalX  = region - globalY * The.area.areaWidth;

                const localCoords = The.area.localFromGlobalCoordinates(globalX, globalY),
                    localSprite = localCoords.page.sprites[ localCoords.y * Env.pageWidth + localCoords.x ];

                let spriteIdx = modified.spriteIdx;
                if (localSprite.sprite !== spriteIdx) {
                    localSprite.sprite = resArgs.animation['0'][modified.spriteIdx] + 1;
                    localSprite.static = false;
                    The.renderer.blitPage(modified.page, 0, 0);
                }
                
            },

            deactivate(resArgs, instanceArgs, modified, owner) {
                //modified.spriteIdx = 0;
            },

            unload(resArgs, instanceArgs, modified, owner) {

                modified.spriteIdx = 0;

                const region = instanceArgs.region[0], // FIXME: Only 1 tile for position now
                    globalY  = Math.floor(region / The.area.areaWidth),
                    globalX  = region - globalY * The.area.areaWidth;

                const localCoords = The.area.localFromGlobalCoordinates(globalX, globalY),
                    localSprite = localCoords.page.sprites[ localCoords.y * Env.pageWidth + localCoords.x ];

                let spriteIdx = modified.spriteIdx;
                if (localSprite.sprite !== spriteIdx) {
                    localSprite.sprite = resArgs.animation['0'][modified.spriteIdx] + 1;
                    localSprite.static = false;
                }
            }
        };

        this.initialize(); // Setup from Base
	};

    AnimSpriteEventNode.prototype = Object.create(EventNodeBase.prototype);
    AnimSpriteEventNode.prototype.constructor = AnimSpriteEventNode;

	return AnimSpriteEventNode;
});
