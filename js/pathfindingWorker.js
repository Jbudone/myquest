define(() => {

// TODO
//  - Run as a system w/ priority list?? May not be necessary depending on how many paths are coming in at once, we'll
//  need to check (automated testing sending tons of paths, simulating spam clicking and chasing from lots of AI)
// - Structure with path refinement options

    const Env = {
        pageHeight: 14,
        pageWidth: 30,
        tileSize: 16
    };


    const pages = {};
    let areaWidth, areaHeight, pagesPerRow;

    let keysCreated = false;
    const setupKeys = (keys) => {

        Object.keys(keys).forEach((key) => {
            global[key] = keys[key];
        });
        keysCreated = true;
    };

    const handleMessage = (data) => {


        let messageType = data.type;
        if (!messageType) {
            worker.postMessage({
                result: RESULT_ERROR,
                error: "Unknown messageType"
            });

            return;
        }


        if (messageType === SETUP_AREA) {

            const area = data.area;
            areaWidth = area.width;
            areaHeight = area.height;
            pagesPerRow = area.pagesPerRow;
        } else if (messageType === ADD_PAGE) {

            const pageI = data.page.i;
            pages[pageI] = data.page;
        } else if (messageType === REMOVE_PAGE) {

            const pageI = data.pageI;
            delete pages[pageI];
        } else if (messageType === HANDLE_PATH) {

            const path = data.path;

            const success = handlePath(path);
            if (success) {

                let retPath;
                if (path.ALREADY_THERE) {
                    retPath = {
                        start: path.startPt,
                        end: path.startPt,
                        debugCheckedNodes: [],
                        ALREADY_THERE: true
                    };
                } else {
                    retPath = {

                        walks: path.ptPath.walks,
                        start: path.startPt,
                        end: path.ptPath.walks[path.ptPath.walks.length - 1].destination,
                        debugCheckedNodes: path.debugCheckedNodes
                    };
                }

                worker.postMessage({
                    result: RESULT_PATH,
                    success: true,

                    pathID: path.pathID,
                    movableID: path.movableID,
                    path: retPath,
                    time: path.time,

                    __cbId: data.__cbId
                });
            } else {
                worker.postMessage({
                    result: RESULT_PATH,
                    success: false,
                    movableID: path.movableID,
                    pathID: path.pathID,
                    __cbId: data.__cbId
                });
            }
        }
    };

    const handlePath = (path) => {

        // FIXME: Check path state, use the corresponding operations/options to refine as desired
        // states:
        //  - from/to (tiles)   need to fill path (tiled)
        //  - from/to (points)  need to fill path (points)
        //  - from/to (points) and tiled path as hint,  need to refine path to points

        let time = Date.now(),
            now  = time;

        const foundPath = findPath(path.startPt, path.endPt);
        time -= now;


        if (foundPath) {
            path.time = time;
            path.debugCheckedNodes = foundPath.debugCheckedNodes;
            if (!foundPath.path) {
                path.ALREADY_THERE = true;
            } else {
                path.ALREADY_THERE = false;
                path.ptPath = {
                    start: foundPath.path.start,
                    walks: foundPath.path.walks
                };
            }
        } else {
            return false;
        }

        return true;
    };

    const findPath = (fromPt, toPt, options) => {
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
            maxWeight: 100 * Env.tileSize
        });



        


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
        const maxWeight           = options.maxWeight || (100 * Env.tileSize), // TODO: better place to store this
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

            // FIXME: Check previousDirection to avoid searching in the reverse direction (was going north, no need to check south neighbour)
            // NOTE: Without this we're also running into an issue of moving forwards/backwards between walks (eg. north then south)
                 if (tileNode.previousDirection === 'n') cardinalDistances[2] = maxWeight;
            else if (tileNode.previousDirection === 'w') cardinalDistances[3] = maxWeight;
            else if (tileNode.previousDirection === 's') cardinalDistances[0] = maxWeight;
            else if (tileNode.previousDirection === 'e') cardinalDistances[1] = maxWeight;


            const ptNeighbours =
                [

                    // Diagonals
                    //{ pt: { x: pt.x - 1, y: pt.y - 1 }, weight: diagonalCost, dir: 'nw' },
                    //{ pt: { x: pt.x + 1, y: pt.y - 1 }, weight: diagonalCost, dir: 'ne' },
                    //{ pt: { x: pt.x - 1, y: pt.y + 1 }, weight: diagonalCost, dir: 'sw' },
                    //{ pt: { x: pt.x + 1, y: pt.y + 1 }, weight: diagonalCost, dir: 'se' },

                    // Cardinals
                    //{ pt: { x: pt.x - 1, y: pt.y },     weight: cardinalCost, dir: 'w' },
                    //{ pt: { x: pt.x + 1, y: pt.y },     weight: cardinalCost, dir: 'e' },
                    //{ pt: { x: pt.x, y: pt.y - 1 },     weight: cardinalCost, dir: 'n' },
                    //{ pt: { x: pt.x, y: pt.y + 1 },     weight: cardinalCost, dir: 's' },


                    { pt: { x: pt.x - cardinalDistances[1], y: pt.y },     weight: cardinalCost * cardinalDistances[1], dir: 'w' },
                    { pt: { x: pt.x + cardinalDistances[3], y: pt.y },     weight: cardinalCost * cardinalDistances[3], dir: 'e' },
                    { pt: { x: pt.x, y: pt.y - cardinalDistances[0] },     weight: cardinalCost * cardinalDistances[0], dir: 'n' },
                    { pt: { x: pt.x, y: pt.y + cardinalDistances[2] },     weight: cardinalCost * cardinalDistances[2], dir: 's' },
                ].map((o) => {
                    o.tile = new Tile(Math.floor(o.pt.x / Env.tileSize), Math.floor(o.pt.y / Env.tileSize));
                    return o;
                }).filter((o) => {
                    return isTileInRange(o.tile) && o.weight <= maxWeight;
                }).map((o) => {
                        // FIXME: Is turnWeight causing us to turn backwards unexpected??
                        //const turnWeight = 0;// (tileNode.previousDirection && tileNode.previousDirection !== o.dir ? 0.5 : 0.0);
                        const turnWeight = (tileNode.previousDirection && tileNode.previousDirection !== o.dir ? 0.5 : 0.0);
                        return new TileNode(o.pt, o.dir, tileNode.weight + o.weight + turnWeight, tileNode);
                    });


            totalCostOfPathfind += ptNeighbours.length;
            return ptNeighbours;

        };

        //const hashCoordinates = (x, y) => (maxWeight + Env.pageWidth) * y + x;
        // FIXME: Hash coords are no good because y/x are so large; need to make y/x smaller (relative y/x) or hash tile and
        // then multiple by Z and hash inner part of tile
        const hashCoordinates = (x, y) => {
            return (maxWeight * maxWeight + Env.pageWidth * Env.pageWidth * Env.tileSize) * y + x;
        };

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

        // A* Pathfinding
        while (!isObjectEmpty(openNodes)) {

            // Pop the (approximated) cheapest available pt
            const cheapestWeightClass = frontOfObject(openNodes),
                openNode              = openNodes[cheapestWeightClass].shift();

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

            // Check each neighbour if they were already searched (replace if necessary), otherwise add
            for (let i = 0; i < nodeNeighbours.length; ++i) {

                const neighbourNode = nodeNeighbours[i],
                    neighbour       = neighbourNode.pt,
                    neighbourHash   = hashCoordinates(neighbour.x, neighbour.y);


                debugCheckedNodes.push({ x: neighbour.x, y: neighbour.y, cost: cheapestWeightClass });

                // FIXME: Check if neighbour point is in the same tile as the end point, if so we can manually build
                // remaining points here
                if (neighbourNode.tile.x === toNode.tile.x && neighbourNode.tile.y === toNode.tile.y) {

                    let xDist = toNode.pt.x - neighbourNode.pt.x,
                        yDist = toNode.pt.y - neighbourNode.pt.y,
                        prevNode = neighbourNode;

                    //console.log(`Reached end tile, recalibrate from (${neighbourNode.pt.x}, ${neighbourNode.pt.y}) to (${toNode.pt.x}, ${toNode.pt.y})   (previousPt: ${neighbourNode.previousPt.pt.x}, ${neighbourNode.previousPt.pt.y})`);

                    const recalibrateX = () => {
                        while (xDist !== 0) {
                            let dist     = (xDist > 0 ? 1 : -1),
                                dir      = (xDist > 0 ? 'e' : 'w');

                            let nextNode = new TileNode({ x: prevNode.pt.x + dist, y: prevNode.pt.y }, dir, null, prevNode);
                            prevNode = nextNode;
                            xDist -= dist;
                        }
                    };

                    const recalibrateY = () => {
                        while (yDist !== 0) {
                            let dist     = (yDist > 0 ? 1 : -1),
                                dir      = (yDist > 0 ? 's' : 'n');

                            let nextNode = new TileNode({ x: prevNode.pt.x, y: prevNode.pt.y + dist }, dir, null, prevNode);
                            prevNode = nextNode;
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
                    //nearestEnd.previousDirection = prevNode.previousDirection;
                    //nearestEnd.weight            = prevNode.weight;
                    //nearestEnd.previousPt        = prevNode.previousPt;
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
            console.log(`Path found is ${nearestEnd.weight} steps (${totalCostOfPathfind} iterations)`);

            // continue stepping backwards and walk.steps++ until direction changes, then create a new walk
            const path = new Path();

            let nextPt    = nearestEnd.previousPt,
                direction = nearestEnd.previousDirection,
                startPt   = null,
                dir       = null;

            let distX = Math.abs(nearestEnd.pt.x - nextPt.pt.x),
                distY = Math.abs(nearestEnd.pt.y - nextPt.pt.y),
                dist  = Math.max(distX, distY);
            if (distX !== 0 && distY !== 0) {
                debugger;
                throw "Previous point off alignment, no diagonal yet!";
            }

            if (direction === 'n') dir = NORTH;
            else if (direction === 's') dir = SOUTH;
            else if (direction === 'e') dir = EAST;
            else if (direction === 'w') dir = WEST;
            //else if (direction === 'nw') dir = NORTHWEST;
            //else if (direction === 'ne') dir = NORTHEAST;
            //else if (direction === 'sw') dir = SOUTHWEST;
            //else if (direction === 'se') dir = SOUTHEAST;

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
                if (distX !== 0 && distY !== 0) {
                    debugger;
                    throw "Previous point off alignment, no diagonal yet!";
                }

                if (nextPt.previousDirection !== direction) {


                    // Are we walking backwards? Error in pathfinding
                    if
                    (
                        (direction === 'n' && nextPt.previousDirection === 's') ||
                        (direction === 's' && nextPt.previousDirection === 'n') ||
                        (direction === 'w' && nextPt.previousDirection === 'e') ||
                        (direction === 'e' && nextPt.previousDirection === 'w')
                    )
                    {
                        debugger;
                        throw "Bad direction change: moving backwards";
                    }

                    direction = nextPt.previousDirection;

                    dir   = null;
                    if (direction === 'n') dir = NORTH;
                    else if (direction === 's') dir = SOUTH;
                    else if (direction === 'e') dir = EAST;
                    else if (direction === 'w') dir = WEST;
                    else throw `UNEXPECTED DIR ${direction}`;
                    //else if (direction === 'nw') dir = NORTHWEST;
                    //else if (direction === 'ne') dir = NORTHEAST;
                    //else if (direction === 'sw') dir = SOUTHWEST;
                    //else if (direction === 'se') dir = SOUTHEAST;



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

                if (finalDir === NORTH) {
                    finalDest.y -= finalDist;
                } else if (finalDir === SOUTH) {
                    finalDest.y += finalDist;
                }

                if (finalDir === WEST) {
                    finalDest.x -= finalDist;
                } else if (finalDir === EAST) {
                    finalDest.x += finalDist;
                }

                /*
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

                */

                //if (finalDest.x !== nearestEnd.pt.x || finalDest.y !== nearestEnd.pt.y) {
                //    DEBUGGER(); // Wrong destination
                //
                //}
            }

            {
                path.walks[0].destination = { x: startPt.pt.x, y: startPt.pt.y };
                const startDir = path.walks[0].direction,
                    startDist  = path.walks[0].distance,
                    startDest  = path.walks[0].destination;


                if (startDir === NORTH) {
                    startDest.y -= startDist;
                } else if (startDir === SOUTH) {
                    startDest.y += startDist;
                }

                if (startDir === WEST) {
                    startDest.x -= startDist;
                } else if (startDir === EAST) {
                    startDest.x += startDist;
                }

                /*
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
                */
            }



            // FIXME: Work backwards to connect tiles; in path
            // FIXME: Work forwards to build actual path (point distance; smoothening for diagonals)

            //path.walks[0].destination = startPt.pt;
            path.start                = startPt.pt;

            // FIXME: Recalibrate to/from endpoints (MUST be in same tile)


            return {
                debugCheckedNodes,
                path,
                start: startPt,
                end: nearestEnd
            };
        } else {

            // No path found..
            return false;
        }





    };


    const PathfindingWorker = function(webworker) {

        webworker.onMessage = function(e) {

            let data = e.data;
            if (!keysCreated) {
                setupKeys(data.keys);
            } else {
                handleMessage(data);
            }
        };
    };

    return PathfindingWorker;
});
