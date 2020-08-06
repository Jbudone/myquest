
// Area
define(
    [
        'eventful', 'dynamic', 'hookable', 'page', 'movable', 'loggable', 'pathfinding', 'eventnodemgr', 'physicsmgr'
    ],
    (
        Eventful, Dynamic, Hookable, Page, Movable, Loggable, Pathfinding, EventNodeMgr, PhysicsMgr
    ) => {

        const Area = function(id) {

            extendClass(this).with(Eventful);
            extendClass(this).with(Hookable);
            extendClass(this).with(Loggable);
            extendClass(this).with(Dynamic);
            Ext.extend(this, 'area');

            this.Log(`Loading area ${id}`, LOG_DEBUG);

            if (id) {
                this.id   = id;
                this.area = Resources.areas[id];

                if (!this.area) throw Err(`No area found: ${id}`);
            }


            this.pages       = {};
            this.pagesPerRow = null; // TODO: fetch this from server
            this.areaWidth   = null;
            this.areaHeight  = null;

            this.pageIndex = (x, y) => (y * this.pagesPerRow + x);


            // JPS Stuff
            if (Env.game.useJPS) {

                // TODO: this is FAR too expensive in memory; should compress into 1 short (2 bytes) per tile. Note
                // that since there's a lot of tiles, there's going to be some duplicates (pidgeon-hole principle) so
                // we can maybe turn these into JumpPoint objects and have the tile reference the appropriate
                // JumpPoint? Then for temporal cache coherence, we can decompress most recently accessed JumpPoints
                // and leave those in the cache
                //
                // pendingForcedNeighbours
                // ------------------------
                //
                //  Page 1 is being added, a forced neighbour is created from a collision in Page 1, but the forced
                //  neighbour belongs to Page 2 which hasn't been created yet.
                //
                //    Page 1         Page 2
                //  +-------------+----------
                //  +      X      |X
                //  +       ######|
                //  +      X      |X
                //  +             |
                //  +-------------+----------
                //
                //

                this.jumpPoints              = null;
                this.forcedNeighbours        = {};
                this.pendingForcedNeighbours = {}; // Forced neighbours which were created from another page, where the
                                                   // forced neighbour exists on a page which hasn't been added yet
            }

            this.pathfinding = new Pathfinding(this);
            this.lastUpdated = now();

            // ------------------------------------------------------------------------------------------------------ //
            //                                       MOVABLE EVENT HANDLING
            // ------------------------------------------------------------------------------------------------------ //

            this.movables      = {};
            this.interactables = {};

            this.evtNodeMgr    = new EventNodeMgr(this);
            this.evtNodeMgr.initialize();

            this.physicsMgr    = new PhysicsMgr(this);
            this.physicsMgr.initialize();


            this.checkEntityZoned = (entity) => {

                assert(entity instanceof Movable, `Zoning entity is not a movable type`);

                // Check if entity in new page
                const pageY = parseInt(entity.position.tile.y / Env.pageHeight, 10),
                    pageX   = parseInt(entity.position.tile.x / Env.pageWidth, 10),
                    pageI   = this.pageIndex(pageX, pageY);

                let oldPage = null,
                    newPage = null;

                // Zoned to new page?
                if (pageI !== entity.page.index) {
                    newPage = this.pages[pageI];

                    if (!newPage) {
                        assert(!Env.isServer, `Page ${pageI} not found`);

                        // Entity has zoned to another page which we don't have loaded yet.  There's no need to finish
                        // the rest of this, simply trigger a zone out
                        // FIXME: This may not be necessary anymore since clients won't run this except for local player
                        entity.page.triggerEvent(EVT_ZONE_OUT, entity, null);
                        this.triggerEvent(EVT_ZONE_OUT, entity.page, entity, null);
                        return;
                    }
                }

                // Zoned to new area?
                const tY   = entity.position.tile.y % Env.pageHeight,
                    tX     = entity.position.tile.x % Env.pageWidth,
                    zoning = (newPage || entity.page).checkZoningTile(tX, tY);

                if (zoning) {
                    newPage = zoning;
                }

                // Trigger appropriate zoning event
                if (newPage) {

                    oldPage = entity.page;
                    if (zoning) {
                        this.Log(`Zoning entity [${entity.id}] to another map`, LOG_DEBUG);
                        oldPage.triggerEvent(EVT_ZONE_OUT, entity, zoning);
                        this.triggerEvent(EVT_ZONE_OUT, oldPage, entity, zoning);
                    } else {
                        this.Log(`Zoning entity [${entity.id}] from (${entity.page.index}) to page (${newPage.index})`, LOG_DEBUG);
                        entity.page.zoneEntity(newPage, entity);

                        entity.triggerEvent(EVT_ZONE, oldPage, newPage);
                        this.triggerEvent(EVT_ZONE, entity, oldPage, newPage);
                    }
                }
            };

            // Watch Entity
            // Listen to an entity within the area, whenever its moving and needs to be switched between pages
            this.registerHook('addedentity');
            this.watchEntity = (entity) => {

                this.Log(`Adding Entity ${entity.id} to area`, LOG_DEBUG);
                assert(entity instanceof Movable, `Watching entity, but entity is not a Movable type`);
                assert(!(entity.id in this.movables), `Already watching entity ${entity.id}`);

                if (!this.doHook('addedentity').pre(entity)) return;

                this.movables[entity.id] = entity;

                // Listen to the entity zoning
                this.listenTo(entity, EVT_MOVED_TO_NEW_TILE, () => {
                    //this.Log(`Entity ${entity.id} moving to tile (${entity.position.tile.x}, ${entity.position.tile.y})    {global: (${entity.position.global.x}, ${entity.position.global.y})}`, LOG_DEBUG);
                    //this.Log(`      Path: ${entity.pathToStr()}`, LOG_DEBUG);

                    // Only the server is authoritative in zoning the entity. This prevents weird potential issues where
                    // the entity may have a path from page A -> B where B is outside of our view, then we zone him to a
                    // non-existent page (does this mean we remove him entirely?). Later we receive a delayed event of
                    // him changing the course of his path such that he remains in page A, hence he never would have
                    // left page A.
                    //
                    // This leads us into potential states where entities may locally belong to another page but
                    // actually be in their previous page still. Its the unfortunate tradeoff and lesser of the two
                    // evils.
                    //
                    // On client entities will only zone when they receive an EVT_ZONE event from the server. The only
                    // affects other entities, we still need to check for zoning on our local player since otherwise
                    // there's too much of a delay to receive that event from the server.
                    if (Env.isServer || entity === The.player) {
                        if (entity.hasOwnProperty('isZoning')) return;
                        this.checkEntityZoned(entity);
                    }

                    if (this.hasTile(entity.position.tile) && !this.isTileOpen(entity.position.tile)) {
                        this.Log(`Entity ${entity.id} moving to tile (${entity.position.tile.x}, ${entity.position.tile.y})    {global: (${entity.position.global.x}, ${entity.position.global.y})}`, LOG_ERROR);
                        this.Log(entity.getPathHistory(), LOG_ERROR);
                        throw Err("Entity moved to tile which is not open");
                    }
                });

                this.doHook('addedentity').post(entity);
            };

            this.unwatchEntity = (entity) => {

                assert(entity instanceof Movable, `Unwatching entity, but entity is not a Movable type`);
                assert(entity.id in this.movables, `Not watching entity ${entity.id}`);

                this.Log(`Unwatching Entity ${entity.id}`, LOG_DEBUG);

                this.stopListeningTo(entity);
                delete this.movables[entity.id];
            };


            // Remove the entity from the area/page
            this.registerHook('removedentity');
            this.removeEntity = (entity) => {

                assert(entity instanceof Movable, `Unwatching entity, but entity is not a Movable type`);

                const page = entity.page;
                assert(page instanceof Page, `Entity ${entity.id} does not have a page`);
                assert(entity.id in page.movables, `Entity ${entity.id} not in page movables list`);

                if (!this.doHook('removedentity').pre(entity)) return;

                this.Log(`Removing Entity ${entity.id} from page`, LOG_DEBUG);
                if (entity.path) entity.path = null;

                const indexInUpdateList = page.updateList.indexOf(entity);
                assert(indexInUpdateList >= 0, `Could not find Entity ${entity.id} in page updateList`);
                page.updateList.splice(indexInUpdateList, 1);

                delete page.movables[entity.id];
                page.stopListeningTo(entity);
                this.unwatchEntity(entity);

                this.doHook('removedentity').post(entity);
            };


            // ------------------------------------------------------------------------------------------------------ //
            //                                       PATHFINDING OPERATIONS
            // ------------------------------------------------------------------------------------------------------ //


            // Find Path
            // Finds a path from one set of tiles to another set of tiles
            // NOTE: returns { path: null } if we're already there
            this.findPath = (fromTiles, toTiles, _maxWeight) => {

                DEBUGGER(); // ENsure we aren't using this anymore





                assert(_.isArray(fromTiles) && fromTiles.length > 0, "No tiles to start from");
                assert(_.isArray(toTiles) && toTiles.length > 0, "No tiles to walk to");


                // Since the path can have multiple destinations, we have to compare each destination in order to
                // decide a paths heuristic estimation cost.
                //
                // In case there are a large number of destinations, its costly to loop through each of them in
                // checking our estimation cost. Instead we can keep track of the nearest destination tile to our
                // previous tile in the path. Then every X steps along that path simply re-estimate the nearest
                // tile to use as a comparison.
                const NearestDestination = function(tile, weightWhenDecided) {
                    this.tile   = tile;
                    this.weight = weightWhenDecided;
                };

                // TileNode
                // Used for A* pathfinding
                const TileNode = function(tile, directionToTile, weight, previousTile, ignoreHeuristics) {

                    this.tile               = tile;
                    this.checked            = false;
                    this.previousDirection  = directionToTile;
                    this.weight             = weight;
                    this.nextTile           = [];
                    this.previousTile       = previousTile;
                    this.nearestDestination = null;

                    // Guessed cost from this node to goal node
                    this.estimateCost = (endTile) => {
                        const end = endTile || this.nearestDestination.tile;
                        assert(end, "Estimating cost without a valid tile!");

                        return Math.abs(end.y - this.tile.y) + Math.abs(end.x - this.tile.x) + this.weight;
                    };

                    // Determine the next best tile to take
                    if (!ignoreHeuristics) {

                        let cheapestWeight = 99999,
                            nearestEnd     = null;
                        toTiles.forEach((endTile) => {
                            const estimatedWeight = this.estimateCost(endTile);
                            if (estimatedWeight < cheapestWeight) {
                                cheapestWeight = estimatedWeight;
                                nearestEnd = endTile;
                            }
                        });

                        this.nearestDestination = new NearestDestination(nearestEnd, this.weight);
                    }
                };

                const start             = new Array(fromTiles.length),
                    maxWeight           = _maxWeight || 100, // TODO: better place to store this
                    openTiles           = {},
                    neighbours          = {};

                let nearestEnd          = null,
                    totalCostOfPathfind = 0;

                const getNeighbours = (tileNode) => {
                    const tile = tileNode.tile,
                        weight = tileNode.weight + 1;

                    const tileNeighbours =
                        [
                            { tile: new Tile(tile.x - 1, tile.y), dir: 'w' },
                            { tile: new Tile(tile.x + 1, tile.y), dir: 'e' },
                            { tile: new Tile(tile.x, tile.y - 1), dir: 'n' },
                            { tile: new Tile(tile.x, tile.y + 1), dir: 's' }
                        ].filter((o) => this.isTileInRange(o.tile))
                            .map((o) => {
                                return new TileNode(o.tile, o.dir, weight, tileNode);
                            });

                    totalCostOfPathfind += tileNeighbours.length;
                    return tileNeighbours;

                };

                const hashCoordinates = (x, y) => (maxWeight + Env.pageWidth) * y + x;

                // Must setup the toTiles first so that the fromTiles may properly estimate their nearest
                // destination tile
                toTiles.forEach((toTile) => {
                    const toNode = new TileNode(toTile, null, 9999, null, true),
                        index    = hashCoordinates(toTile.x, toTile.y);

                    toNode.end = true;
                    neighbours[index] = toNode;
                });

                // Prepare our fromTiles and openTiles
                for (let i = 0; i < fromTiles.length; ++i) {
                    const fromTile    = fromTiles[i],
                        fromNode      = new TileNode(fromTile, null, 0, null),
                        index         = hashCoordinates(fromTile.x, fromTile.y),
                        estimatedCost = fromNode.estimateCost();

                    // We can assume that fromTiles are distinct, so this MUST be a goal
                    if (neighbours[index]) {
                        return {
                            path: null,
                            start: fromNode,
                            end: fromNode
                        };
                    }

                    start[i] = fromNode;
                    neighbours[index] = fromNode;

                    if (!openTiles[estimatedCost]) {
                        openTiles[estimatedCost] = [];
                    }
                    openTiles[estimatedCost].push(fromNode);
                }

                // A* Pathfinding
                while (!isObjectEmpty(openTiles)) {

                    // Pop the (approximated) cheapest available tile
                    const cheapestWeightClass = frontOfObject(openTiles),
                        tileNode              = openTiles[cheapestWeightClass].shift();

                    if (openTiles[cheapestWeightClass].length === 0) {
                        delete openTiles[cheapestWeightClass];
                    }
                    if (tileNode.expired) continue;

                    // Check each open neighbour of tile
                    const tileNeighbours = getNeighbours(tileNode).filter((neighbour) => {
                        return (
                            this.hasTile(neighbour.tile) &&
                            this.isTileOpen(neighbour.tile) &&
                            neighbour.weight < maxWeight
                        );
                    });

                    // Check each neighbour if they were already searched (replace if necessary), otherwise add
                    for (let i = 0; i < tileNeighbours.length; ++i) {

                        const neighbourNode = tileNeighbours[i],
                            neighbour       = neighbourNode.tile,
                            neighbourHash   = hashCoordinates(neighbour.x, neighbour.y);

                        if (neighbours[neighbourHash]) {

                            // Path to neighbour already exists; use whichever one is cheaper
                            const existingNeighbour = neighbours[neighbourHash];
                            if (existingNeighbour.end) {

                                // Found path to end
                                nearestEnd                   = existingNeighbour;
                                nearestEnd.previousDirection = neighbourNode.previousDirection;
                                nearestEnd.weight            = neighbourNode.weight;
                                nearestEnd.previousTile      = neighbourNode.previousTile;
                                break;
                            } else if (existingNeighbour.weight <= neighbourNode.weight) {

                                // This neighbour is a cheaper path, ignore our current path..
                                continue;
                            } else {

                                // This existing neighbour has a faster path than ours
                                existingNeighbour.expired = true;
                                neighbours[neighbourHash] = neighbourNode;

                                const estimatedCost = neighbourNode.estimateCost();
                                if (!openTiles[estimatedCost]) {
                                    openTiles[estimatedCost] = [];
                                }
                                openTiles[estimatedCost].push(neighbourNode);
                            }
                        } else {

                            // Add neighbour
                            neighbours[neighbourHash] = neighbourNode;

                            const estimatedCost = neighbourNode.estimateCost();
                            if (!openTiles[estimatedCost]) {
                                openTiles[estimatedCost] = [];
                            }
                            openTiles[estimatedCost].push(neighbourNode);
                        }
                    }

                    // Did we already find an end?
                    if (nearestEnd) {
                        // Turns out one of the neighbours was the end
                        break;
                    }
                }

                if (nearestEnd) {

                    // Build path working backwards from this..
                    this.Log(`Path found is ${nearestEnd.weight} steps (${totalCostOfPathfind} iterations)`, LOG_DEBUG);

                    // continue stepping backwards and walk.steps++ until direction changes, then create a new walk
                    const path = new Path();

                    let nextTile  = nearestEnd.previousTile,
                        direction = nearestEnd.previousDirection,
                        startTile = null,
                        dir       = null;

                    if (direction === 'n') dir = NORTH;
                    else if (direction === 's') dir = SOUTH;
                    else if (direction === 'e') dir = EAST;
                    else if (direction === 'w') dir = WEST;
                    else if (direction === 'nw') dir = NORTHWEST;
                    else if (direction === 'ne') dir = NORTHEAST;
                    else if (direction === 'sw') dir = SOUTHWEST;
                    else if (direction === 'se') dir = SOUTHEAST;

                    let walk = new Walk(dir, Env.tileSize, null);
                    path.walks.unshift(walk);

                    while (true) {
                        if (nextTile.previousDirection === null) {
                            startTile = nextTile;
                            break; // Finished path (one of the start nodes)
                        }

                        if (nextTile.previousDirection !== direction) {

                            direction = nextTile.previousDirection;

                            dir   = null;
                            if (direction === 'n') dir = NORTH;
                            else if (direction === 's') dir = SOUTH;
                            else if (direction === 'e') dir = EAST;
                            else if (direction === 'w') dir = WEST;
                            else if (direction === 'nw') dir = NORTHWEST;
                            else if (direction === 'ne') dir = NORTHEAST;
                            else if (direction === 'sw') dir = SOUTHWEST;
                            else if (direction === 'se') dir = SOUTHEAST;

                            path.walks[0].destination = nextTile.tile;
                            walk = new Walk(dir, Env.tileSize, null);
                            path.walks.unshift(walk);
                        } else {

                            path.walks[0].distance += Env.tileSize;
                        }

                        nextTile = nextTile.previousTile;
                    }

                    path.walks[0].destination = startTile.tile;
                    path.start                = startTile.tile;

                    return {
                        path,
                        start: startTile,
                        end: nearestEnd
                    };
                } else {

                    // No path found..
                    return false;
                }
            };

            this.teleportEntity = (entity, globalPos) => {

                this.Log(`Teleporting entity ${entity.id} to (${globalPos.x}, ${globalPos.y})  [${globalPos.x / Env.tileSize}, ${globalPos.y / Env.tileSize}]`, LOG_DEBUG);
                entity.position.global.y = globalPos.y;
                entity.position.global.x = globalPos.x;
                entity.updatePosition();

                // If the new page doesn't start from the current page then we'll need to swap your page
                const tileX = globalPos.x / Env.tileSize,
                    tileY = globalPos.y / Env.tileSize,
                    localCoordinates = this.localFromGlobalCoordinates(tileX, tileY);
                assert(localCoordinates.page || !Env.isServer, "Page not found for destination-teleport tile");

                // As a client we cannot safely teleport you to another page without first receiving an EVT_ZONED event
                // from the server. Although technically you're locally in another page we have to still consider you in
                // your previous page
                if (!Env.isServer && entity !== The.player) {
                    return;
                }

                // Its possible that we're attempting to teleport the entity to a page that we don't have, in which case
                // we can simply remove the entity
                if (!Env.isServer && !this.pages[localCoordinates.page.index]) {
                    this.Log("Entity teleported out of sight!", LOG_DEBUG);
                    this.removeEntity(entity);
                    return;
                }

                if (localCoordinates.page && localCoordinates.page.index !== entity.page.index) {

                    // TODO: Should abstract this stuff
                    delete entity.page.movables[entity.id];
                    _.pull(entity.page.updateList, entity);

                    entity.page.stopListeningTo(entity);

                    // Add to new page
                    this.pages[localCoordinates.page.index].addEntity(entity);
                    entity.page = this.pages[localCoordinates.page.index];

                    if (!Env.isServer && entity === The.player) {
                        this.curPage = entity.page;
                    }
                }
            };


            // ------------------------------------------------------------------------------------------------------ //
            //                                       COORDINATE CALCULATIONS
            // ------------------------------------------------------------------------------------------------------ //


            this.localFromGlobalCoordinates = (x, y) => {

                const pageY = parseInt(y / Env.pageHeight, 10),
                    pageX   = parseInt(x / Env.pageWidth, 10),
                    pageI   = this.pageIndex(pageX, pageY),
                    page    = this.pages[pageI];

                return {
                    pageY, pageX, pageI,
                    x: (x % Env.pageWidth),
                    y: (y % Env.pageHeight),
                    page
                };
            };

            this.globalFromLocalCoordinates = (x, y, page) => {

                return {
                    x: x + page.x,
                    y: y + page.y
                };
            };

            this.isTileInRange = (tile) => {

                return (inRange(tile.x, 0, this.areaWidth - 1) &&
                        inRange(tile.y, 0, this.areaHeight - 1));
            };

            this.findNearestTile = (posX, posY) => {

                // NOTE: real coordinates return tile nearest to position
                const tileX = Math.round(posX / Env.tileSize),
                    tileY   = Math.round(posY / Env.tileSize);

                return new Tile(tileX, tileY);
            };

            this.findNearestTiles = (posX, posY) => {

                // NOTE: global real coordinates
                let tiles   = [];
                const onTileY = (posY % Env.tileSize === 0),
                    onTileX   = (posX % Env.tileSize === 0);

                if (onTileX && onTileY) {
                    const nearestTile = this.findNearestTile(posX, posY);
                    tiles.push(nearestTile);
                    return tiles;
                }

                if (!onTileY) {

                    const tileYfloor = Math.floor(posY / Env.tileSize),
                        tileX        = Math.floor(posX / Env.tileSize);

                    tiles = tiles
                        .concat(...
                            (
                                [
                                    new Tile(tileX, tileYfloor),
                                    new Tile(tileX, tileYfloor+1)
                                ]
                                .filter((tile) => this.hasTile(tile) && this.isTileInRange(tile))
                            )
                        );
                }

                if (!onTileX) {
                    const tileXfloor = Math.floor(posX / Env.tileSize),
                        tileY        = Math.floor(posY / Env.tileSize);

                    tiles = tiles
                        .concat(...
                            (
                                [
                                    new Tile(tileXfloor, tileY),
                                    new Tile(tileXfloor+1, tileY)
                                ]
                                .filter((tile) => this.hasTile(tile) && this.isTileInRange(tile))
                            )
                        );
                }

                return tiles;
            };

            this.isTileOpen = (tile) => {
                const localCoordinates = this.localFromGlobalCoordinates(tile.x, tile.y);

                if (!Env.isServer && !localCoordinates.page) return true; // We don't have this page, so lets just assume its open?
                return !(localCoordinates.page.collidables[localCoordinates.y] & (1 << localCoordinates.x));
            };

            this.isShootableTile = (tile) => {
                const localCoordinates = this.localFromGlobalCoordinates(tile.x, tile.y);

                if (!Env.isServer && !localCoordinates.page) return true; // We don't have this page, so lets just assume its open?
                const sprite = localCoordinates.page.sprites[localCoordinates.y * Env.pageWidth + localCoordinates.x];
                return (sprite && sprite.shootable);
            };

            this.findOpenTilesAbout = (tile, maxCount, _filter, maxIteration = 40) => {
                let found     = 0,
                    iteration = 0;

                const filter       = _filter ? _filter : () => true,
                    foundOpenTiles = [];

                // We want to find open tiles in a radius around the source tile, w/ tiles nearest the source tile
                // coming up first. We can path along concentric circles (increasing radius) to test each tile if its
                // open
                //
                //  Concentric circles:
                //     For each radius:
                //       1) Go upwards to the radius point (northern most point of this particular circle); add tile
                //       2) Add tile to the right
                //       3) Go down/right, add tile, repeat until we're at y - 1 (north by 1 of the source tile)
                //       4) Go down, add tile, repeat until we're at y + 1 of source tile   (exactly 2)
                //       5) Go down/left, add tile, repeat until we're at x + 1
                //       6) Go left, add tile, repeat until we're at x - 1  (exactly 2)
                //       7) Go up/left, add tile, repeat until we're at y + 1
                //       8) Go up/right, add tile, repeat until we're at x - 1
                //
                //          NOTE: Diagonal direction delta == (radius - 1)

                const phases = [
                    { dir: { x: 1,  y: 0 },  count: (r) => 1 },     // North:        Right
                    { dir: { x: 1,  y: 1 },  count: (r) => r - 1 }, // NE Diagonal:  Down/Right
                    { dir: { x: 0,  y: 1 },  count: (r) => 2 },     // East:         Down
                    { dir: { x: -1, y: 1 },  count: (r) => r - 1 }, // SW Diagonal:  Down/Left
                    { dir: { x: -1, y: 0 },  count: (r) => 2 },     // South:        Left
                    { dir: { x: -1, y: -1 }, count: (r) => r - 1 }, // SE Diagonal:  Up/Left
                    { dir: { x: 0,  y: -1 }, count: (r) => 2 },     // West:         Up
                    { dir: { x: 1,  y: -1 }, count: (r) => r - 1 }  // NE Diagonal:  Up/Right
                ];

                // Can we add the source tile? Is that open?
                if (this.isTileOpen(tile) && filter(tile)) {
                    ++found;
                    ++iteration;

                    foundOpenTiles.push(new Tile(tile.x, tile.y));
                    if (found >= maxCount || iteration >= maxIteration) {
                        return foundOpenTiles;
                    }
                }

                // I think the maximum iterations you can hit for a given radius is:
                //  maxIterations = maxRadius * 3 + 4^(maxRadius - 1)
                // 
                // The exponential term I'm pretty unsure about, but works for at least radius <= 4, which may be all we
                // ever need. But still we should confirm this for later
                // TODO: (read above)
                // 
                // For safety reasons it makes sense to constrain our radius search to the max radius we should hit for
                // the provided maxIterations:
                //
                //  maxIterations = maxRadius * 3 + 4^(maxRadius - 1)
                //  maxIterations >= maxRadius * 3
                //  maxRadius <= maxIterations / 3

                const MAX_RADIUS = maxIteration / 3,
                    tileIter     = new Tile(tile.x, tile.y);
                for (let radius = 1; radius < MAX_RADIUS; ++radius) {

                    // Get initial tile in this radius (tile north of source tile, on radius of this circle)
                    //const tileIter = new Tile(tile.x, tile.y - radius);
                    tileIter.x = tile.x;
                    tileIter.y = tile.y - radius;
                    if (this.isTileOpen(tileIter) && filter(tileIter)) {
                        ++found;
                        ++iteration;

                        foundOpenTiles.push(new Tile(tileIter.x, tileIter.y));
                        if (found >= maxCount || iteration >= maxIteration) {
                            return foundOpenTiles;
                        }
                    }

                    for (let phaseI = 0; phaseI < phases.length; ++phaseI) {
                        const phase = phases[phaseI],
                            count   = phase.count(radius);
                        for (let i = 0; i < count; ++i) {

                            // Find the next tile along this circle
                            tileIter.x += phase.dir.x;
                            tileIter.y += phase.dir.y;

                            // Is this tile open?
                            ++iteration;
                            if (this.isTileInRange(tileIter) && this.isTileOpen(tileIter) && filter(tileIter)) {
                                ++found;

                                foundOpenTiles.push(new Tile(tileIter.x, tileIter.y));
                                if (found >= maxCount || iteration >= maxIteration) {
                                    return foundOpenTiles;
                                }
                            }

                        }
                    }
                }

                return foundOpenTiles;
                
                /*
                OLD ALGORITHM HERE:
                 - Kept here in case the above turns out to be no good. When you stumble upon this comment in the future, please delete the block below
                //assert(this.isTileOpen(tile), "Provided tile is not open");
                
                //const maxWeight     = 100,
                //    hashCoordinates = (x, y)  => (maxWeight + Env.pageWidth) * y + x,
                //    tilesToSearch   = [tile],
                //    tiles           = {},
                //    found           = 0,
                //    markedTiles     = {};


                // Search for open tiles
                while
                (
                    found < count && // Until we reach our desired count
                    tilesToSearch.length && // Or we've exhausted our searchable tile list
                    iteration < maxIteration // Or we've been searching for far too long
                )
                {
                    const nextTile = tilesToSearch.shift(),
                        hash = hashCoordinates(nextTile.x, nextTile.y);

                    ++iteration;

                    // Have we checked this tile yet?
                    if (markedTiles[hash]) continue;
                    markedTiles[hash] = true;

                    // Open?
                    if (!this.isTileOpen(nextTile)) continue;

                    tiles[hash] = nextTile;
                    foundOpenTiles.unshift(nextTile);

                    // Add all of its neighbour tiles to the search list
                    [
                        new Tile(nextTile.x - 1, nextTile.y),
                        new Tile(nextTile.x + 1, nextTile.y),
                        new Tile(nextTile.x, nextTile.y - 1),
                        new Tile(nextTile.x, nextTile.y + 1)
                    ].filter((o) => this.isTileInRange(o))
                     .filter(filter)
                     .map((o) => tilesToSearch.push(o));
                }

                return foundOpenTiles;
                */
            };


            this.dump = function() {
                return {
                    'name': this.id
                };
            };
        };

        return Area;
    });
