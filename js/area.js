
// Area
define(
    [
        'eventful', 'dynamic', 'hookable', 'page', 'movable', 'loggable', 'pathfinding'
    ],
    (
        Eventful, Dynamic, Hookable, Page, Movable, Loggable, Pathfinding
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
                    this.Log(`Entity ${entity.id} moving to tile (${entity.position.tile.x}, ${entity.position.tile.y})`, LOG_DEBUG);
                    this.Log(`      Path: ${entity.pathToStr()}`, LOG_DEBUG);
                    if (entity.hasOwnProperty('isZoning')) return;
                    this.checkEntityZoned(entity);
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


            // Recalibrate a path from the movable's state to the starting point of the path
            //  Server: When the user sends a path request, but we're slightly behind in their position, then we need to
            //  recalibrate the path to start from their server position to their expected position, and add this into
            //  the path
            //
            //  Client: When the server sends us some path for an entity, but that entity isn't at the start path
            //  position (most likely they're still walking there), then need to recalibrate the path from the entity
            //  position to the start of the path
            //
            //
            // state: The (x, y) global real position
            // pathState: Start position of path
            // path: Path object
            //
            // NOTE: The recalibration will be injected into the path
            this.recalibratePath = (state, pathState, path, maxWalk) => {

                // Create a recalibration walk to move from posX/posY to center of tile
                // NOTE: global real coordinates
                const recalibrationWalk = (tile, posX, posY) => {

                    const recalibration = [];

                    if (posY !== tile.y * Env.tileSize) {
                        // Inject walk to this tile
                        const distance = -1 * (posY - tile.y * Env.tileSize),
                            walk       = new Walk((distance < 0 ? NORTH : SOUTH), Math.abs(distance), tile.offset(0, 0));
                        recalibration.unshift(walk);
                    }

                    if (posX !== tile.x * Env.tileSize) {
                        // Inject walk to this tile
                        const distance = -1 * (posX - tile.x * Env.tileSize),
                            walk       = new Walk((distance < 0 ? WEST : EAST), Math.abs(distance), tile.offset(0, 0));
                        recalibration.unshift(walk);
                    }

                    return recalibration;
                };

                // Check Path
                // If player is not currently standing on starting point for path, then inject a path from current
                // position to that starting point
                if
                (
                    pathState.position.global.y !== state.position.global.y ||
                    pathState.position.global.x !== state.position.global.x
                ) {

                    // Need to inject any necessary walk from the player position to the starting
                    // point for the path,
                    //
                    //  Player Position -> Near Tile/Player -> Near Tile/Path -> Path-Start Position
                    //
                    //
                    // Player Position (real coordinates)
                    // Nearest Tile to Player (discrete tile)
                    // Nearest Tile to Path-Start (discrete tile)
                    // Path-Start Position (real coordinates)

                    // Are we already standing on the path start tile
                    if
                    (
                        pathState.position.tile.x === state.position.tile.x &&
                        pathState.position.tile.y === state.position.tile.y
                    ) {

                        // In some cases we may be recalibrating a new path which starts on the same tile that the
                        // movable is already on. If the path is leading us into the same direction that we're already
                        // moving then don't bother to recalibrate, otherwise recalibrate to center

                        // Early out for moving in the same direction as the path
                        const pathDirection = path.walks[0].direction;
                        if ((pathDirection === WEST  && (state.position.global.x % Env.tileSize) < 0) ||
                            (pathDirection === EAST  && (state.position.global.x % Env.tileSize) > 0) ||
                            (pathDirection === NORTH && (state.position.global.y % Env.tileSize) < 0) ||
                            (pathDirection === SOUTH && (state.position.global.y % Env.tileSize) > 0)) {

                            return true;
                        }

                        // TODO: What if we're doing a 180? Should merge recalibration with first walk

                        // Otherwise we need to move to the center of the tile
                        const startTile        = new Tile(state.position.tile.x, state.position.tile.y),
                            recalibrationStart = recalibrationWalk(startTile, state.position.global.x, state.position.global.y);

                        // Extend walk from position to start
                        _.forEachRight(recalibrationStart, (recalibration) => {
                            path.walks.unshift(recalibration);
                        });

                        return true;

                    } else {

                        // Recalibrate path if necessary
                        const startTiles = this.findNearestTiles(state.position.global.x, state.position.global.y)
                                               .filter((tile) => this.hasTile(tile) && this.isTileOpen(tile)),
                            endTiles     = this.findNearestTiles(pathState.position.global.x, pathState.position.global.y)
                                               .filter((tile) => this.hasTile(tile) && this.isTileOpen(tile));

                        if (startTiles.length === 0) {
                            debugger;
                            this.Log(`Recalibration could not find any startTiles (${state.position.global.x},${state.position.global.y})`, LOG_ERROR);
                            return false;
                        }

                        // Find a path from position to beginning of path
                        const foundPath = this.findPath(startTiles, endTiles);
                        let startPath = null;
                        if (foundPath) {

                            startPath = {
                                path: null,
                                tile: foundPath.start.tile
                            };

                            if (foundPath.path) {
                                startPath.path      = foundPath.path;
                                startPath.startTile = foundPath.start;
                                startPath.endTile   = foundPath.end;
                            }
                        }

                        if (startPath) {

                            // No path found
                            if (!startPath.path) {

                                // Player Position -> Path-Start Position
                                const tile    = startPath.tile,
                                    startTile = tile;

                                if (startTile.tile) throw Err(`No startTile found`);

                                const recalibrationStart = recalibrationWalk(startTile, state.position.global.x, state.position.global.y);

                                // extend walk from position to start
                                for (let j = 0; j < recalibrationStart.length; ++j) {
                                    const recalibration = recalibrationStart[j];

                                    // This single walk is far too long
                                    path.walks.unshift(recalibration);
                                    if (recalibration.distance > (Env.tileSize * 2)) {
                                        this.Log(`Recalibration is bigger than tile size: ${recalibration.distance}`, LOG_ERROR);
                                        this.Log(startTiles, LOG_ERROR);
                                        this.Log(endTiles, LOG_ERROR);
                                        return false;
                                    }
                                }

                                // This entire path is greater than our maximum path length
                                if (path.length() > maxWalk && maxWalk > 0) {
                                    this.Log(`Recalibration is longer than our maxWalk: ${path.length()} > ${maxWalk}`, LOG_ERROR);
                                    return false;
                                }

                            } else {

                                // Path length is greater than our maximum path length
                                if (startPath.path.length() > maxWalk && maxWalk > 0) {
                                    this.Log(`Recalibration is longer than our maxWalk: ${startPath.path.length()} > ${maxWalk}`, LOG_ERROR);
                                    this.Log(startTiles);
                                    this.Log(endTiles);
                                    return false;
                                }

                                const startTile = startPath.startTile,
                                    endTile     = startPath.endTile;

                                const recalibrationStart = recalibrationWalk(startTile.tile, state.position.global.x, state.position.global.y),
                                    recalibrationEnd     = recalibrationWalk(endTile.tile, pathState.position.global.x, pathState.position.global.y);

                                // extend walk from position to start
                                for (let j = 0; j < recalibrationStart.length; ++j) {
                                    const recalibration = recalibrationStart[j];
                                    startPath.path.walks.unshift(recalibration);

                                    // This single walk is too long
                                    if (recalibration.distance > (Env.tileSize * 2)) {
                                        this.Log(`Recalibration is bigger than tile size: ${recalibration.distance}`, LOG_ERROR);
                                        this.Log(startTiles, LOG_ERROR);
                                        this.Log(endTiles, LOG_ERROR);
                                        return false;
                                    }
                                }

                                // extend walk from end to req state
                                for (let j = 0; j < recalibrationEnd.length; ++j) {
                                    const recalibration = recalibrationEnd[j],
                                        dir = recalibration.direction;

                                         if (dir === NORTH) recalibration.direction = SOUTH;
                                    else if (dir === SOUTH) recalibration.direction = NORTH;
                                    else if (dir === WEST)  recalibration.direction = EAST;
                                    else if (dir === EAST)  recalibration.direction = WEST;
                                    startPath.path.walks.push(recalibration);
                                }


                                // TODO: IF walk[0] AND adjusted walk are in same direction, add the steps together


                                _.forEachRight(startPath.path.walks, (walk) => {
                                    path.walks.unshift(walk);
                                });


                                // This entire path is longer than our maximum path length
                                if (path.length() > maxWalk && maxWalk > 0) {
                                    this.Log(`Recalibration is longer than our maxWalk: ${path.length()} > ${maxWalk}`, LOG_ERROR);
                                    this.Log(startTiles, LOG_ERROR);
                                    this.Log(endTiles, LOG_ERROR);
                                    return false;
                                }
                            }

                            return true;

                        } else {
                            this.Log("No recalibration path found to get from current player position to path start..", LOG_ERROR);
                            this.Log("--------------------------------", LOG_ERROR);
                            this.Log(startTiles, LOG_ERROR);
                            this.Log(endTiles, LOG_ERROR);
                            this.Log("--------------------------------", LOG_ERROR);
                            return false;
                        }
                    }
                }

                // Use this path
                return true;
            };

            // Find Path
            // Finds a path from one set of tiles to another set of tiles
            // NOTE: returns { path: null } if we're already there
            this.findPath = (fromTiles, toTiles, _maxWeight) => {

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


            // ------------------------------------------------------------------------------------------------------ //
            //                                       COORDINATE CALCULATIONS
            // ------------------------------------------------------------------------------------------------------ //

            this.localFromGlobalCoordinates = (x, y) => {

                const pageY = parseInt(y / Env.pageHeight, 10),
                    pageX   = parseInt(x / Env.pageWidth, 10),
                    pageI   = this.pageIndex(pageX, pageY),
                    page    = this.pages[pageI];

                return {
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

                return (inRange(tile.x, 0, this.areaWidth) &&
                        inRange(tile.y, 0, this.areaHeight));
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
                    onTileX = (posX % Env.tileSize === 0);

                // FIXME: THIS SHOULDN"T OCCUR BUT QUITE OFTEN DOES!
                // Previous just ignored this by returning nearestTile anyways
                // var nearestTile = this.findNearestTile(posX, posY);
                // return [nearestTile];
                assert(!(!onTileY && !onTileX), "Not centered to either x or y axis");

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

                return !(localCoordinates.page.collidables[localCoordinates.y] & (1 << localCoordinates.x));
            };

            this.isShootableTile = (tile) => {
                const localCoordinates = this.localFromGlobalCoordinates(tile.x, tile.y);

                const sprite = localCoordinates.page.sprites[localCoordinates.y * Env.pageWidth + localCoordinates.x];
                return (sprite && sprite.shootable);
            };
        };

        return Area;
    });
