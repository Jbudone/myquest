define(() => {

    const findPath = (area, fromPt, toPt, options) => {
        // FIXME
        //  - Perform a hierarchical search
        //      1) HPA* (partition into regions, graph of distance beteen portals in cube); FIXME: How ro
        //      initially find nearest portal from start point and end point (or distance to each portal from
        //      point)
        //          - Vary region sizes since paths likely won't extend very far; also be smarter about
        //          partitioning, rather than grid which could partition two very separate regions into the same
        //          cell (mountain top and ground area)
        //          - Cache searches (user: holding down mouse can re-use cached results; npcs: chasing player
        //          that's moving)
        //          - Overlapping regions/cells to minimize portal usage (since most paths will be less than the
        //          length of a cell, we can do most pathfinding directly inside that cell)
        //      2) Internal search
        //          - Jump point (if maze-like)
        //          - Convex / navmesh
        //          - Circles of convex regions
        //          - A*
        //      3) Point search; maybe use convex circles (every tile has a radius specifying how open it is)
        //      used for smoothening & making more accurate search
        //
        //      Can choose what to use and to what degree of accuracy (players perform high quality search,
        //      server does quixk search for lame npcs and quality search for bosses)
        //      
        //      - User send full point path (server don't validate, just check for collision at runtime)
        //      - Server send higher level path (A* tiles? Arbitrary points along path? Start/End? Can vary this
        //      depending on whats necessary)
        //      - Dynamic collisions: find all entities with paths in the region and re-path if necessary;
        //      update grid in webworker and fallback to A* in meantime; can webworker re-pathing depending on
        //      severity for each npc)
        //
        //
        //      This can return a Route object which can later be refined. Route object has different phases:
        //          - Start/End points
        //          - High level HPA* graph path
        //          - Convex/Navmesh path  --> Refine/smooth  (first nav path, then smooth the nav path)
        //          - A* path              --> Refine/smooth
        //          - Point path           --> Refine/smooth
        //
        //      We may only need to fetch the high level AND first segment of this path immediately, and then
        //      refine it continuously w/ varying importance (as we get closer to the next waypoint it becomes
        //      more crucial to determine the next part of the path). We can also vary how much of the path we
        //      send to users, and allow the user to determine the npc's path themselves
        //
        //      Route objects can be tossed in a global list of Paths that continuously get stepped
        //      (movement/next position) and refined all at once, and possibly with webworkers
        //      
        //      Initial phases provide waypoints for lower phases
        // ========================================================================================== //

        if (_.isUndefined(options)) options = {};
        _.defaults(options, {
            maxWeight: Env.pageWidth * Env.tileSize * 3,
            range: 0,
            rangeWidth: 0
        });



        const pages     = area.pages,
            areaWidth   = area.areaWidth,
            areaHeight  = area.areaHeight,
            pagesPerRow = area.pagesPerRow;
        


        const isTileInRange = (tile) => {
            return (inRange(tile.x, 0, areaWidth - 1) &&
                inRange(tile.y, 0, areaHeight - 1));
        };

        const pageIndex = (x, y) => (y * pagesPerRow + x);

        const hasTile = (tile) => {
            const pageY = parseInt(tile.y / Env.pageHeight, 10),
                pageX   = parseInt(tile.x / Env.pageWidth, 10),
                pageI   = pageIndex(pageX, pageY);

            return pageI in pages;
        };

        const isTileOpen = (tile) => {
            const pageY = parseInt(tile.y / Env.pageHeight, 10),
                pageX   = parseInt(tile.x / Env.pageWidth, 10),
                pageI   = pageIndex(pageX, pageY),
                page    = pages[pageI];

            const localX = tile.x % Env.pageWidth,
                localY = tile.y % Env.pageHeight;


            if (!page) return true; // We don't have this page, so lets just assume its open?
            return !(page.collidables[localY] & (1 << localX));
        };

        const isObjectEmpty = function(obj) {
            //assert(obj instanceof Object, "Expected object");

            let empty = true;
            for (const s in obj) {
                empty = false;
                break;
            }

            return empty;
        };

        const frontOfObject = function(obj) {
            //assert(obj instanceof Object, "Expected object");

            for (const k in obj){
                return k;
            }
            return null;
        };

        const inRange = function(n, min, max) {
            return n >= min && n <= max;
        };


        const Tile = function(x, y) {
            this.x = x;
            this.y = y;
        };

        const Walk = function(direction, distance, destination) {
            this.direction   = direction;
            this.distance    = distance; // distance (global real coordinates)
            this.walked      = 0; // distance travelled already
            this.destination = destination;
        };

        const Path = function() {
            this.walks       = [];
            this.start       = null;
        };

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


        const allOpenTiles = {};

        // TileNode
        // Used for A* pathfinding
        const TileNode = function(tile, direction, weight, previousTile, ignoreHeuristics) {

            {
                if (previousTile) {
                    const _pHash = hashCoordinates(previousTile.tile.x, previousTile.tile.y);
                    if (!allOpenTiles[_pHash]) DEBUGGER();
                }
            }

            this.tile               = tile;
            this.checked            = false;
            this.previousDirection  = direction;
            this.weight             = weight;
            this.nextTile           = [];
            this.previousTile       = previousTile;
            this.nearestDestination = null;

            // Guessed cost from this node to goal node
            this.estimateCost = (endTile) => {
                const end = endTile || this.nearestDestination.tile;
                //assert(end, "Estimating cost without a valid tile!");

                // FIXME: Allow diagonal direction
                let r = Math.abs(end.y - this.tile.y) + Math.abs(end.x - this.tile.x) + this.weight;
                if (isNaN(r)) DEBUGGER();
                return r;
                //return Math.ceil(Math.sqrt( Math.pow(end.y - this.tile.y, 2) + Math.pow(end.x - this.tile.x, 2) ) + this.weight);
            };

            // Determine the next best tile to take
            if (!ignoreHeuristics) {

                let cheapestWeight = 99999,
                    nearestEnd     = null;
                toTiles.forEach((endTile) => {
                    const estimatedWeight = this.estimateCost(endTile.tile);
                    if (estimatedWeight < cheapestWeight) {
                        cheapestWeight = estimatedWeight;
                        nearestEnd = endTile.tile;
                    }
                });

                this.nearestDestination = new NearestDestination(new Tile(nearestEnd.x, nearestEnd.y), this.weight);
            }
        };

        //const start             = new Array(1),
        const maxWeight           = options.maxWeight, // TODO: better place to store this
            openNodes             = {},
            neighbours            = {};

        let nearestEnd          = null,
            totalCostOfPathfind = 0,
            debugCheckedNodes   = [];

        const diagonalCost = 1.5,//Math.ceil(Math.sqrt(Env.tileSize)),
            cardinalCost   = 1;


        const getNeighbours = (tileNode) => {
            const tile = tileNode.tile;

            // FIXME: Check previousDirection to avoid searching in the reverse direction (was going north, no need to check south neighbour)
            //          - can use previousDirection to index into an array that works as a bitmask to determine whether
            //          or not we accept a particular direction

            let dirMask = 0;
            const neighbours =
                [
                    // Cardinal Directions
                    { tile: { x: tile.x - 1, y: tile.y },     weight: cardinalCost, dir: 'w', mask: 1, dep: 0 },
                    { tile: { x: tile.x + 1, y: tile.y },     weight: cardinalCost, dir: 'e', mask: 2, dep: 0 },
                    { tile: { x: tile.x, y: tile.y - 1 },     weight: cardinalCost, dir: 'n', mask: 4, dep: 0 },
                    { tile: { x: tile.x, y: tile.y + 1 },     weight: cardinalCost, dir: 's', mask: 8, dep: 0 },

                    // Diagonal Directions
                    // Going in a diagonal direction to the nearest edge; so pick the min cardinal direction and use
                    // that as our travel distance
                    { tile: { x: tile.x - 1, y: tile.y - 1 },     weight: diagonalCost, dir: 'nw', mask: 0, dep: 4 | 1 },
                    { tile: { x: tile.x + 1, y: tile.y - 1 },     weight: diagonalCost, dir: 'ne', mask: 0, dep: 4 | 2 },
                    { tile: { x: tile.x - 1, y: tile.y + 1 },     weight: diagonalCost, dir: 'sw', mask: 0, dep: 8 | 1 },
                    { tile: { x: tile.x + 1, y: tile.y + 1 },     weight: diagonalCost, dir: 'se', mask: 0, dep: 8 | 2 },

                ];

            for (let i = 0; i < neighbours.length; ++i) {
                const o = neighbours[i];
                if (o.dep !== 0 && (o.dep & dirMask) !== o.dep) {
                    // Dependency isn't there
                    neighbours[i].tile = null;
                } else {
                    if
                    (
                        isTileInRange(o.tile) &&
                        o.weight < maxWeight &&
                        hasTile(o.tile) &&
                        isTileOpen(o.tile)
                    )
                    {
                        dirMask |= o.mask;
                        
                        const tIdx = hashCoordinates(o.tile.x, o.tile.y);
                        allOpenTiles[tIdx] = o;
                    }
                    else
                    {
                        neighbours[i].tile = null;
                    }
                }
            }

            return neighbours.filter((o) => {
                    return o.tile !== null;
                }).map((o) => {
                    if (!allOpenTiles[hashCoordinates(o.tile.x, o.tile.y)]) DEBUGGER();
                    // FIXME: Is turnWeight causing us to turn backwards unexpected??
                    //const turnWeight = 0;// (tileNode.previousDirection && tileNode.previousDirection !== o.dir ? 0.5 : 0.0);
                    const turnWeight = (tileNode.previousDirection && tileNode.previousDirection !== o.dir ? 0.5 : 0.0);
                    return new TileNode(o.tile, o.dir, tileNode.weight + o.weight + turnWeight, tileNode);
                });
        };

        const hashCoordinates = (x, y) => {
            return y * areaWidth + x;
        };


        const filterTilesInRange = (centerTiles, options) => {

            const range      = Math.ceil(options.range / Env.tileSize),
                rangeWidth   = Math.ceil(options.rangeWidth / Env.tileSize),
                isAdjacent   = options.adjacent || false,
                filterFunc   = options.filterFunc,
                shootThrough = options.shootThrough;


            if (!_.isArray(centerTiles)) centerTiles = [centerTiles];
            if (range === 0 || isNaN(range)) return centerTiles;

            const tiles  = [],
                hashList = {};

            const tileHash = (tile) => tile.y * areaWidth + tile.x;

            // TODO: Could clean this up to bake the filterFunc ahead of time
            centerTiles.forEach((centerTile) => {

                //if (filterFunc) {

                //    // Custom filtering function
                //    const expandedTiles = filterFunc(centerTile, this.area);
                //    if (!_.isArray(expandedTiles)) throw Err("Filter func returned non-array type");

                //    expandedTiles.forEach((expandedTile) => {
                //        const tile = new Tile(expandedTile.x, expandedTile.y),
                //            hash   = tileHash(tile);

                //        if (hash in hashList) return; // Has this tile been added yet?
                //        hashList[hash] = true; // Hash this tile to avoid checking it again
                //        if (!isTileOpen(tile)) return; // Is this tile open? (able to walk on)
                //        tiles.push(tile);
                //    });
                //} else {

                    //if (isAdjacent) {

                    //    tiles.push(new Tile(centerTile.x, centerTile.y)); // Current tile

                    //    const x        = centerTile.x,
                    //        y          = centerTile.y,
                    //        directions = [
                    //            { xDir: 1, yDir: 0 },
                    //            { xDir: -1, yDir: 0 },
                    //            { xDir: 0, yDir: 1 },
                    //            { xDir: 0, yDir: -1 }
                    //        ];

                    //    directions.forEach(({ xDir, yDir }) => {

                    //        for (let offset = 1; offset <= range; ++offset) {
                    //            const tile = new Tile(x + xDir * offset, y + yDir * offset),
                    //                hash   = tileHash(tile);
                    //            if (hashList[hash]) continue; // Has this tile been added yet?
                    //            hashList[hash] = true; // Hash this tile to avoid checking it again
                    //            if (!isTileOpen(tile)) {
                    //                // FIXME: Abstract shootable filtering for only range based combat
                    //                if (!shootThrough || !this.area.isShootableTile(tile)) {
                    //                    break; // Is this tile open? If not then we shouldn't be able to reach anything beyond that either
                    //                } else {
                    //                    continue; // We can shoot through this tile, so allow open tiles further along the path, but don't include this tile as an acceptable to-tile
                    //                }
                    //            }
                    //            tiles.push(tile);
                    //        }
                    //    });

                    //} else {

                        // Create a box range about this center tile
                        // NORTH -> SOUTH
                        for (let y = centerTile.tile.y - range; y < centerTile.tile.y + range; ++y) {
                            for (let x = centerTile.tile.x - rangeWidth; x < centerTile.tile.x + rangeWidth; ++x) {
                                const tile = new Tile(x, y),
                                    hash   = tileHash(tile);
                                if (hashList[hash]) continue; // Has this tile been added yet?
                                hashList[hash] = true; // Hash this tile to avoid checking it again
                                if (!isTileOpen(tile)) continue; // Is this tile open? (able to walk on)
                                allOpenTiles[hash] = tile;
                                tiles.push(tile);
                            }
                        }

                        // WEST -> EAST
                        for (let y = centerTile.tile.y - rangeWidth; y < centerTile.tile.y + rangeWidth; ++y) {
                            for (let x = centerTile.tile.x - range; x < centerTile.tile.x + range; ++x) {
                                const tile = new Tile(x, y),
                                    hash   = tileHash(tile);
                                if (hashList[hash]) continue; // Has this tile been added yet?
                                hashList[hash] = true; // Hash this tile to avoid checking it again
                                if (!isTileOpen(tile)) continue; // Is this tile open? (able to walk on)
                                allOpenTiles[hash] = tile;
                                tiles.push(tile);
                            }
                        }
                    //}

                //}
            });

            return tiles;
        };


        /*
        // In range check if we have a range set
        let nodeInRange = (node) => false;
        if (options.range) {
            nodeInRange = (node) => {
                // FIXME: If node within circle range of target? Is node in an accepted tile?
                let distSq = Math.pow(toPt.x - node.pt.x, 2) + Math.pow(toPt.y - node.pt.y, 2),
                    rangeSq = options.range * options.range;

                if (distSq <= rangeSq) {
                    if (
                }

                return false;
            };
        }
        */

        /*
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
        */

        const toTile = new TileNode(new Tile(Math.floor(toPt.x / Env.tileSize), Math.floor(toPt.y / Env.tileSize)), null, 9999 * Env.tileSize, null, true);
        toTile.end = true;

        const toTileIdx = hashCoordinates(toTile.tile.x, toTile.tile.y);
        neighbours[toTileIdx] = toTile;

        const toTiles = [toTile];
        if (options.range > 0) {
            filterTilesInRange(toTile, options).forEach((tile) => {
                const toTile = new TileNode({ x: tile.x, y: tile.y }, null, 9999, null, true);
                toTile.end = true;
                toTiles.push(toTile);
                const toTileHash = hashCoordinates(toTile.tile.x, toTile.tile.y);
                allOpenTiles[toTileHash] = toTile;
            });
        }


        const fromTile    = new TileNode(new Tile(Math.floor(fromPt.x / Env.tileSize), Math.floor(fromPt.y / Env.tileSize)), null, 0, null),
            fromTileIdx   = hashCoordinates(fromTile.tile.x, fromTile.tile.y),
            estimatedCost = fromTile.estimateCost();

        allOpenTiles[fromTileIdx] = fromTile;

        // We can assume that fromTiles are distinct, so this MUST be a goal
        if (neighbours[fromTileIdx]) {
            //return {
            //    path: null,
            //    start: fromTile,
            //    end: fromTile
            //};

            nearestEnd = toTile;
        } else {

            neighbours[fromTileIdx] = fromTile;

            if (!openNodes[estimatedCost]) {
                openNodes[estimatedCost] = [];
            }

            openNodes[estimatedCost].push(fromTile);
        }

        let totalIts = 0;

        // A* Pathfinding
        while (!isObjectEmpty(openNodes)) {

            ++totalIts;
            if (totalIts > 1000) {
                // NOTE: This could occur in cases where we pick a tile that's open but its impossible to reach (eg.
                // other side of a mountain). When we get a higher level graph we can easily first-pass check those
                //DEBUGGER();
                console.log("We've iterated too much! Something went wrong");
                DEBUGGER();
                break;
            }

            // Pop the (approximated) cheapest available pt
            //const cheapestWeightClass = frontOfObject(openNodes),
            //    openNode              = openNodes[cheapestWeightClass].shift();

            // FIXME: frontOfObject not working so long as we have a turn weight of 0.5 (string ordering?)
            let cheapestWeightClass = frontOfObject(openNodes);
            Object.keys(openNodes).forEach((key) => {
                if (parseInt(key, 10) < cheapestWeightClass) {
                    cheapestWeightClass = key;
                }
            });
            const openNode = openNodes[cheapestWeightClass].shift();

            if (openNodes[cheapestWeightClass].length === 0) {
                delete openNodes[cheapestWeightClass];
            }
            if (openNode.expired) continue;

            // Check each open neighbour of tile
            const nodeNeighbours = getNeighbours(openNode).filter((neighbour) => neighbour.weight < maxWeight);
            totalCostOfPathfind += nodeNeighbours.length;

            // Check each neighbour if they were already searched (replace if necessary), otherwise add
            for (let i = 0; i < nodeNeighbours.length; ++i) {

                const neighbourNode = nodeNeighbours[i],
                    neighbour       = neighbourNode.tile,
                    neighbourHash   = hashCoordinates(neighbour.x, neighbour.y);


                debugCheckedNodes.push({ x: neighbour.x, y: neighbour.y, cost: cheapestWeightClass });

                if (neighbours[neighbourHash]) {

                    // Path to neighbour already exists; use whichever one is cheaper
                    const existingNeighbour = neighbours[neighbourHash];

                    //if (existingNeighbour.pt.x !== neighbourNode.pt.x || existingNeighbour.pt.y !== neighbourNode.pt.y) {
                    //    throw `Hash collision! ${existingNeighbour.pt.x} !== ${neighbourNode.pt.x} && ${existingNeighbour.pt.y} !== ${neighbourNode.pt.y}; hash: ${neighbourHash}`;
                    //}

                    if (existingNeighbour.end) {

                        // Found path to end
                        //console.log(`Reached end point (${neighbourNode.pt.x}, ${neighbourNode.pt.y})`);
                        nearestEnd                   = existingNeighbour;
                        nearestEnd.previousDirection = neighbourNode.previousDirection;
                        nearestEnd.weight            = neighbourNode.weight;
                        nearestEnd.previousTile      = neighbourNode.previousTile;
                        break;
                    } else if (existingNeighbour.weight <= neighbourNode.weight) {

                        // This neighbour is a cheaper path, ignore our current path..
                        //console.log(`Found neighbour, but existing path is cheaper (or equal) (${neighbourNode.pt.x}, ${neighbourNode.pt.y}); weight ${existingNeighbour.weight} <= ${neighbourNode.weight}   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
                        continue;
                    } else {

                        // This existing neighbour has a faster path than ours
                        existingNeighbour.expired = true;
                        neighbours[neighbourHash] = neighbourNode;

                        const estimatedCost = neighbourNode.estimateCost();
                        if (!openNodes[estimatedCost]) {
                            openNodes[estimatedCost] = [];
                        }
                        openNodes[estimatedCost].push(neighbourNode);
                        if (!allOpenTiles[hashCoordinates(neighbourNode.tile.x, neighbourNode.tile.y)]) DEBUGGER();

                        //console.log(`Found neighbour, new path is cheaper (${neighbourNode.pt.x}, ${neighbourNode.pt.y}); weight ${existingNeighbour.weight} > ${neighbourNode.weight}   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
                    }
                } else {

                    // Add neighbour
                    neighbours[neighbourHash] = neighbourNode;

                    const estimatedCost = neighbourNode.estimateCost();
                    if (!openNodes[estimatedCost]) {
                        openNodes[estimatedCost] = [];
                    }
                    openNodes[estimatedCost].push(neighbourNode);
                    if (!allOpenTiles[hashCoordinates(neighbourNode.tile.x, neighbourNode.tile.y)]) DEBUGGER();
                    //console.log(`Added new point (${neighbourNode.pt.x}, ${neighbourNode.pt.y}); weight ${neighbourNode.weight}   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
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
            //console.log(`Path found is ${nearestEnd.weight} steps (${totalCostOfPathfind} iterations)`);

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

            // NOTE: We may simply be moving to a point within the same tile
            if (nextTile) {
                let walk = new Walk(dir, 1, nearestEnd.tile);
                path.walks.unshift(walk);
            } else {
                nextTile = fromTile;
            }

            while (true) {
                if (nextTile.previousDirection === null) {
                    startTile = nextTile;
                    break; // Finished path (one of the start nodes)
                }

                if (nextTile.previousDirection !== direction) {

                    // Are we walking backwards? Error in pathfinding
                    if
                    (
                        (direction === 'n'  && nextTile.previousDirection === 's') ||
                        (direction === 's'  && nextTile.previousDirection === 'n') ||
                        (direction === 'w'  && nextTile.previousDirection === 'e') ||
                        (direction === 'e'  && nextTile.previousDirection === 'w') ||
                        (direction === 'nw' && nextTile.previousDirection === 'se') ||
                        (direction === 'ne' && nextTile.previousDirection === 'sw') ||
                        (direction === 'sw' && nextTile.previousDirection === 'ne') ||
                        (direction === 'se' && nextTile.previousDirection === 'nw')

                        // Unfortunately can't check this until we rework backtrack/recalibration at end of walk
                        //(direction === 'nw' && nextTile.previousDirection === 'e') ||
                        //(direction === 'nw' && nextTile.previousDirection === 's') ||
                        //(direction === 'ne' && nextTile.previousDirection === 'w') ||
                        //(direction === 'ne' && nextTile.previousDirection === 's') ||

                        //(direction === 'sw' && nextTile.previousDirection === 'e') ||
                        //(direction === 'sw' && nextTile.previousDirection === 'n') ||
                        //(direction === 'se' && nextTile.previousDirection === 'w') ||
                        //(direction === 'se' && nextTile.previousDirection === 'n')
                    )
                    {
                        //if (nextTile.aboutToRecalib) {
                        //    // FIXME: Need to smooth/refine path to avoid backtracking. See recalibration for why this
                        //    // happens
                        //} else {
                            DEBUGGER();
                            throw "Bad direction change: moving backwards";
                        //}
                    }

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
                    else throw `UNEXPECTED DIR ${direction}`;


                    walk = new Walk(dir, 1, null);
                    path.walks.unshift(walk);
                    path.walks[0].destination = nextTile.tile;
                } else {
                    ++path.walks[0].distance;
                }

                nextTile = nextTile.previousTile;
                if (!isTileOpen(nextTile.tile)) DEBUGGER();
            }

            if
            (
                path.walks.length > 0 &&
                (path.walks[path.walks.length - 1].destination.x !== toTile.tile.x ||
                path.walks[path.walks.length - 1].destination.y !== toTile.tile.y)
            )
            {
                DEBUGGER();
            }

            // Convert walks into point-based walks
            let pt = { x: fromPt.x, y: fromPt.y },
                tile = { x: startTile.tile.x, y: startTile.tile.y };
            for (let i = 0; i < path.walks.length; ++i) {
                const walk = path.walks[i],
                    tileDist = walk.distance,
                    tileDest = walk.destination;

                let dist;
                if (tile.x === tileDest.x) {
                    // Point to edge of neighbour tile, then tileDist the rest of the way
                    let innerTileDist = Env.tileSize - (pt.y % Env.tileSize),
                        distMult = 1;

                    if (tile.y > tileDest.y) {
                        innerTileDist = Env.tileSize - innerTileDist + 1;
                        distMult = -1;
                    }

                    dist = innerTileDist + (tileDist - 1) * Env.tileSize;

                    {
                        for (let t = 0; t < dist; ++t) {
                            const _tPt = { x: pt.x, y: pt.y + t * distMult },
                                _tTile = { x: Math.floor(_tPt.x / Env.tileSize), y: Math.floor(_tPt.y / Env.tileSize) };
                            if (!isTileOpen(_tTile)) DEBUGGER();
                        }
                    }

                    pt.y += dist * distMult;
                    tile.y += tileDist * distMult;
                    if (tile.x !== tileDest.x || tile.y !== tileDest.y) DEBUGGER();
                    if (Math.floor(pt.x / Env.tileSize) !== tile.x || Math.floor(pt.y / Env.tileSize) !== tile.y) DEBUGGER();
                } else if (tile.y === tileDest.y) {
                    // Point to edge of neighbour tile, then tileDist the rest of the way
                    let innerTileDist = Env.tileSize - (pt.x % Env.tileSize),
                        distMult = 1;

                    if (tile.x > tileDest.x) {
                        innerTileDist = Env.tileSize - innerTileDist + 1;
                        distMult = -1;
                    }

                    dist = innerTileDist + (tileDist - 1) * Env.tileSize;

                    {
                        for (let t = 0; t < dist; ++t) {
                            const _tPt = { x: pt.x + t * distMult, y: pt.y },
                                _tTile = { x: Math.floor(_tPt.x / Env.tileSize), y: Math.floor(_tPt.y / Env.tileSize) };
                            if (!isTileOpen(_tTile)) DEBUGGER();
                        }
                    }

                    pt.x += dist * distMult;
                    tile.x += tileDist * distMult;
                    if (tile.x !== tileDest.x || tile.y !== tileDest.y) DEBUGGER();
                    if (Math.floor(pt.x / Env.tileSize) !== tile.x || Math.floor(pt.y / Env.tileSize) !== tile.y) DEBUGGER();
                } else { 
                    // Diagonal

                    let innerTileDistX = Env.tileSize - (pt.x % Env.tileSize),
                        distMultX = 1;

                    if (tile.x > tileDest.x) {
                        innerTileDistX = Env.tileSize - innerTileDistX + 1;
                        distMultX = -1;
                    }


                    let innerTileDistY = Env.tileSize - (pt.y % Env.tileSize),
                        distMultY = 1;

                    if (tile.y > tileDest.y) {
                        innerTileDistY = Env.tileSize - innerTileDistY + 1;
                        distMultY = -1;
                    }


                    dist = Math.max(innerTileDistX, innerTileDistY) + (tileDist - 1) * Env.tileSize;

                    {
                        for (let t = 0; t < dist; ++t) {
                            const _tPt = { x: pt.x + t * distMultX, y: pt.y + t * distMultY },
                                _tTile = { x: Math.floor(_tPt.x / Env.tileSize), y: Math.floor(_tPt.y / Env.tileSize) };
                            if (!isTileOpen(_tTile)) DEBUGGER();
                        }
                    }

                    pt.x += dist * distMultX;
                    pt.y += dist * distMultY;
                    tile.x += tileDist * distMultX;
                    tile.y += tileDist * distMultY;

                    if (tile.x !== tileDest.x || tile.y !== tileDest.y) DEBUGGER();
                    if (Math.floor(pt.x / Env.tileSize) !== tile.x || Math.floor(pt.y / Env.tileSize) !== tile.y) DEBUGGER();
                }

                if (tile.x !== tileDest.x || tile.y !== tileDest.y) DEBUGGER();
                if (Math.floor(pt.x / Env.tileSize) !== tile.x || Math.floor(pt.y / Env.tileSize) !== tile.y) DEBUGGER();
                if (!isTileOpen(tile)) DEBUGGER();

                walk.distance = dist;
                walk.destination = { x: pt.x, y: pt.y };
            }

            if
            (
                path.walks.length > 0 &&
                (Math.floor(path.walks[path.walks.length - 1].destination.x / Env.tileSize) !== toTile.tile.x ||
                Math.floor(path.walks[path.walks.length - 1].destination.y / Env.tileSize) !== toTile.tile.y)
            )
            {
                DEBUGGER();
            }


            // Recalibrate from point to endpoint; should be within same tile
            {
                    // Forwardtrack to edge of accepted range within block

                    // Vertical adjacency from target?
                    // Within rangeWidth for east/west and range for north/south
                    let distX = toPt.x - pt.x,
                        distY = toPt.y - pt.y;
                    let recabX = 0;
                    let recabY = 0;
                    if (Math.abs(distX) > Math.abs(distY)) {
                        // West-East

                        // Are we outside of rangeWidth?
                        if (Math.abs(distY) > options.rangeWidth) {
                            // Need to forward track into range
                            recabY = Math.abs(distY) - options.rangeWidth;
                            if (distY < 0) recabY *= -1;
                        }

                        if (Math.abs(distX) > options.range) {
                            recabX = Math.abs(distX) - options.range;
                            if (distX < 0) recabX *= -1;
                        }
                    } else {
                        // North-South

                        // Are we outside of rangeWidth?
                        if (Math.abs(distX) > options.rangeWidth) {
                            // Need to forward track into range
                            recabX = Math.abs(distX) - options.rangeWidth;
                            if (distX < 0) recabX *= -1;
                        }

                        if (Math.abs(distY) > options.range) {
                            recabY = Math.abs(distY) - options.range;
                            if (distY < 0) recabY *= -1;
                        }
                    }

                    const _origRecabX = recabX,
                        _origRecabY = recabY;

                    const recalibrateX = () => {
                        if (recabX === 0) return;
                        let dist     = (recabX > 0 ? 1 : -1),
                            dir      = (recabX > 0 ? EAST : WEST);

                        // Can we simply backtrack in our previous jump?
                        //if
                        //(
                        //    (prevNode.previousDirection === 'e' && dir === 'w') ||
                        //    (prevNode.previousDirection === 'w' && dir === 'e')
                        //)
                        //{
                        //    let maxDist = 0;
                        //    if (prevNode.previousPt) {
                        //        maxDist = Math.abs(prevNode.pt.x - prevNode.previousPt.pt.x);
                        //    }

                        //    prevNode.pt.x += Math.min(Math.abs(dist), Math.abs(maxDist)) * (dist > 0 ? 1 : -1);
                        //}
                        //else
                        {
                            pt.x += recabX;
                            const walk = new Walk(dir, Math.abs(recabX), { x: pt.x, y: pt.y });
                            path.walks.push(walk);
                        }
                    };

                    const recalibrateY = () => {
                        if (recabY === 0) return;
                        let dist     = (recabY > 0 ? 1 : -1),
                            dir      = (recabY > 0 ? SOUTH : NORTH);


                        // Can we simply backtrack in our previous jump?
                        //if
                        //(
                        //    (prevNode.previousDirection === 's' && dir === 'n') ||
                        //    (prevNode.previousDirection === 'n' && dir === 's')
                        //)
                        //{
                        //    let maxDist = 0;
                        //    if (prevNode.previousPt) {
                        //        maxDist = Math.abs(prevNode.pt.y - prevNode.previousPt.pt.y);
                        //    }

                        //    prevNode.pt.y += Math.min(Math.abs(dist), Math.abs(maxDist)) * (dist > 0 ? 1 : -1);
                        //}
                        //else
                        {
                            pt.y += recabY;
                            const walk = new Walk(dir, Math.abs(recabY), { x: pt.x, y: pt.y });
                            path.walks.push(walk);
                        }
                    };


                let movingHorizontal = true;
                if (path.walks.length > 0) {
                    let prevWalk = path.walks[path.walks.length - 1];
                    movingHorizontal = (prevWalk.direction === WEST || prevWalk.direction === EAST);
                }

                //prevNode.aboutToRecalib = true;
                if (movingHorizontal) {
                    recalibrateX();
                    recalibrateY();
                } else {
                    recalibrateY();
                    recalibrateX();
                }
            }

            /*
            // FIXME: Because we start counting destination from 2nd last pt, need to add destination at the end
            // (or if we trust it, simply the destination)
            // FIXME: If we have a walk of 1, we need to set the destination here
            if (path.walks.length > 1) {
                let prevDest = path.walks[path.walks.length - 2].destination;

                const finalWalk = path.walks[path.walks.length - 1],
                    finalDest   = { x: prevDest.x, y: prevDest.y },
                    finalDist   = finalWalk.distance,
                    finalDir    = finalWalk.direction;

                finalWalk.destination = finalDest;

                if (finalDir === NORTH || finalDir === NORTHWEST || finalDir === NORTHEAST) {
                    finalDest.y -= finalDist;
                } else if (finalDir === SOUTH || finalDir === SOUTHWEST || finalDir === SOUTHEAST) {
                    finalDest.y += finalDist;
                }

                if (finalDir === WEST || finalDir === NORTHWEST || finalDir === SOUTHWEST) {
                    finalDest.x -= finalDist;
                } else if (finalDir === EAST || finalDir === NORTHEAST || finalDir === SOUTHEAST) {
                    finalDest.x += finalDist;
                }

                if (finalDest.x !== nearestEnd.pt.x || finalDest.y !== nearestEnd.pt.y) {
                    DEBUGGER(); // Wrong destination
                }
            }

            {
                path.walks[0].destination = { x: startPt.pt.x, y: startPt.pt.y };
                const startDir = path.walks[0].direction,
                    startDist  = path.walks[0].distance,
                    startDest  = path.walks[0].destination;

                if (startDir === NORTH || startDir === NORTHWEST || startDir === NORTHEAST) {
                    startDest.y -= startDist;
                } else if (startDir === SOUTH || startDir === SOUTHWEST || startDir === SOUTHEAST) {
                    startDest.y += startDist;
                }

                if (startDir === WEST || startDir === NORTHWEST || startDir === SOUTHWEST) {
                    startDest.x -= startDist;
                } else if (startDir === EAST || startDir === NORTHEAST || startDir === SOUTHEAST) {
                    startDest.x += startDist;
                }
            }
            */


            // FIXME: Check path: safe path? destinations accurate? proper endPoint?
            {

                let tileX   = Math.floor(fromPt.x / Env.tileSize),
                    tileY   = Math.floor(fromPt.y / Env.tileSize),
                    globalX = fromPt.x,
                    globalY = fromPt.y,
                    tile    = { x: tileX, y: tileY };

                for (let i = 0; i < path.walks.length; ++i) {
                    let walk = path.walks[i],
                        dist = walk.distance;


                    const isNorth = walk.direction === NORTH || walk.direction === NORTHWEST || walk.direction === NORTHEAST,
                        isSouth   = walk.direction === SOUTH || walk.direction === SOUTHWEST || walk.direction === SOUTHEAST,
                        isWest    = walk.direction === WEST  || walk.direction === NORTHWEST || walk.direction === SOUTHWEST,
                        isEast    = walk.direction === EAST  || walk.direction === NORTHEAST || walk.direction === SOUTHEAST;



                    //this.Log(`Checking from (${globalX}, ${globalY}) for walk (${walk.direction}}, ${dist})`, LOG_DEBUG);
                    for (let t = 0; t < dist; ) {

                        let dX = 0, dY = 0;
                        if (isNorth) dY = globalY % Env.tileSize + 1;
                        else if (isSouth) dY = Env.tileSize - (globalY % Env.tileSize);

                        if (isWest) dX = globalX % Env.tileSize + 1;
                        else if (isEast) dX = Env.tileSize - (globalX % Env.tileSize);

                        // Shortest path to next tile (note we may only be moving in cardinal direction, so 0 means not in
                        // that direction)
                        if (dX === 0) dX = 999999;
                        if (dY === 0) dY = 999999;
                        let d = Math.min(dX, dY, dist - t);
                        t += d;

                        if (isNorth) globalY -= d;
                        else if (isSouth) globalY += d;

                        if (isWest) globalX -= d;
                        else if (isEast) globalX += d;

                        //this.Log("d: " + d, LOG_DEBUG);
                        tile.x = Math.floor(globalX / Env.tileSize);
                        tile.y = Math.floor(globalY / Env.tileSize);

                        //checkStr += `(${tile.x}, ${tile.y}) `;
                        if (!isTileOpen(tile)) {
                        //    checkStr += "NOPE";
                        //    this.Log(checkStr, LOG_INFO);
                        //    return false;
                            DEBUGGER();
                        }
                    }

                    if (walk.destination.x !== globalX || walk.destination.y !== globalY) {
                        DEBUGGER();
                    }
                }

                
                if (tile.x !== toTile.tile.x || tile.y !== toTile.tile.y) {
                    DEBUGGER();
                }
            }



            // FIXME: Work backwards to connect tiles; in path
            // FIXME: Work forwards to build actual path (point distance; smoothening for diagonals)

            //path.walks[0].destination = startPt.pt;
            path.start                = fromPt;


            return {
                debugCheckedNodes,
                path,
                options,
                start: fromPt,
                end: nearestEnd
            };
        } else {

            // No path found..
            return false;
        }





    };

    const findPathOld = (area, fromPt, toPt, options) => {
        // FIXME
        //  - Perform a hierarchical search
        //      1) HPA* (partition into regions, graph of distance beteen portals in cube); FIXME: How ro
        //      initially find nearest portal from start point and end point (or distance to each portal from
        //      point)
        //          - Vary region sizes since paths likely won't extend very far; also be smarter about
        //          partitioning, rather than grid which could partition two very separate regions into the same
        //          cell (mountain top and ground area)
        //          - Cache searches (user: holding down mouse can re-use cached results; npcs: chasing player
        //          that's moving)
        //          - Overlapping regions/cells to minimize portal usage (since most paths will be less than the
        //          length of a cell, we can do most pathfinding directly inside that cell)
        //      2) Internal search
        //          - Jump point (if maze-like)
        //          - Convex / navmesh
        //          - Circles of convex regions
        //          - A*
        //      3) Point search; maybe use convex circles (every tile has a radius specifying how open it is)
        //      used for smoothening & making more accurate search
        //
        //      Can choose what to use and to what degree of accuracy (players perform high quality search,
        //      server does quixk search for lame npcs and quality search for bosses)
        //      
        //      - User send full point path (server don't validate, just check for collision at runtime)
        //      - Server send higher level path (A* tiles? Arbitrary points along path? Start/End? Can vary this
        //      depending on whats necessary)
        //      - Dynamic collisions: find all entities with paths in the region and re-path if necessary;
        //      update grid in webworker and fallback to A* in meantime; can webworker re-pathing depending on
        //      severity for each npc)
        //
        //
        //      This can return a Route object which can later be refined. Route object has different phases:
        //          - Start/End points
        //          - High level HPA* graph path
        //          - Convex/Navmesh path  --> Refine/smooth  (first nav path, then smooth the nav path)
        //          - A* path              --> Refine/smooth
        //          - Point path           --> Refine/smooth
        //
        //      We may only need to fetch the high level AND first segment of this path immediately, and then
        //      refine it continuously w/ varying importance (as we get closer to the next waypoint it becomes
        //      more crucial to determine the next part of the path). We can also vary how much of the path we
        //      send to users, and allow the user to determine the npc's path themselves
        //
        //      Route objects can be tossed in a global list of Paths that continuously get stepped
        //      (movement/next position) and refined all at once, and possibly with webworkers
        //      
        //      Initial phases provide waypoints for lower phases



        // 1) Tile based search w/ point start/end
        // 2) Add weight to start tiles
        // 3) Optimizations


        // ========================================================================================== //

        if (_.isUndefined(options)) options = {};
        _.defaults(options, {
            maxWeight: Env.pageWidth * Env.tileSize * 3,
            range: 0,
            rangeWidth: 0
        });



        const pages     = area.pages,
            areaWidth   = area.areaWidth,
            areaHeight  = area.areaHeight,
            pagesPerRow = area.pagesPerRow;
        


        const isTileInRange = (tile) => {
            return (inRange(tile.x, 0, areaWidth - 1) &&
                inRange(tile.y, 0, areaHeight - 1));
        };

        const pageIndex = (x, y) => (y * pagesPerRow + x);

        const hasTile = (tile) => {
            const pageY = parseInt(tile.y / Env.pageHeight, 10),
                pageX   = parseInt(tile.x / Env.pageWidth, 10),
                pageI   = pageIndex(pageX, pageY);

            return pageI in pages;
        };

        const isTileOpen = (tile) => {
            const pageY = parseInt(tile.y / Env.pageHeight, 10),
                pageX   = parseInt(tile.x / Env.pageWidth, 10),
                pageI   = pageIndex(pageX, pageY),
                page    = pages[pageI];

            const localX = tile.x % Env.pageWidth,
                localY = tile.y % Env.pageHeight;


            if (!page) return true; // We don't have this page, so lets just assume its open?
            return !(page.collidables[localY] & (1 << localX));
        };

        const isObjectEmpty = function(obj) {
            //assert(obj instanceof Object, "Expected object");

            let empty = true;
            for (const s in obj) {
                empty = false;
                break;
            }

            return empty;
        };

        const frontOfObject = function(obj) {
            //assert(obj instanceof Object, "Expected object");

            for (const k in obj){
                return k;
            }
            return null;
        };

        const inRange = function(n, min, max) {
            return n >= min && n <= max;
        };


        const Tile = function(x, y) {
            this.x = x;
            this.y = y;
        };

        const Walk = function(direction, distance, destination) {
            this.direction   = direction;
            this.distance    = distance; // distance (global real coordinates)
            this.walked      = 0; // distance travelled already
            this.destination = destination;
        };

        const Path = function() {
            this.walks       = [];
            this.start       = null;
        };

        // Since the path can have multiple destinations, we have to compare each destination in order to
        // decide a paths heuristic estimation cost.
        //
        // In case there are a large number of destinations, its costly to loop through each of them in
        // checking our estimation cost. Instead we can keep track of the nearest destination tile to our
        // previous tile in the path. Then every X steps along that path simply re-estimate the nearest
        // tile to use as a comparison.
        const NearestDestination = function(pt, tile, weightWhenDecided) {
            this.pt     = pt;
            this.tile   = tile;
            this.weight = weightWhenDecided;
        };



        // TileNode
        // Used for A* pathfinding
        const TileNode = function(pt, directionToPt, weight, previousPt, ignoreHeuristics) {

            this.pt                 = pt;
            this.tile               = new Tile(Math.floor(pt.x / Env.tileSize), Math.floor(pt.y / Env.tileSize));
            this.checked            = false;
            this.previousDirection  = directionToPt;
            this.weight             = weight;
            this.nextTile           = [];
            this.previousPt         = previousPt;
            this.nearestDestination = null;

            // Guessed cost from this node to goal node
            this.estimateCost = (endPt) => {
                const end = endPt || this.nearestDestination.pt;
                //assert(end, "Estimating cost without a valid tile!");

                // FIXME: Allow diagonal direction
                return Math.abs(end.y - this.pt.y) + Math.abs(end.x - this.pt.x) + this.weight;
                //return Math.ceil(Math.sqrt( Math.pow(end.y - this.pt.y, 2) + Math.pow(end.x - this.pt.x, 2) ) + this.weight);
            };

            // Determine the next best tile to take
            if (!ignoreHeuristics) {

                let cheapestWeight = 99999,
                    nearestEnd     = null;
                //toTiles.forEach((endTile) => {
                    const estimatedWeight = this.estimateCost(toPt);
                    if (estimatedWeight < cheapestWeight) {
                        cheapestWeight = estimatedWeight;
                        nearestEnd = toPt;
                    }
                //});

                this.nearestDestination = new NearestDestination(nearestEnd, new Tile(Math.floor(nearestEnd.x / Env.tileSize), Math.floor(nearestEnd.y / Env.tileSize)), this.weight);
            }
        };

        //const start             = new Array(1),
        const maxWeight           = options.maxWeight, // TODO: better place to store this
            openNodes             = {},
            neighbours            = {};

        let nearestEnd          = null,
            totalCostOfPathfind = 0,
            debugCheckedNodes   = [];

        const diagonalCost = 1.5,//Math.ceil(Math.sqrt(Env.tileSize)),
            cardinalCost   = 1;

        const getNeighbours = (tileNode) => {
            const pt = tileNode.pt;

            const cardinalDistances = [
                (pt.y % Env.tileSize) + 1, // NORTH
                (pt.x % Env.tileSize) + 1, // WEST
                (Env.tileSize - pt.y % Env.tileSize), // SOUTH
                (Env.tileSize - pt.x % Env.tileSize) // EAST
            ];

            const diagonalDistances = [
                Math.min(cardinalDistances[0], cardinalDistances[1]), // NORTHWEST
                Math.min(cardinalDistances[0], cardinalDistances[3]), // NORTHEAST
                Math.min(cardinalDistances[2], cardinalDistances[1]), // SOUTHWEST
                Math.min(cardinalDistances[2], cardinalDistances[3]), // SOUTHEAST
            ];

            // FIXME: Check previousDirection to avoid searching in the reverse direction (was going north, no need to check south neighbour)
            //          -- Actually it may not be that simple if we're jumping to particular points in the tile

            const ptNeighbours =
                [
                    // Cardinal Directions
                    { pt: { x: pt.x - cardinalDistances[1], y: pt.y },     weight: cardinalCost * cardinalDistances[1], dir: 'w' },
                    { pt: { x: pt.x + cardinalDistances[3], y: pt.y },     weight: cardinalCost * cardinalDistances[3], dir: 'e' },
                    { pt: { x: pt.x, y: pt.y - cardinalDistances[0] },     weight: cardinalCost * cardinalDistances[0], dir: 'n' },
                    { pt: { x: pt.x, y: pt.y + cardinalDistances[2] },     weight: cardinalCost * cardinalDistances[2], dir: 's' },

                    // Diagonal Directions
                    // Going in a diagonal direction to the nearest edge; so pick the min cardinal direction and use
                    // that as our travel distance
                    { pt: { x: pt.x - diagonalDistances[0], y: pt.y - diagonalDistances[0] },     weight: diagonalCost * diagonalDistances[0], dir: 'nw' },
                    { pt: { x: pt.x + diagonalDistances[1], y: pt.y - diagonalDistances[1] },     weight: diagonalCost * diagonalDistances[1], dir: 'ne' },
                    { pt: { x: pt.x - diagonalDistances[2], y: pt.y + diagonalDistances[2] },     weight: diagonalCost * diagonalDistances[2], dir: 'sw' },
                    { pt: { x: pt.x + diagonalDistances[3], y: pt.y + diagonalDistances[3] },     weight: diagonalCost * diagonalDistances[3], dir: 'se' },

                ].map((o) => {
                    o.tile = new Tile(Math.floor(o.pt.x / Env.tileSize), Math.floor(o.pt.y / Env.tileSize));
                    return o;
                }).filter((o) => {
                    return isTileInRange(o.tile) && o.weight <= maxWeight;
                }).map((o) => {
                    // FIXME: Is turnWeight causing us to turn backwards unexpected??
                    //const turnWeight = 0;// (tileNode.previousDirection && tileNode.previousDirection !== o.dir ? 0.5 : 0.0);
                    const turnWeight = (tileNode.previousDirection && tileNode.previousDirection !== o.dir ? 0.5 : 0.0);

                    // If opposing direction from prevDirection then set the tileNode to prevNode
                    const opposingDirectionWeight = {
                        n: 1, s: -1,
                        w: 2, e: -2,
                        nw: 3, se: -3,
                        ne: 4, sw: -4
                    };

                    let prevNode = tileNode;
                    if (opposingDirectionWeight[o.dir] + opposingDirectionWeight[tileNode.previousDirection] === 0) {
                        prevNode = tileNode.previousPt;
                        o.dir = tileNode.previousDirection;
                    }

                    const node = new TileNode(o.pt, o.dir, prevNode.weight + o.weight + turnWeight, prevNode);
                    node.from = prevNode === tileNode ? 'neighbour' : 'neighbourPrev';

                    return node;
                });


            return ptNeighbours;

        };

        const hashCoordinates = (x, y) => {
            // Because x/y can be so large we want to convert them into a smaller value. We should never need to
            // pathFind beyond our maxWeight, so therefore we could hash within the bounds of maxWeight
            const maxRelWeight = Math.max(Env.tileSize * Env.pageWidth * 3, maxWeight),
                relY = y % maxRelWeight,
                relX = x % maxRelWeight;
            return maxRelWeight * relY + relX;
        };

        const hashCoordinatesTile = (x, y) => {
            return y * areaWidth + x;
        };


        const filterTilesInRange = (centerTiles, options) => {

            const range      = Math.ceil(options.range / Env.tileSize),
                rangeWidth   = Math.ceil(options.rangeWidth / Env.tileSize),
                isAdjacent   = options.adjacent || false,
                filterFunc   = options.filterFunc,
                shootThrough = options.shootThrough;


            if (!_.isArray(centerTiles)) centerTiles = [centerTiles];
            if (range === 0 || isNaN(range)) return centerTiles;

            const tiles  = [],
                hashList = {};

            const tileHash = (tile) => tile.y * areaWidth + tile.x;

            // TODO: Could clean this up to bake the filterFunc ahead of time
            centerTiles.forEach((centerTile) => {

                //if (filterFunc) {

                //    // Custom filtering function
                //    const expandedTiles = filterFunc(centerTile, this.area);
                //    if (!_.isArray(expandedTiles)) throw Err("Filter func returned non-array type");

                //    expandedTiles.forEach((expandedTile) => {
                //        const tile = new Tile(expandedTile.x, expandedTile.y),
                //            hash   = tileHash(tile);

                //        if (hash in hashList) return; // Has this tile been added yet?
                //        hashList[hash] = true; // Hash this tile to avoid checking it again
                //        if (!isTileOpen(tile)) return; // Is this tile open? (able to walk on)
                //        tiles.push(tile);
                //    });
                //} else {

                    //if (isAdjacent) {

                    //    tiles.push(new Tile(centerTile.x, centerTile.y)); // Current tile

                    //    const x        = centerTile.x,
                    //        y          = centerTile.y,
                    //        directions = [
                    //            { xDir: 1, yDir: 0 },
                    //            { xDir: -1, yDir: 0 },
                    //            { xDir: 0, yDir: 1 },
                    //            { xDir: 0, yDir: -1 }
                    //        ];

                    //    directions.forEach(({ xDir, yDir }) => {

                    //        for (let offset = 1; offset <= range; ++offset) {
                    //            const tile = new Tile(x + xDir * offset, y + yDir * offset),
                    //                hash   = tileHash(tile);
                    //            if (hashList[hash]) continue; // Has this tile been added yet?
                    //            hashList[hash] = true; // Hash this tile to avoid checking it again
                    //            if (!isTileOpen(tile)) {
                    //                // FIXME: Abstract shootable filtering for only range based combat
                    //                if (!shootThrough || !this.area.isShootableTile(tile)) {
                    //                    break; // Is this tile open? If not then we shouldn't be able to reach anything beyond that either
                    //                } else {
                    //                    continue; // We can shoot through this tile, so allow open tiles further along the path, but don't include this tile as an acceptable to-tile
                    //                }
                    //            }
                    //            tiles.push(tile);
                    //        }
                    //    });

                    //} else {

                        // Create a box range about this center tile
                        // NORTH -> SOUTH
                        for (let y = centerTile.tile.y - range; y < centerTile.tile.y + range; ++y) {
                            for (let x = centerTile.tile.x - rangeWidth; x < centerTile.tile.x + rangeWidth; ++x) {
                                const tile = new Tile(x, y),
                                    hash   = tileHash(tile);
                                if (hashList[hash]) continue; // Has this tile been added yet?
                                hashList[hash] = true; // Hash this tile to avoid checking it again
                                if (!isTileOpen(tile)) continue; // Is this tile open? (able to walk on)
                                tiles.push(tile);
                            }
                        }

                        // WEST -> EAST
                        for (let y = centerTile.tile.y - rangeWidth; y < centerTile.tile.y + rangeWidth; ++y) {
                            for (let x = centerTile.tile.x - range; x < centerTile.tile.x + range; ++x) {
                                const tile = new Tile(x, y),
                                    hash   = tileHash(tile);
                                if (hashList[hash]) continue; // Has this tile been added yet?
                                hashList[hash] = true; // Hash this tile to avoid checking it again
                                if (!isTileOpen(tile)) continue; // Is this tile open? (able to walk on)
                                tiles.push(tile);
                            }
                        }
                    //}

                //}
            });

            return tiles;
        };


        /*
        // In range check if we have a range set
        let nodeInRange = (node) => false;
        if (options.range) {
            nodeInRange = (node) => {
                // FIXME: If node within circle range of target? Is node in an accepted tile?
                let distSq = Math.pow(toPt.x - node.pt.x, 2) + Math.pow(toPt.y - node.pt.y, 2),
                    rangeSq = options.range * options.range;

                if (distSq <= rangeSq) {
                    if (
                }

                return false;
            };
        }
        */

        /*
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
        */

        const toNode = new TileNode(toPt, null, 9999 * Env.tileSize, null, true);
        toNode.tile = new Tile(Math.floor(toPt.x / Env.tileSize), Math.floor(toPt.y / Env.tileSize));
        toNode.end = true;




        const toNodeIdx = hashCoordinates(toPt.x, toPt.y);
        neighbours[toNodeIdx] = toNode;

        const endTiles = {};
        if (options.range > 0) {
            const toTiles = filterTilesInRange(toNode, options);
            toTiles.forEach((toTile) => {
                const x = toTile.x * Env.tileSize,
                    y = toTile.y * Env.tileSize;
                const toNode = new TileNode({ x, y }, null, 9999, null, true),
                    index    = hashCoordinatesTile(toTile.x, toTile.y);

                toNode.end = true;
                endTiles[index] = toNode;
            });
        }


            const fromNode    = new TileNode(fromPt, null, 0, null),
                index         = hashCoordinates(fromPt.x, fromPt.y),
                estimatedCost = fromNode.estimateCost();

            // We can assume that fromTiles are distinct, so this MUST be a goal
            if (neighbours[index]) {
                return {
                    path: null,
                    start: fromNode,
                    end: fromNode
                };
            }

            //start[i] = fromNode;
            neighbours[index] = fromNode;

            if (!openNodes[estimatedCost]) {
                openNodes[estimatedCost] = [];
            }
        openNodes[estimatedCost].push(fromNode);

        let totalIts = 0;

        // A* Pathfinding
        while (!isObjectEmpty(openNodes)) {

            ++totalIts;
            if (totalIts > 1000) {
                // NOTE: This could occur in cases where we pick a tile that's open but its impossible to reach (eg.
                // other side of a mountain). When we get a higher level graph we can easily first-pass check those
                //DEBUGGER();
                console.log("We've iterated too much! Something went wrong");
                break;
            }

            // Pop the (approximated) cheapest available pt
            //const cheapestWeightClass = frontOfObject(openNodes),
            //    openNode              = openNodes[cheapestWeightClass].shift();

            // FIXME: frontOfObject not working so long as we have a turn weight of 0.5 (string ordering?)
            let cheapestWeightClass = frontOfObject(openNodes);
            Object.keys(openNodes).forEach((key) => {
                if (parseInt(key, 10) < cheapestWeightClass) {
                    cheapestWeightClass = key;
                }
            });
            const openNode = openNodes[cheapestWeightClass].shift();

            if (openNodes[cheapestWeightClass].length === 0) {
                delete openNodes[cheapestWeightClass];
            }
            if (openNode.expired) continue;

            // Check each open neighbour of tile
            const nodeNeighbours = getNeighbours(openNode).filter((neighbour) => {
                return (
                    hasTile(neighbour.tile) &&
                    isTileOpen(neighbour.tile) &&
                    neighbour.weight < maxWeight
                );
            });

            totalCostOfPathfind += nodeNeighbours.length;

            // Check each neighbour if they were already searched (replace if necessary), otherwise add
            for (let i = 0; i < nodeNeighbours.length; ++i) {

                const neighbourNode = nodeNeighbours[i],
                    neighbour       = neighbourNode.pt,
                    neighbourHash   = hashCoordinates(neighbour.x, neighbour.y),
                    tileHash        = hashCoordinatesTile(neighbourNode.tile.x, neighbourNode.tile.y);


                debugCheckedNodes.push({ x: neighbour.x, y: neighbour.y, cost: cheapestWeightClass });

                // FIXME: Check if neighbour point is in the same tile as the end point, if so we can manually build
                // remaining points here
                if (neighbourNode.tile.x === toNode.tile.x && neighbourNode.tile.y === toNode.tile.y) {

                    // FIXME: If we're within range then it may be enough to just use current neighbourNode

                    let xDist = toNode.pt.x - neighbourNode.pt.x,
                        yDist = toNode.pt.y - neighbourNode.pt.y,
                        prevNode = neighbourNode;

                    //console.log(`Reached end tile, recalibrate from (${neighbourNode.pt.x}, ${neighbourNode.pt.y}) to (${toNode.pt.x}, ${toNode.pt.y})   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
                    const opposingDirectionWeight = {
                        n: 1, s: -1,
                        w: 2, e: -2,
                        nw: 3, se: -3,
                        ne: 4, sw: -4
                    };


                    // FIXME: Recalibrate: opposing direction? Set prevNode to prevNode.prevNode and flip dir?
                    const recalibrateX = () => {
                        while (xDist !== 0) {
                            let dist     = (xDist > 0 ? 1 : -1),
                                dir      = (xDist > 0 ? 'e' : 'w');

                            if (opposingDirectionWeight[dir] + opposingDirectionWeight[prevNode.previousDirection] === 0) {
                                prevNode.pt.x -= dist;
                                prevNode.from = 'recabX2A';
                            } else {
                                let nextNode = new TileNode({ x: prevNode.pt.x + dist, y: prevNode.pt.y }, dir, null, prevNode);
                                nextNode.from = 'recabX2';
                                prevNode = nextNode;
                            }

                            xDist -= dist;
                        }
                    };

                    const recalibrateY = () => {
                        while (yDist !== 0) {
                            let dist     = (yDist > 0 ? 1 : -1),
                                dir      = (yDist > 0 ? 's' : 'n');

                            if (opposingDirectionWeight[dir] + opposingDirectionWeight[prevNode.previousDirection] === 0) {
                                prevNode.pt.y -= dist;
                                prevNode.from = 'recabY2A';
                            } else {
                                let nextNode = new TileNode({ x: prevNode.pt.x, y: prevNode.pt.y + dist }, dir, null, prevNode);
                                nextNode.from = 'recabY2';
                                prevNode = nextNode;
                            }

                            yDist -= dist;
                        }
                    };

                    if (prevNode.direction === 'w' || prevNode.direction === 'e') {
                        recalibrateX();
                        recalibrateY();
                    } else {
                        recalibrateY();
                        recalibrateX();
                    }

                    nearestEnd                   = prevNode;


                    nearestEnd.finAt = 1;
                    if (nearestEnd.previousPt) {

                        const _pt = { x: nearestEnd.previousPt.pt.x, y: nearestEnd.previousPt.pt.y },
                            _dir = nearestEnd.previousDirection,
                            _dX = nearestEnd.pt.x - _pt.x,
                            _dY = nearestEnd.pt.y - _pt.y;

                        if (_dY === 0) {
                            if (_dX > 0 && _dir === 'w') DEBUGGER();
                            else if (_dX < 0 && _dir === 'e') DEBUGGER();
                        } else if (_dX === 0) {
                            if (_dY > 0 && _dir === 'n') DEBUGGER();
                            else if (_dY < 0 && _dir === 's') DEBUGGER();
                        }
                    }



                    //nearestEnd.previousDirection = prevNode.previousDirection;
                    //nearestEnd.weight            = prevNode.weight;
                    //nearestEnd.previousPt        = prevNode.previousPt;
                    break;
                } else if (endTiles[tileHash]) {
                    // FIXME: Reach an accepted end tile within range of target


                    // FIXME: Bug that will require smoothing/refining path
                    //
                    //
                    //          # 
                    //        #...# 
                    //      #.......#
                    //      #...X...#
                    //      #.......# 
                    //        #C..#
                    //        / #
                    //       /
                    //      B<-------A
                    //
                    //
                    //  X is target position
                    //  # is edge of radius about target
                    //  C is closest point from neighbourNode to target on radius
                    //  
                    //  We start from A -> go to B which is an endTile node but the point is outside of the range
                    //  radius. Finding the closest point on the radius results in us going backwards (west -> east)



                    // Potential backtracking issue
                    //
                    //                 A
                    //      |   |     /
                    //    --+---+--  /
                    //      |   |   / 
                    // :    | XC<--B : 
                    // :    |   |    :
                    // :  --+---+--  :
                    // :~~~~~~~~~~~~~:
                    //   range width
                    //
                    // X is target point
                    // C is the point we ended up at
                    // ~ is the acceptable range width
                    // - is the tile boundary
                    //
                    // We start from A -> go to B -> go to C, then realize that we're already within the target range.
                    // We can backtrack to minimize unnecessary movement, but if we go too far east we'll go passed B
                    // and end up going sw -> e
                    //
                    // Essentially while backtracking we CANNOT go passed the previous point



                    // Backtrack or forwardtrack to edge of accepted range within block

                    // Vertical adjacency from target?
                    // Within rangeWidth for east/west and range for north/south
                    let distX = toPt.x - neighbourNode.pt.x,
                        distY = toPt.y - neighbourNode.pt.y;
                    let recabX = 0;
                    let recabY = 0;
                    if (Math.abs(distX) > Math.abs(distY)) {
                        // West-East

                        // Are we outside of rangeWidth?
                        if (Math.abs(distY) > options.rangeWidth) {
                            // Need to forward track into range
                            recabY = Math.abs(distY) - options.rangeWidth;
                            if (distY < 0) recabY *= -1;
                        } else {
                            /*
                            if
                            (
                                Math.abs(distY) < options.rangeWidth &&
                                (neighbourNode.previousDirection === 'n' || neighbourNode.previousDirection === 's') // FIXME: Only taking cardinal directions into consideration
                            )
                            {
                                //DEBUGGER();

                                // FIXME: Within range but we want to backtrack
                                // Need to create a new point on the edge of adjacency and replace neighbourNode w/ that
                                // one
                                let backtrack = options.rangeWidth - Math.abs(distY);
                                // NOTE: Have to use previousDirection in case dist === 0 (wouldn't be able to tell
                                // which direction we need to backtrack)
                                if (neighbourNode.previousDirection === 'n') backtrack *= -1;

                                neighbourNode.pt.y -= backtrack; // FIXME: Do we need to edit more than this? Or do we need to create a new node?


                                if
                                (
                                    (neighbourNode.previousDirection === 'n' && neighbourNode.pt.y > neighbourNode.previousPt.pt.y) ||
                                    (neighbourNode.previousDirection === 's' && neighbourNode.pt.y < neighbourNode.previousPt.pt.y)
                                )
                                {
                                    // we've gone too far
                                    neighbourNode.pt.x = neighbourNode.previousPt.pt.x;
                                }

                                neighbourNode.tile.y = Math.floor(neighbourNode.pt.y / Env.tileSize);
                                neighbourNode.backtrack = backtrack;
                            }
                            */
                        }

                        if (Math.abs(distX) > options.range) {
                            recabX = Math.abs(distX) - options.range;
                            if (distX < 0) recabX *= -1;
                        } else {
                            // FIXME: Shouldn't need to backtrack for this, maybe assert to confirm
                        }
                    } else {
                        // North-South

                        // Are we outside of rangeWidth?
                        if (Math.abs(distX) > options.rangeWidth) {
                            // Need to forward track into range
                            recabX = Math.abs(distX) - options.rangeWidth;
                            if (distX < 0) recabX *= -1;

                        } else {
                            /*
                            if
                            (
                                Math.abs(distX) < options.rangeWidth &&
                                (neighbourNode.previousDirection === 'w' || neighbourNode.previousDirection === 'e') // FIXME: Only taking cardinal directions into consideration
                            )
                            {
                                //DEBUGGER();

                                // FIXME: Within range but we want to backtrack
                                // Need to create a new point on the edge of adjacency and replace neighbourNode w/ that
                                // one
                                let backtrack = options.rangeWidth - Math.abs(distX);
                                if (neighbourNode.previousDirection === 'w') backtrack *= -1;

                                neighbourNode.pt.x -= backtrack;

                                if
                                (
                                    (neighbourNode.previousDirection === 'w' && neighbourNode.pt.x > neighbourNode.previousPt.pt.x) ||
                                    (neighbourNode.previousDirection === 'e' && neighbourNode.pt.x < neighbourNode.previousPt.pt.x)
                                )
                                {
                                    // we've gone too far
                                    neighbourNode.pt.x = neighbourNode.previousPt.pt.x;
                                }


                                neighbourNode.tile.x = Math.floor(neighbourNode.pt.x / Env.tileSize);
                                neighbourNode.backtrack = backtrack;
                            }
                            */
                        }

                        if (Math.abs(distY) > options.range) {
                            recabY = Math.abs(distY) - options.range;
                            if (distY < 0) recabY *= -1;
                        } else {
                            // FIXME: Shouldn't need to backtrack for this, maybe assert to confirm
                        }
                    }

                    const _origRecabX = recabX,
                        _origRecabY = recabY;

                    const recalibrateX = () => {
                        let dist     = (recabX > 0 ? 1 : -1),
                            dir      = (recabX > 0 ? 'e' : 'w');

                        // Can we simply backtrack in our previous jump?
                        if
                        (
                            (prevNode.previousDirection === 'e' && dir === 'w') ||
                            (prevNode.previousDirection === 'w' && dir === 'e')
                        )
                        {
                            let maxDist = 0;
                            if (prevNode.previousPt) {
                                maxDist = Math.abs(prevNode.pt.x - prevNode.previousPt.pt.x);
                            }

                            prevNode.pt.x += Math.min(Math.abs(dist), Math.abs(maxDist)) * (dist > 0 ? 1 : -1);
                        }
                        else
                        {
                            // We a non-opposing direction; need to recab ontop
                            while (recabX !== 0) {

                                let nextNode = new TileNode({ x: prevNode.pt.x + dist, y: prevNode.pt.y }, dir, null, prevNode);
                                prevNode = nextNode;
                                recabX -= dist;
                                prevNode.from = 'recalibrateX';
                            }
                        }
                    };

                    const recalibrateY = () => {
                        let dist     = (recabY > 0 ? 1 : -1),
                            dir      = (recabY > 0 ? 's' : 'n');


                        // Can we simply backtrack in our previous jump?
                        if
                        (
                            (prevNode.previousDirection === 's' && dir === 'n') ||
                            (prevNode.previousDirection === 'n' && dir === 's')
                        )
                        {
                            let maxDist = 0;
                            if (prevNode.previousPt) {
                                maxDist = Math.abs(prevNode.pt.y - prevNode.previousPt.pt.y);
                            }

                            prevNode.pt.y += Math.min(Math.abs(dist), Math.abs(maxDist)) * (dist > 0 ? 1 : -1);
                        }
                        else
                        {
                            // We a non-opposing direction; need to recab ontop
                            while (recabY !== 0) {

                                let nextNode = new TileNode({ x: prevNode.pt.x, y: prevNode.pt.y + dist }, dir, null, prevNode);
                                prevNode = nextNode;
                                recabY -= dist;
                                prevNode.from = 'recalibrateY';
                            }
                        }
                    };

                    let prevNode = neighbourNode;
                    //prevNode.aboutToRecalib = true;
                    if (prevNode.previousDirection === 'w' || prevNode.previousDirection === 'e') {
                        recalibrateX();
                        recalibrateY();
                    } else {
                        recalibrateY();
                        recalibrateX();
                    }

                    nearestEnd = prevNode;



                    nearestEnd.finAt = 2;
                    if (nearestEnd.previousPt) {

                        const _pt = { x: nearestEnd.previousPt.pt.x, y: nearestEnd.previousPt.pt.y },
                            _dir = nearestEnd.previousDirection,
                            _dX = nearestEnd.pt.x - _pt.x,
                            _dY = nearestEnd.pt.y - _pt.y;

                        if (_dY === 0) {
                            if (_dX > 0 && _dir === 'w') DEBUGGER();
                            else if (_dX < 0 && _dir === 'e') DEBUGGER();
                        } else if (_dX === 0) {
                            if (_dY > 0 && _dir === 'n') DEBUGGER();
                            else if (_dY < 0 && _dir === 's') DEBUGGER();
                        }
                    }


                    break;
                } else if (neighbours[neighbourHash]) {

                    // Path to neighbour already exists; use whichever one is cheaper
                    const existingNeighbour = neighbours[neighbourHash];

                    if (existingNeighbour.pt.x !== neighbourNode.pt.x || existingNeighbour.pt.y !== neighbourNode.pt.y) {
                        throw `Hash collision! ${existingNeighbour.pt.x} !== ${neighbourNode.pt.x} && ${existingNeighbour.pt.y} !== ${neighbourNode.pt.y}; hash: ${neighbourHash}`;
                    }

                    if (existingNeighbour.end) {

                        // Found path to end
                        //console.log(`Reached end point (${neighbourNode.pt.x}, ${neighbourNode.pt.y})`);
                        nearestEnd                   = existingNeighbour;
                        nearestEnd.previousDirection = neighbourNode.previousDirection;
                        nearestEnd.weight            = neighbourNode.weight;
                        nearestEnd.previousPt        = neighbourNode.previousPt;

                        if (nearestEnd.previousPt) {
                            nearestEnd.finAt = 3;
                            const _pt = { x: nearestEnd.previousPt.x, y: nearestEnd.previousPt.y },
                                _dir = nearestEnd.previousDirection;

                            let _dist = nearestEnd.weight;
                            if (nearestEnd.previousDirection.length === 2) {
                                _dist /= diagonalCost;
                            } else {
                                _dist /= cardinalCost;
                            }

                            if (_dir === 'n' || _dir === 'nw' || _dir === 'ne') {
                                _pt.y -= _dist;
                            } else if (_dir === 's' || _dir === 'sw' || _dir === 'se') {
                                _pt.y += _dist;
                            }

                            if (_dir === 'w' || _dir === 'nw' || _dir === 'sw') {
                                _pt.x -= _dist;
                            } else if (_dir === 'e' || _dir === 'ne' || _dir === 'se') {
                                _pt.x += _dist;
                            }

                            if (_pt.x !== nearestEnd.pt.x || _pt.y !== nearestEnd.pt.y) DEBUGGER();
                        }
                        break;
                    } else if (existingNeighbour.weight <= neighbourNode.weight) {

                        // This neighbour is a cheaper path, ignore our current path..
                        //console.log(`Found neighbour, but existing path is cheaper (or equal) (${neighbourNode.pt.x}, ${neighbourNode.pt.y}); weight ${existingNeighbour.weight} <= ${neighbourNode.weight}   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
                        continue;
                    } else {

                        // This existing neighbour has a faster path than ours
                        existingNeighbour.expired = true;
                        neighbours[neighbourHash] = neighbourNode;

                        const estimatedCost = neighbourNode.estimateCost();
                        if (!openNodes[estimatedCost]) {
                            openNodes[estimatedCost] = [];
                        }
                        openNodes[estimatedCost].push(neighbourNode);

                        //console.log(`Found neighbour, new path is cheaper (${neighbourNode.pt.x}, ${neighbourNode.pt.y}); weight ${existingNeighbour.weight} > ${neighbourNode.weight}   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
                    }
                } else {

                    // Add neighbour
                    neighbours[neighbourHash] = neighbourNode;

                    const estimatedCost = neighbourNode.estimateCost();
                    if (!openNodes[estimatedCost]) {
                        openNodes[estimatedCost] = [];
                    }
                    openNodes[estimatedCost].push(neighbourNode);
                    //console.log(`Added new point (${neighbourNode.pt.x}, ${neighbourNode.pt.y}); weight ${neighbourNode.weight}   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);
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
            //console.log(`Path found is ${nearestEnd.weight} steps (${totalCostOfPathfind} iterations)`);

            // continue stepping backwards and walk.steps++ until direction changes, then create a new walk
            const path = new Path();

            let nextPt    = nearestEnd.previousPt,
                direction = nearestEnd.previousDirection,
                startPt   = null,
                dir       = null;

            let distX = Math.abs(nearestEnd.pt.x - nextPt.pt.x),
                distY = Math.abs(nearestEnd.pt.y - nextPt.pt.y),
                dist  = Math.max(distX, distY);
            if(!(distX === 0 || distY === 0 || distX === distY)) {
                DEBUGGER();
                throw "This shouldn't happen!";
            }

            if (direction === 'n') dir = NORTH;
            else if (direction === 's') dir = SOUTH;
            else if (direction === 'e') dir = EAST;
            else if (direction === 'w') dir = WEST;
            else if (direction === 'nw') dir = NORTHWEST;
            else if (direction === 'ne') dir = NORTHEAST;
            else if (direction === 'sw') dir = SOUTHWEST;
            else if (direction === 'se') dir = SOUTHEAST;

            let walk = new Walk(dir, dist, null);
            path.walks.unshift(walk);
            walk.destination = nearestEnd;

            while (true) {
                if (nextPt.previousDirection === null) {
                    startPt = nextPt;
                    break; // Finished path (one of the start nodes)
                }

                // Since we can jump between points (to edges of tiles) need to determine dist
                distX = Math.abs(nextPt.pt.x - nextPt.previousPt.pt.x);
                distY = Math.abs(nextPt.pt.y - nextPt.previousPt.pt.y);
                dist = Math.max(distX, distY);
                if(!(distX === 0 || distY === 0 || distX === distY)) {
                    DEBUGGER();
                    throw "This shouldn't happen!";
                }

                if (nextPt.previousDirection !== direction) {


                    // Are we walking backwards? Error in pathfinding
                    if
                    (
                        (direction === 'n' && nextPt.previousDirection === 's') ||
                        (direction === 's' && nextPt.previousDirection === 'n') ||
                        (direction === 'w' && nextPt.previousDirection === 'e') ||
                        (direction === 'e' && nextPt.previousDirection === 'w') ||
                        (direction === 'nw' && nextPt.previousDirection === 'se') ||
                        (direction === 'ne' && nextPt.previousDirection === 'sw') ||
                        (direction === 'sw' && nextPt.previousDirection === 'ne') ||
                        (direction === 'se' && nextPt.previousDirection === 'nw')

                        // Unfortunately can't check this until we rework backtrack/recalibration at end of walk
                        //(direction === 'nw' && nextPt.previousDirection === 'e') ||
                        //(direction === 'nw' && nextPt.previousDirection === 's') ||
                        //(direction === 'ne' && nextPt.previousDirection === 'w') ||
                        //(direction === 'ne' && nextPt.previousDirection === 's') ||

                        //(direction === 'sw' && nextPt.previousDirection === 'e') ||
                        //(direction === 'sw' && nextPt.previousDirection === 'n') ||
                        //(direction === 'se' && nextPt.previousDirection === 'w') ||
                        //(direction === 'se' && nextPt.previousDirection === 'n')
                    )
                    {
                        if (nextPt.aboutToRecalib) {
                            // FIXME: Need to smooth/refine path to avoid backtracking. See recalibration for why this
                            // happens
                        } else {
                            DEBUGGER();
                            throw "Bad direction change: moving backwards";
                        }
                    }

                    direction = nextPt.previousDirection;

                    dir   = null;
                    if (direction === 'n') dir = NORTH;
                    else if (direction === 's') dir = SOUTH;
                    else if (direction === 'e') dir = EAST;
                    else if (direction === 'w') dir = WEST;
                    else if (direction === 'nw') dir = NORTHWEST;
                    else if (direction === 'ne') dir = NORTHEAST;
                    else if (direction === 'sw') dir = SOUTHWEST;
                    else if (direction === 'se') dir = SOUTHEAST;
                    else throw `UNEXPECTED DIR ${direction}`;



                    walk = new Walk(dir, dist, null);
                    path.walks.unshift(walk);
                    path.walks[0].destination = nextPt.pt;
                } else {

                    path.walks[0].distance += dist;
                }

                nextPt = nextPt.previousPt;
            }

            // FIXME: Because we start counting destination from 2nd last pt, need to add destination at the end
            // (or if we trust it, simply the destination)
            // FIXME: If we have a walk of 1, we need to set the destination here
            if (path.walks.length > 1) {
                let prevDest = path.walks[path.walks.length - 2].destination;

                const finalWalk = path.walks[path.walks.length - 1],
                    finalDest   = { x: prevDest.x, y: prevDest.y },
                    finalDist   = finalWalk.distance,
                    finalDir    = finalWalk.direction;

                finalWalk.destination = finalDest;

                if (finalDir === NORTH || finalDir === NORTHWEST || finalDir === NORTHEAST) {
                    finalDest.y -= finalDist;
                } else if (finalDir === SOUTH || finalDir === SOUTHWEST || finalDir === SOUTHEAST) {
                    finalDest.y += finalDist;
                }

                if (finalDir === WEST || finalDir === NORTHWEST || finalDir === SOUTHWEST) {
                    finalDest.x -= finalDist;
                } else if (finalDir === EAST || finalDir === NORTHEAST || finalDir === SOUTHEAST) {
                    finalDest.x += finalDist;
                }

                if (finalDest.x !== nearestEnd.pt.x || finalDest.y !== nearestEnd.pt.y) {
                    DEBUGGER(); // Wrong destination
                }
            }

            {
                path.walks[0].destination = { x: startPt.pt.x, y: startPt.pt.y };
                const startDir = path.walks[0].direction,
                    startDist  = path.walks[0].distance,
                    startDest  = path.walks[0].destination;

                if (startDir === NORTH || startDir === NORTHWEST || startDir === NORTHEAST) {
                    startDest.y -= startDist;
                } else if (startDir === SOUTH || startDir === SOUTHWEST || startDir === SOUTHEAST) {
                    startDest.y += startDist;
                }

                if (startDir === WEST || startDir === NORTHWEST || startDir === SOUTHWEST) {
                    startDest.x -= startDist;
                } else if (startDir === EAST || startDir === NORTHEAST || startDir === SOUTHEAST) {
                    startDest.x += startDist;
                }
            }



            // FIXME: Work backwards to connect tiles; in path
            // FIXME: Work forwards to build actual path (point distance; smoothening for diagonals)

            //path.walks[0].destination = startPt.pt;
            path.start                = startPt.pt;

            // FIXME: Recalibrate to/from endpoints (MUST be in same tile)


            return {
                debugCheckedNodes,
                path,
                options,
                start: startPt,
                end: nearestEnd
            };
        } else {

            // No path found..
            return false;
        }





    };

    return {
        findPath
    };

});
