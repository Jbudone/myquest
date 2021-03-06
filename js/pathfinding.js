
// Pathfinding
define(['movable', 'loggable', 'pathfinding.base'], (Movable, Loggable, PathfindingBase) => {

    const Pathfinding = function(area) {

        this.area = area;

        extendClass(this).with(Loggable);
        this.setLogGroup('Pathfinding');
        this.setLogPrefix('Pathfinding');

        // If we're using a library to handle our pathfinding then set that up here
        if (Env.isServer && Env.game.usePathPlanner) {

            // Setup area grid for l1-pathfinder
            this.planner = null;

            /*
            const Pathfinder = require('l1-path-finder'),
                ndarray      = require('ndarray');

            this.setupGrid = () => {
                // NOTE: Disabling l1-path-finder for now since it doesn't seem to work in some cases..

                var grid  = [],
                    page  = null,
                    pageY = null,
                    pageX = null,
                    areaWidth = area.pagesPerRow * Env.pageWidth;

                for (var pageI in area.pages) {
                    page = area.pages[pageI];
                    pageY = page.y;
                    pageX = page.x;

                    for (var y = pageY, yOff=0; y < pageY + Env.pageHeight; ++y, ++yOff) {
                        for (var x = pageX, xOff=0; x < pageX + Env.pageWidth; ++x, ++xOff) {
                            var isCollidable = (page.collidables[yOff] & (1 << xOff) ? true : false);
                            grid[areaWidth*y + x] = isCollidable;

                            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                            // FIXME: ASSERTION TEST UNECESSARY
                            var tile = { x: x, y: y };
                            if (area.hasTile(tile) && area.isTileOpen(tile) !== (!isCollidable)) {
                                debugger; // wtf?!
                            }
                            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                        }
                    }
                }

                var gridArray = ndarray(grid, [grid.length / areaWidth, areaWidth]);
                this.planner = Pathfinder(gridArray);

                //debugger;

                // FAILED PATH
                // Under main area this path doesn't work
                var path = [],
                    test = this.planner.search(63, 68, 60, 65, path);
            }
            */
        }


        // Find a path from point A to point B
        //
        // The start/end points can be a variety of different things: movable(s), tile(s); and the pathfinder can accept
        // a variety of options such as range, adjacent endpoint, auto recalibration, etc. 
        //
        // For movables, the pathfinder will automatically find their nearest tiles and consider each as a possible
        // to/from point.
        this.findPath = (from, to, options) => {

            DEBUGGER(); // Ensure we aren't using this anymore 

            if (_.isUndefined(from) || _.isUndefined(to)) throw Err(`Either from/to was not defined`);

            if (!_.isArray(from)) from = [from];
            if (!_.isArray(to))   to   = [to];

            if (_.isUndefined(options)) options = {};
            _.defaults(options, {
                range: 0,
                adjacent: true,
                maxWeight: 100,
                excludeTile: false, // Exclude the center/from tiles?
                filterFunc: null // Optional function for manually expanding tiles about each toTile
            });


            // Fetch all possible to/from tiles
            //
            // For targets which may be movables, they could be between one or more tiles. This will find all
            // tiles that the movable is partially between.
            let fromTiles           = [],
                toTiles             = [],
                recalibrateFrom     = null,
                path                = null;

            const unexpandedFromTiles = {},
                unexpandedToTiles     = {};


            // Expand our fromTiles
            // If our fromTile is a movable and he's nearing the next tile then we can include the next tile in our
            // fromTiles list
            from.forEach((fromTile) => {
                let fromHash = null,
                    tiles    = this.findTilesOf(fromTile);

                if (fromTile instanceof Movable) {
                    // TODO: what if we're searching from multiple from positions? Would we ever need to?
                    recalibrateFrom = fromTile.position;
                    fromHash = fromTile.position.tile.y * this.area.areaWidth + fromTile.position.tile.x;
                } else {
                    fromHash = fromTile.y * this.area.areaWidth + fromTile.x;
                }

                fromTiles = _.union(fromTiles, tiles);
                unexpandedFromTiles[fromHash] = fromTile;
            });
            fromTiles = this.filterTilesInRange(fromTiles, {range:0});

            // Expand our toTiles
            to.forEach((toTile) => {
                let toHash = null,
                    tiles  = this.findTilesOf(toTile);

                if (toTile instanceof Movable) {
                    toHash = toTile.position.tile.y * this.area.areaWidth + toTile.position.tile.x;
                } else {
                    toHash = toTile.y * this.area.areaWidth + toTile.x;
                }

                toTiles = _.union(toTiles, tiles);
                unexpandedToTiles[toHash] = toTile;
            });
            toTiles = this.filterTilesInRange(toTiles, options);

            // Exclude the provided tiles in search
            // NOTE: This could be used for combat where we don't want to stand on the same tile as the person we're
            // attacking
            if (options.excludeTile) {
                const areaWidth = this.area.areaWidth;
                toTiles = toTiles.filter((toTile) => {
                    const toHash = toTile.y * areaWidth + toTile.x;

                    return !(toHash in unexpandedToTiles);
                });
            }

            if (fromTiles.length === 0 || toTiles.length === 0) {
                return false;
            }

            // Are we already in range?
            // NOTE: We can only consider the unexpanded from tiles since the expanded from tiles have an
            //          extra recalibration distance
            for (let i = 0; i < toTiles.length; ++i) {
                const toTile = toTiles[i],
                    tileHash = toTile.y * this.area.areaWidth + toTile.x;

                if (tileHash in unexpandedFromTiles) {

                    // We're already here. Do we also need to recalibrate into position?
                    if (recalibrateFrom) {

                        path = {
                            start: { tile: new Tile(recalibrateFrom.tile.x, recalibrateFrom.tile.y) },
                            end: { tile: new Tile(recalibrateFrom.tile.x, recalibrateFrom.tile.y) }
                        };

                        path.path = new Path();
                        this.recalibratePath(path, recalibrateFrom);

                        if (path.path.walks.length) {
                            return path.path;
                        }
                    }

                    return ALREADY_THERE;
                }
            }

            // Would like to try l1-path-finder but it looks like it isn't ready yet. Look at failed path
            // under Pathfinder() creation for "main" area
            if (Env.isServer && Env.game.usePathPlanner) {
                /*

                // Find the cheapest tile pair
                // TODO: Is there a better way than O(n^2) for this?
                // NOTE: The given weights don't consider the recalibration cost (which is ensured to exist in
                //          cases where the weight is 0)
                var tileWeights = {};
                for (var fromTileI in fromTiles) {
                    for (var toTileI in toTiles) {
                        var weight = Math.abs(fromTiles[fromTileI].x - toTiles[toTileI].x) + Math.abs(fromTiles[fromTileI].y - toTiles[toTileI].y);
                        if (!tileWeights[weight]) {
                            tileWeights[weight] = {
                                from: fromTiles[fromTileI],
                                to: toTiles[toTileI]
                            }
                        }
                    }
                }
                var cheapestTilesWeight = frontOfObject(tileWeights),
                    cheapestTiles = tileWeights[cheapestTilesWeight];


                // If the cheapest weight is 0 then we're nearing a tile which is in our toTiles set. Simply
                // use the recalibration as our path
                if (cheapestTilesWeight == 0) {
                    var path = {
                        path: new Path(),
                        start: {
                            tile: cheapestTiles[0]
                        }
                    };

                    this.recalibratePath(path, recalibrateFrom);
                    return path.path;
                }


                var path2 = [],
                    dist2 = this.planner.search(cheapestTiles.from.y, cheapestTiles.from.x, cheapestTiles.to.y, cheapestTiles.to.x, path2);

                // Planner could not find a path
                if (!_.isFinite(dist2)) {
                    console.log("Attempted path was not finite");

                    // Draw mini-area of failed path area
                    var borderOffset = 5,
                        startY = Math.max(0, Math.min(cheapestTiles.from.y, cheapestTiles.to.y) - borderOffset),
                        endY   = Math.min(this.area.areaHeight - 1, Math.max(cheapestTiles.from.y, cheapestTiles.to.y) + borderOffset),
                        startX = Math.max(0, Math.min(cheapestTiles.from.x, cheapestTiles.to.x) - borderOffset),
                        endX   = Math.min(this.area.areaWidth - 1, Math.max(cheapestTiles.from.x, cheapestTiles.to.x) + borderOffset);

                    console.log("Printing Area: ");
                    for (var y = startY; y < endY; ++y) {
                        var line = "";
                        for (var x = startX; x < endX; ++x) {
                            var symbol = (this.area.hasTile({x,y}) && this.area.isTileOpen({x:x,y:y})) ? "." : "#";
                            if (x == cheapestTiles.from.x && y == cheapestTiles.from.y) {
                                symbol = "X";
                            } else if (x == cheapestTiles.to.x && y == cheapestTiles.to.y) {
                                symbol = "*";
                            }

                            line += symbol;
                        }
                        console.log(line);
                    }


                    return false;
                }

                var path2Full            = new Path(),
                    curPos = [fromTiles[0].y, fromTiles[0].x],  // FIXME: Is this correct?!  What if we're using a cheap nearby tile
                    path2I = 2;
                while(true) {

                    // Vertical
                    if (path2[path2I] != curPos[0]) {
                        var dist = path2[path2I] - curPos[0],
                            dir = dist > 0 ? SOUTH : NORTH;
                        path2Full.walks.push( new Walk(dir, Math.abs(dist) * Env.tileSize, null) );
                    } else {
                        // Horizontal
                        var dist = path2[path2I+1] - curPos[1],
                            dir = dist > 0 ? EAST : WEST;
                        path2Full.walks.push( new Walk(dir, Math.abs(dist) * Env.tileSize, null) );
                    }


                    curPos[0] = path2[path2I];
                    curPos[1] = path2[path2I+1];
                    path2I += 2;

                    if (path2I == path2.length) {
                        break;
                    } else if (path2I > path2.length) {
                        console.log("Building the path resulting in an endless loop.." + path2I + " > " + path2.length);
                        debugger; // wtf is this?!
                        this.planner.search(cheapestTiles.from.x, cheapestTiles.from.y, cheapestTiles.to.x, cheapestTiles.to.y, path2);

                    }
                }

                path2Full.start = cheapestTiles.from;
                var newPath = {
                    start: { tile: cheapestTiles.from },
                    path: path2Full,
                    end: { tile: cheapestTiles.to }
                }
                path = newPath;
                */
            } else {
                path = this.area.findPath(fromTiles, toTiles, options.maxWeight);
            }

            if (path) {
                if (path.path) {

                    if (recalibrateFrom) {
                        this.recalibratePath(path, recalibrateFrom);
                    }

                    return path.path;
                } else {

                    if (recalibrateFrom) {
                        path.path = new Path();
                        this.recalibratePath(path, recalibrateFrom);

                        if (path.path.walks.length) {
                            return path.path;
                        }
                    }

                    return ALREADY_THERE;
                }
            }

            return false;
        };

        this.recalibratePath = (path, fromPosition) => {

            DEBUGGER(); // Assuming recalibratePath can be nuked

            // inject walk to beginning of path depending on where player is relative to start tile
            const startTile = path.start.tile,
                position    = {
                    y: fromPosition.global.y,
                    x: fromPosition.global.x
                },
                localX      = fromPosition.global.x % Env.pageRealWidth,
                localY      = fromPosition.global.y % Env.pageRealHeight;

            let recalibrateY = false,
                recalibrateX = false;

            path = path.path;

            if (position.y - startTile.y * Env.tileSize !== 0) recalibrateY = true;
            if (position.x - startTile.x * Env.tileSize !== 0) recalibrateX = true;

            assert(!(recalibrateX && recalibrateY), "We needed to recalibrate along both x/y to the beginning of the path tile");

            path.splitWalks();

            if (recalibrateY) {
                // Inject walk to this tile
                const distance = -1 * (position.y - startTile.y * Env.tileSize),
                    walk       = new Walk((distance < 0 ? NORTH : SOUTH), Math.abs(distance), startTile.offset(0, 0));
                this.Log(`Recalibrating Walk (Y): steps ${distance} from ${localY} to ${startTile.y * Env.tileSize}`, LOG_DEBUG);
                path.walks.unshift(walk);
            }
            if (recalibrateX) {
                // Inject walk to this tile
                const distance = -1 * (position.x - startTile.x * Env.tileSize),
                    walk       = new Walk((distance < 0 ? WEST : EAST), Math.abs(distance), startTile.offset(0, 0));
                this.Log(`Recalibrating Walk (X): steps ${distance} from ${localX} to ${startTile.x * Env.tileSize}`, LOG_DEBUG);
                path.walks.unshift(walk);
            }
        };

        this.filterTilesInRange = (centerTiles, options) => {

            const range      = options.range,
                isAdjacent   = options.adjacent || false,
                filterFunc   = options.filterFunc,
                shootThrough = options.shootThrough;


            if (!_.isArray(centerTiles)) centerTiles = [centerTiles];
            if (range === 0 || isNaN(range)) return centerTiles;

            const tiles  = [],
                hashList = {};

            const tileHash = (tile) => tile.y * this.area.areaWidth + tile.x;

            // TODO: Could clean this up to bake the filterFunc ahead of time
            centerTiles.forEach((centerTile) => {

                if (filterFunc) {

                    // Custom filtering function
                    const expandedTiles = filterFunc(centerTile, this.area);
                    if (!_.isArray(expandedTiles)) throw Err("Filter func returned non-array type");

                    expandedTiles.forEach((expandedTile) => {
                        const tile = new Tile(expandedTile.x, expandedTile.y),
                            hash   = tileHash(tile);

                        if (hash in hashList) return; // Has this tile been added yet?
                        hashList[hash] = true; // Hash this tile to avoid checking it again
                        if (!this.area.isTileOpen(tile)) return; // Is this tile open? (able to walk on)
                        tiles.push(tile);
                    });
                } else {

                    if (isAdjacent) {

                        tiles.push(new Tile(centerTile.x, centerTile.y)); // Current tile

                        const x        = centerTile.x,
                            y          = centerTile.y,
                            directions = [
                                { xDir: 1, yDir: 0 },
                                { xDir: -1, yDir: 0 },
                                { xDir: 0, yDir: 1 },
                                { xDir: 0, yDir: -1 }
                            ];

                        directions.forEach(({ xDir, yDir }) => {

                            for (let offset = 1; offset <= range; ++offset) {
                                const tile = new Tile(x + xDir * offset, y + yDir * offset),
                                    hash   = tileHash(tile);
                                if (hashList[hash]) continue; // Has this tile been added yet?
                                hashList[hash] = true; // Hash this tile to avoid checking it again
                                if (!this.area.isTileOpen(tile)) {
                                    // FIXME: Abstract shootable filtering for only range based combat
                                    if (!shootThrough || !this.area.isShootableTile(tile)) {
                                        break; // Is this tile open? If not then we shouldn't be able to reach anything beyond that either
                                    } else {
                                        continue; // We can shoot through this tile, so allow open tiles further along the path, but don't include this tile as an acceptable to-tile
                                    }
                                }
                                tiles.push(tile);
                            }
                        });

                    } else {

                        // Create a box range about this center tile
                        for (let y = centerTile.y - range; y <= centerTile.y + range; ++y) {
                            for (let x = centerTile.x - range; x <= centerTile.x + range; ++x) {
                                const tile = new Tile(x, y),
                                    hash   = tileHash(tile);
                                if (hashList[hash]) continue; // Has this tile been added yet?
                                hashList[hash] = true; // Hash this tile to avoid checking it again
                                if (!this.area.isTileOpen(tile)) continue; // Is this tile open? (able to walk on)
                                tiles.push(tile);
                            }
                        }
                    }

                }
            });

            return tiles;
        };

        // Find the nearest tiles of a movable or tile
        this.findTilesOf = (obj) => {

            if (obj instanceof Movable) {
                const x   = obj.position.global.x / Env.tileSize,
                    y     = obj.position.global.y / Env.tileSize,
                    tile  = obj.position.tile,
                    tiles = [new Tile(tile.x, tile.y)];

                if (inRange(Math.ceil(x), tile.x + 1, this.area.areaWidth)) tiles.push(new Tile(tile.x + 1, tile.y));
                if (inRange(Math.floor(x), 0, tile.x - 1)) tiles.push(new Tile(tile.x - 1, tile.y));
                if (inRange(Math.ceil(y), tile.y + 1, this.area.areaHeight)) tiles.push(new Tile(tile.x, tile.y + 1));
                if (inRange(Math.floor(y), 0, tile.y - 1)) tiles.push(new Tile(tile.x, tile.y - 1));

                return tiles;
            } else if (obj instanceof Tile) {
                if (obj.page) {
                    const page = this.area.pages[obj.page];
                    return [new Tile(obj.x + page.x, obj.y + page.y)];
                } else {
                    return [obj];
                }
            } else {
                throw Err("Provided object is neither a Movable nor a Tile");
            }
        };

        this.checkSafePath = (state, path) => {

            //
            // Check path is safe (no collisions)
            //
            //  This works by essentially finding the starting point for the path and walking along that path to check
            //  if each tile is open.
            //  FIXME: This routine was thrown together with virtually no optimizations in mind; fix that please
            ////////////////////////////////////////

            let tileX   = state.tile.x,
                tileY   = state.tile.y,
                globalX = state.global.x,
                globalY = state.global.y,
                tile    = { x: tileX, y: tileY };

            let checkStr = "Checking Safe Path: ";

            checkStr += `(${tile.x}, ${tile.y}) `;
            if (!area.isTileOpen(tile)) {
                checkStr += "NOPE";
                this.Log(checkStr, LOG_INFO);
                return false;
            }

            for (let i = 0; i < path.walks.length; ++i) {
                let walk = path.walks[i],
                    dist = walk.distance - walk.walked;


                const isNorth = walk.direction === NORTH || walk.direction === NORTHWEST || walk.direction === NORTHEAST,
                    isSouth   = walk.direction === SOUTH || walk.direction === SOUTHWEST || walk.direction === SOUTHEAST,
                    isWest    = walk.direction === WEST  || walk.direction === NORTHWEST || walk.direction === SOUTHWEST,
                    isEast    = walk.direction === EAST  || walk.direction === NORTHEAST || walk.direction === SOUTHEAST;

                

                this.Log(`Checking from (${globalX}, ${globalY}) for walk (${walk.direction}}, ${dist})`, LOG_DEBUG);
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

                    this.Log("d: " + d, LOG_DEBUG);
                    tile.x = Math.floor(globalX / Env.tileSize);
                    tile.y = Math.floor(globalY / Env.tileSize);

                    checkStr += `(${tile.x}, ${tile.y}) `;
                    if (!area.isTileOpen(tile)) {
                        checkStr += "NOPE";
                        this.Log(checkStr, LOG_INFO);
                        return false;
                    }
                }
            }

            this.Log(checkStr, LOG_DEBUG);
            return true;
        };

        this.checkSafeWalk = (state, walk) => {


            //
            // Check path is safe (no collisions)
            //
            //  This works by essentially finding the starting point for the path and walking along that path to check
            //  if each tile is open.
            //  NOTE: currently we're only processing this on a per-walk basis (ie. this path consists of only 1 walk)
            ////////////////////////////////////////

            const start   = new Tile(state.tile.x, state.tile.y),   // Start of path (where the player thinks he's located)
                vert      = (walk.direction === NORTH || walk.direction === SOUTH),
                positive  = (walk.direction === SOUTH || walk.direction === EAST);

            let walked    = 0,
                pageI     = null,
                page      = null,
                k         = (vert ? state.global.y % Env.pageRealHeight  : state.global.x % Env.pageRealWidth), // k: our local real x/y coordinate
                kR        = null,                                   // kR: our global real x/y coordinate
                kT        = (vert ? state.tile.y : state.tile.x),   // kT: our global x/y tile
                kLT       = (vert ? (kT % Env.pageHeight) : (kT % Env.pageWidth)), // kLT: our local x/y tile
                safePath  = true;

            // Find the start of path page
            pageI = parseInt(state.tile.y / Env.pageHeight, 10) * area.pagesPerRow + parseInt(state.tile.x / Env.pageWidth, 10);
            page  = area.pages[pageI];
            kR    = k + (vert ? page.y : page.x) * Env.tileSize;

            // Is the first tile in the path within range of the player?
            if (!area.isTileInRange(start)) {
                throw Err(`Bad start of path (${start.x}, ${start.y})`);
            }


            // Given k local tile and page, is the tile open?
            const isSafeTile = (() => {

                let _kPair = null; // if k is X then kPair is Y; and vice-versa
                if (vert) {
                    _kPair = state.tile.x % Env.pageWidth;
                    return (k, page) => !(page.collidables[k] & (1<<_kPair));
                } else {
                    _kPair = state.tile.y % Env.pageHeight;
                    return (k, page) => !(page.collidables[_kPair] & (1<<k));
                }
            })();

            const updatePageAndLocalTile = (() => {

                if (vert) {
                    return (k) => {
                        if (k < 0) {
                            k += Env.pageHeight; // At the furthest end of the previous page
                            pageI -= area.pagesPerRow;
                            page = area.pages[pageI];
                            return k;
                        } else if (k > Env.pageHeight) {
                            k = k % Env.pageHeight;
                            pageI += area.pagesPerRow;
                            page = area.pages[pageI];
                            return k;
                        }
                        return k;
                    };
                } else {
                    return (k) => {
                        if (k < 0) {
                            k += Env.pageWidth; // At the furthest end of the previous page
                            --pageI;
                            page = area.pages[pageI];
                            return k;
                        } else if (k > Env.pageWidth) {
                            k = k % Env.pageWidth;
                            ++pageI;
                            page = area.pages[pageI];
                            return k;
                        }
                        return k;
                    };
                }
            })();

            if (!isSafeTile(kLT, page)) {
                throw Err("First tile is not open in path");
            }

            // Determine the next tile in the path, and confirm that its open
            // NOTE: This is done separately from the rest of the walk confirmation process since the next tile could be
            // a recalibration. eg. if the user is walking east and then stops and goes west; the start tile will be the
            // same tile as the next tile
            if (walk.distance % Env.tileSize !== 0) {
                const _kTNext = parseInt((kR + (positive ? 1 : -1) * (walk.distance % Env.tileSize)) / Env.tileSize, 10);

                // If the next tile is not the same as the star tile, then this was not a recalibration step.
                // Process this next tile
                if (_kTNext !== kT) {
                    kLT += (_kTNext - kT);
                    kT = _kTNext;
                    kLT = updatePageAndLocalTile(kLT);
                    if (!isSafeTile(kLT, page)) {
                        throw Err("Recalibration tile is not open");
                    }
                }
                walked += walk.distance % Env.tileSize;
            }

            // Confirm the rest of the path
            const multiplier = (positive ? 1 : -1);

            while (walked < walk.distance) {
                kLT += multiplier;
                kLT = updatePageAndLocalTile(kLT);
                if (!isSafeTile(kLT, page)) {
                    safePath = false;
                    break;
                }
                walked += Env.tileSize;
            }

            if (walked !== walk.distance) {
                // Something weird happened in the walk validation
                throw Err("Bad walk validation!");
            }

            return safePath;
        };




        let webworker;

        const ADD_PAGE  = 1,
            REMOVE_PAGE = 2,
            HANDLE_PATH = 3,
            SETUP_AREA  = 4;

        const RESULT_ERROR = 1,
            RESULT_PATH    = 2;

        this.initializeWorker = () => {
            webworker = new WebWorker("pathfindingWorker");
            webworker.initialize().then(() => {

                webworker.onMessage = (data) => {

                    this.Log(`Message received from worker`, LOG_INFO); 
                    this.Log(data, LOG_INFO);

                    const resultType = data.result;
                    if (!resultType) {
                        console.error("Unknown resultType from worker");
                        return;
                    } else if (resultType === RESULT_ERROR) {
                        console.error(`Error from worker: ${data.error}`);
                        return;
                    } else if (resultType === RESULT_PATH) {
                    }
                };
            });

            const pathfindingKeys = {
                ADD_PAGE,
                REMOVE_PAGE,
                HANDLE_PATH,
                SETUP_AREA,

                RESULT_ERROR,
                RESULT_PATH,

                NORTH,
                WEST,
                SOUTH,
                EAST,

                NORTHWEST,
                NORTHEAST,
                SOUTHWEST,
                SOUTHEAST,
            };


            webworker.postMessage({
                type: 'SETUP_KEYS',
                keys: pathfindingKeys
            });
        };

        // List of movables and their most recent path identifier
        // This protects us in cases where a movable finds a path twice in a row before receiving the original path.
        // The original path will eventually come through and compare its pathID with the movable's current pathID, and
        // ignore it if its stale
        // NOTE: In weird cases where a movable is removed and another is added in its place (same movableID but
        // separate movables), this will still be fine since the pathID could have any arbitrary starting point
        this.movables = {};

        this.workerHandlePath = (path, cb) => {


            // In case we have an immediate return value
            let queuedCb = null;


            // Keep track of the movable's current pathID so that we can skip stale paths
            if (!this.movables[path.movableID]) {
                this.movables[path.movableID] = {
                    pathId: 0
                };
            }

            path.id = (++this.movables[path.movableID].pathId);

            // We may already have a path queued, waiting for the current in-flight findPath to return. No matter how
            // this new findPath turns out (worker? immediate?) the pending path is now stale and can be nuked
            this.movables[path.movableID].queuedPath = null;

            const startTileX = Math.floor(path.startPt.x / Env.tileSize),
                destTileX    = Math.floor(path.endPt.x / Env.tileSize),
                startTileY   = Math.floor(path.startPt.y / Env.tileSize),
                destTileY    = Math.floor(path.endPt.y / Env.tileSize);

            if
            (
                startTileX === destTileX &&
                startTileY === destTileY
            )
            {
                // Already on same tile
                if
                (
                    path.startPt.x === path.endPt.x &&
                    path.startPt.y === path.endPt.y
                )
                {
                    // Already at point
                    const retPath = {
                        start: path.startPt,
                        end: path.startPt,
                        ALREADY_THERE: true
                    };

                    queuedCb = {
                        result: RESULT_PATH,
                        success: true,

                        movableID: path.movableID,
                        pathID: path.id,
                        time: -1,

                        path: retPath
                    }
                }
                else
                {

                    const ptPath = new Path(),
                        globalDiffX = path.endPt.x - path.startPt.x;
                        globalDiffY = path.endPt.y - path.startPt.y;

                    let dir, dist, walk;

                    if (globalDiffY !== 0) {
                        dir = SOUTH;
                        dist = globalDiffY;
                        if (dist < 0) {
                            dir = NORTH;
                            dist = dist * -1;
                        }
                        walk = new Walk(dir, dist, null);
                        walk.destination = { x: path.startPt.x, y: path.endPt.y };
                        ptPath.walks.unshift(walk);
                    }

                    if (globalDiffX !== 0) {
                        dir = EAST;
                        dist = globalDiffX;
                        if (dist < 0) {
                            dir = WEST;
                            dist = dist * -1;
                        }
                        walk = new Walk(dir, dist, null);
                        walk.destination = { x: path.endPt.x, y: path.endPt.y };
                        ptPath.walks.unshift(walk);
                    }




                    const retPath = {
                        start: path.startPt,
                        end: ptPath.walks[ptPath.walks.length - 1].destination,
                        walks: ptPath.walks,
                        debugging: {}
                    };

                    if (Env.assertion.checkSafePath) {
                        const startTile = new Tile(Math.floor(path.startPt.x / Env.tileSize), Math.floor(path.startPt.y / Env.tileSize));
                        assert(this.checkSafePath({ tile: startTile, global: path.startPt }, ptPath));
                    }

                    queuedCb = {
                        result: RESULT_PATH,
                        success: true,

                        movableID: path.movableID,
                        pathID: path.id,
                        time: -1,
                        path: retPath
                    };
                }
            } else {


                if (path.immediate) {
                    // Do not offload to worker! We need this path immediately

                    let time = -Date.now();
                    const foundPath = PathfindingBase.findPath(area, path.startPt, path.endPt);
                    time += Date.now();

                    if (foundPath) {
                        path.time = time;

                        if (foundPath.debugCheckedNodes) {
                            path.debugging = {
                                debugCheckedNodes: foundPath.debugCheckedNodes
                            };
                        }

                        if (!foundPath.path) {
                            path.ALREADY_THERE = true;
                        } else {
                            path.ALREADY_THERE = false;
                            path.ptPath = {
                                start: foundPath.path.start,
                                end: foundPath.path.walks[foundPath.path.walks.length - 1].destination,
                                walks: foundPath.path.walks,
                                debugging: {}
                            };

                            if (foundPath.debugCheckedNodes) {
                                path.ptPath.debugging.debugCheckedNodes = foundPath.debugCheckedNodes;
                            }
                        }


                        queuedCb = {
                            result: RESULT_PATH,
                            success: true,

                            movableID: path.movableID,
                            pathID: path.id,
                            time: path.time,
                            path: path.ptPath
                        };
                    } else {
                        queuedCb = {
                            result: RESULT_PATH,
                            success: false,

                            movableID: path.movableID,
                            pathID: path.id,
                            time: path.time
                        };
                    }

                } else {

                    // We can't immediately findPath, need to queue for worker
                    // We may already have a path inFlight, which is now stale. Unfortunately we can't cancel it but we
                    // can queue the next path as soon as this one finishes


                    if (this.movables[path.movableID].inFlight) {
                        // findPath in-flight, need to queue this path
                        this.movables[path.movableID].queuedPath = {
                            movableID: path.movableID,
                            pathID: path.id,
                            startPt: path.startPt,
                            endPt: path.endPt,
                            options: path.options,
                            chaseId: path.options ? path.options.chaseId : -1,
                            time: now()
                        };
                        this.Log(`Path in flight -- queueing path: ${path.options ? path.options.chaseId : -1}`, LOG_DEBUG);
                    } else {
                        this.movables[path.movableID].inFlight = now();

                        const handlePathCb = (data) => {
                            const timeSincePath = now() - this.movables[path.movableID].inFlight;
                            this.movables[path.movableID].inFlight = 0;

                            this.Log(`Path returned: ${data.success ? data.path.options.chaseId : 'x'}`, LOG_DEBUG);

                            // This path is now stale, we already have a queuedPath ready to replace this one
                            let queuedPath = null;
                            if (this.movables[path.movableID].queuedPath) {
                                this.Log(`Prepping queuedPath: ${path.options ? path.options.chaseId : -1}`, LOG_DEBUG);
                                queuedPath = this.movables[path.movableID].queuedPath;
                                // NOTE: Do NOT early-out here. Even though this path is stale, its likely similar to
                                // the new pending one. If we keep replacing it we'll never get an actual path, so just
                                // use the stale path and replace with the next
                            } else if (data.pathID !== this.movables[data.movableID].pathId) {
                                // Stale path, and replaced path is not one that's going to worker. So just ignore this
                                // one
                                this.Log(`Stale path, ignoring:  ${data.pathID} !== ${this.movables[data.movableID].pathId}; chaseId: ${data.path.options.chaseId}`, LOG_DEBUG);
                                return;
                            }


                            const movable = area.movables[data.movableID];
                            if (movable && data.success) {

                                // Path succeeded
                                // May need to adjust in case the path was delayed

                                const movablePath = this.movables[data.movableID],
                                    movable = area.movables[data.movableID];

                                if (!movable) {
                                    assert(false); // FIXME: This is reasonable, movable could have died before receiving callback. How do we handle this gracefully
                                    return;
                                }

                                // Since the path may have been delayed, we could have been running a stale path while
                                // this one was in flight. This means we may have moved, so this path's start pos
                                // won't match our current pos, and we need to repath from our current pos to the
                                // nearest point in the path
                                if (data.path.start.x !== movable.position.global.x || data.path.start.y !== movable.position.global.y) {


                                    // Find the nearest (reasonable) point in the path that we can re-path to
                                    // We don't want to re-path to the beginning of the path since the path may be going
                                    // in the same direction that we were already travelling, which means we'd be
                                    // walking backwards to the start. Instead we want to take a maxWalked delta into
                                    // account (how far could we have travelled since requesting this path), and re-path
                                    // to that delta within the path
                                    let nearestPoint = null,
                                        nearestDist = null,
                                        nearestPointI = 0;
                                    if (data.path.ALREADY_THERE) {
                                        // Go-to point is the end point, which may or may not be where we're at already
                                        nearestPoint = data.path.end;
                                        nearestDist = Math.abs(nearestPoint.x - movable.position.global.x) + Math.abs(nearestPoint.y - movable.position.global.y);
                                        nearestPointI = 0;
                                    } else {

                                        // By pathing from our current position to a point within the path, we could end
                                        // up going down a radically different route that will result in a teleport if
                                        // we repath part way through. 
                                        //
                                        //   
                                        //   Original path
                                        //
                                        //    ####   #
                                        //           #*
                                        //       #   #|
                                        //       #   #|
                                        //       #   #|
                                        //      ######|
                                        //      X-----|
                                        //
                                        //   Re-path
                                        //     Server-decision   Local-decision
                                        //
                                        //          ---           
                                        //    ####  |#|              ####   # 
                                        //          *#|                ----*# 
                                        //       #   #|                |#   # 
                                        //       #   #A                |#   # 
                                        //       #   #:                |#   # 
                                        //       #####:                |##### 
                                        //           X:                |----X 
                                        //
                                        //
                                        // We could either re-path from our current position to the nearest point in a
                                        // path which will result in less delay from the server (we reach the
                                        // destination around the same time as the server), or re-path to the minDelta
                                        // point in the path (the max distance possibly travelled since requesting the
                                        // path) which results in a path more accurate to the server but longer to
                                        // reach.
                                        //
                                        // We want to pick the most accurate path since we could re-path again and end
                                        // up completely desynchronized from the server. There's also the added benefit
                                        // of perf gain by only re-pathing to the most crucial/furthest possibly point
                                        // (minDelta)
                                        let deltaWalk = 0,
                                            walkPt = movable.position.global,
                                            minDelta = timeSincePath / movable.moveSpeed,// Expected max distance travelled since path was requested
                                            pointI = 0;
                                        for (let i = 0; i < data.path.walks.length; ++i) {
                                            const walk = data.path.walks[i],
                                                dest = walk.destination,
                                                dist = Math.abs(dest.x - movable.position.global.x) + Math.abs(dest.y - movable.position.global.y);

                                            deltaWalk += Math.abs(dest.x - walkPt.x) + Math.abs(dest.y - walkPt.y);
                                            walkPt = dest;
                                            ++pointI;

                                            if (deltaWalk < minDelta) continue;

                                            //if (nearestPoint === null || dist < nearestDist) {
                                                nearestDist = dist;
                                                nearestPoint = dest;
                                                nearestPointI = pointI;
                                            //}

                                            break;
                                        }

                                        // We may not have a nearestPoint if the walk delta is less than our minDelta;
                                        // just use the endpoint
                                        // NOTE: If this happens we've effectively run findPath twice which sucks, so
                                        // ideally this never happens. For short paths (where this could occur) we
                                        // should run findPath as immediate
                                        if (!nearestPoint) {
                                            assert(deltaWalk < minDelta);
                                            
                                            nearestPointI = data.path.walks.length;
                                            nearestPoint = data.path.walks[nearestPointI - 1].destination;
                                            nearestDist = Math.abs(nearestPoint.x - movable.position.global.x) + Math.abs(nearestPoint.y - movable.position.global.y);
                                        }
                                    }

                                    if (nearestDist === 0) {
                                        data.path.ALREADY_THERE = true;
                                    } else {
                                        const foundPath = PathfindingBase.findPath(area, { x: movable.position.global.x, y: movable.position.global.y }, { x: nearestPoint.x, y: nearestPoint.y });

                                        let prefixData = null, prefixPath = {};

                                        // Doesn't make sense that we moved to a position since requesting this path,
                                        // where we can't get back to the beginning of that path.  If something changed
                                        // (dynamic collision, teleport, etc.) then it should cancel the path in flight
                                        assert(foundPath);

                                        // We can't already be at our destination since we already checked nearestDist
                                        assert(foundPath.path);


                                        // Build up path from prefix + original path
                                        const path = new Path();
                                        path.debugging.prefixPath = [foundPath.path.start];
                                        path.debugging.discardedPath = [data.path.start];
                                        foundPath.path.walks.forEach((walk) => {
                                            path.walks.push(walk);
                                            path.debugging.prefixPath.push(walk.destination);
                                        });

                                        for (let i = 0; i < nearestPointI; ++i) {
                                            path.debugging.discardedPath.push(data.path.walks[i].destination);
                                        }

                                        for (let i = nearestPointI; i < data.path.walks.length; ++i) {
                                            path.walks.push(data.path.walks[i]);
                                        }
                                        path.start = foundPath.path.start;
                                        path.end = foundPath.path.walks[foundPath.path.walks.length - 1].destination;

                                        if (data.path.debugCheckedNodes) {
                                            path.debugging.debugCheckedNodes = foundPath.debugCheckedNodes.concat(data.path.debugCheckedNodes);
                                        }

                                        if (data.path.options) {
                                            path.options = data.path.options;
                                        }

                                        this.Log("Path:", LOG_DEBUG);
                                        this.Log(path, LOG_DEBUG);

                                        data.path = path;
                                        data.movable = area.movables[data.movableID];
                                    }
                                } else {
                                    data.path.debugging = {
                                        debugCheckedNodes: data.path.debugCheckedNodes
                                    }

                                    delete data.path.debugCheckedNodes;
                                }

                                cbThen(data);
                            } else {
                                cbCatch(data);
                            }

                            // Replace callbacks with new path cb AFTER we call callbacks from previous path
                            if (queuedPath) {
                                this.movables[queuedPath.movableID].__then = queuedPath.__then;
                                this.movables[queuedPath.movableID].__catch = queuedPath.__catch;

                                this.movables[queuedPath.movableID].queuedPath = null;
                                this.movables[queuedPath.movableID].inFlight = queuedPath.time;
                                assert(queuedPath.time);

                                this.Log(`HANDLE_PATH -- queuedPath: ${queuedPath.options ? queuedPath.options.chaseId : -1};  ${queuedPath.chaseId}`, LOG_DEBUG);
                                webworker.postMessage({
                                    type: HANDLE_PATH,
                                    path: {
                                        movableID: queuedPath.movableID,
                                        pathID: queuedPath.pathID,
                                        startPt: queuedPath.startPt,
                                        endPt: queuedPath.endPt,
                                        options: queuedPath.options
                                    }
                                }, handlePathCb);

                                path = queuedPath; // TODO: Necessary?
                            }
                        }

                        this.Log(`HANDLE_PATH: ${path.options ? path.options.chaseId : -1}`, LOG_DEBUG);
                        webworker.postMessage({
                            type: HANDLE_PATH,
                            path: {
                                movableID: path.movableID,
                                pathID: path.id,
                                startPt: path.startPt,
                                endPt: path.endPt,
                                options: path.options
                            }
                        }, handlePathCb);
                    }
                }
            }





            let cbThen = (data) => {

                this.Log(`Path results received from worker!`, LOG_DEBUG);

                assert(data.path.start || data.path.end);
                if (!data.path.start || !data.path.end) DEBUGGER();
                this.Log(`Found path from (${data.path.start.x}, ${data.path.start.y}) -> (${data.path.end.x}, ${data.path.end.y})`, LOG_DEBUG);
                this.Log(`FIND PATH TIME: ${data.time}`, LOG_DEBUG);

                const movablePath = this.movables[data.movableID],
                    movable = area.movables[data.movableID];

                if (!movable) {
                    assert(false); // FIXME: This is reasonable, movable could have died before receiving callback. How do we handle this gracefully
                    return;
                }

                if (data.path.ALREADY_THERE) {

                    // FIXME: What about ALREADY_THERE?
                    data.movable = area.movables[data.movableID];


                    if (movablePath.__then) {
                        movablePath.__then(data);
                    }
                } else {

                    //const movable = area.movables[data.movableID];
                    //if (!movable) {
                    //    console.error("Movable no longer exists in area!");
                    //} else if (!data.path.walks) {
                    //    throw Err("Bad tile walk");
                    //} else {

                    const path = new Path();
                    data.path.walks.forEach((walk) => {
                        path.walks.push(walk);
                    });
                    path.start = data.path.start;

                    path.debugging = data.path.debugging || {};

                    if (data.path.options) {
                        path.options = data.path.options;
                    }

                    // FIXME: cb w/ path so we don't have to create each time

                    //delete movable.path;
                    //const path = new Path();
                    //data.path.walks.forEach((walk) => {
                    //    path.walks.push(walk);
                    //});
                    //path.start = data.path.start;
                    //movable.path = path;
                    //path.destination = path.walks[path.walks.length - 1].destination;

                    this.Log("Path:", LOG_DEBUG);
                    this.Log(path, LOG_DEBUG);

                    data.path = path;
                    //}

                }

                data.movable = area.movables[data.movableID];


                if (movablePath.__then) {
                    movablePath.__then(data);
                }





                
            }, cbCatch = (data) => {

                const movablePath = this.movables[data.movableID];
                if (movablePath.__catch) {
                    movablePath.__catch(data);
                }
            };

            const setCallback = (cbType, cb) => {

                // Set callbacks for findPath. Since this is associated directly to the movable, there can only be one
                // current callback. We could have any one of these situations:
                //  - First path: Set as __then to use on first return
                //  - Second path (queued): Set cb to queuedPath so that when we return the firstPath we can use the old
                //  cb and replace the new cb when we put the queuedPath in-flight
                //  - Second path (immediate): Set as __then to use immediately. The in-flight path will return and be
                //  stale, so it'll be ignored
                const movablePath = this.movables[path.movableID];
                if (cbType === 'then')  {
                    if (movablePath.queuedPath) {
                        movablePath.queuedPath.__then = cb;
                    } else {
                        movablePath.__then = cb;

                        if (queuedCb) {
                            const movable = area.movables[queuedCb.movableID];
                            if (movable && queuedCb.success) {
                                cbThen(queuedCb);
                            }
                        }
                    }
                } else if (cbType === 'catch') {
                    if (movablePath.queuedPath) {
                        movablePath.queuedPath.__catch = cb;
                    } else {
                        movablePath.__catch = cb;

                        if (queuedCb) {
                            const movable = area.movables[queuedCb.movableID];
                            if (!movable || !queuedCb.success) {
                                cbCatch(queuedCb);
                            }
                        }
                    }
                }

                return callbacks;
            };

            const callbacks = {
                then: (cb) =>  { return setCallback('then', cb); },
                catch: (cb) => { return setCallback('catch', cb); },
            };

            return callbacks;
        };

        this.removePage = (page, pageI) => {
            webworker.postMessage({
                type: REMOVE_PAGE,
                pageI: pageI
            });
        };

        this.addPage = (page, pageI) => {
            webworker.postMessage({
                type: ADD_PAGE,
                page: {
                    i: pageI,
                    x: page.x,
                    y: page.y,
                    collidables: _.clone(page.collidables)
                }
            });
        };

        this.setupArea = () => {
            webworker.postMessage({
                type: SETUP_AREA,
                area: {
                    width: area.areaWidth,
                    height: area.areaHeight,
                    pagesPerRow: area.pagesPerRow
                }
            });
        };

        this.initializeWorker();


        this.testPath = (path, cb) => {
            const foundPath = PathfindingBase.findPath(area, path.startPt, path.endPt);
            assert(foundPath);
            assert(foundPath.path);
        };

        this.smokeTestPaths = () => {

            const paths = [
                {
                    startPt: { x: 1104, y: 1372 },
                    endPt: { x: 1105, y: 1398 },
                    immediate: true
                },
                {
                    startPt: {x: 1056, y: 1331 },
                    endPt: {x: 1039, y: 1344 },
                    immediate: true
                },
                {
                    startPt: {x: 1106, y: 1053},
                    endPt: {x: 1128, y: 1032},
                    immediate: true
                },
                {
                    startPt: { x: 1166, y: 1055 },
                    endPt: { x: 1164, y: 1055 },
                    immediate: true
                }
            ];

            let pathI = 0;
            const runNextPath = () => {
                if (pathI >= paths.length) return;
                const path = paths[pathI++];
                this.testPath(path, runNextPath);
            };

            runNextPath();
        };
    };

    return Pathfinding;
});
