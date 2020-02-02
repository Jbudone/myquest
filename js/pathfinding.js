
// Pathfinding
define(['movable', 'loggable'], (Movable, Loggable) => {

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
                this.Log(checkStr, LOG_DEBUG);
                return false;
            }

            for (let i = 0; i < path.walks.length; ++i) {
                let walk = path.walks[i],
                    dist = walk.distance - walk.walked;

                let vert      = walk.direction === NORTH || walk.direction === SOUTH,
                    positive  = (walk.direction === SOUTH || walk.direction === EAST) ? 1 : -1;
                let d;
                this.Log(`Checking from (${globalX}, ${globalY}) for walk (${walk.direction}}, ${dist})`, LOG_DEBUG);
                for (d = Math.min(dist, Env.tileSize); d <= dist; d += Env.tileSize) {
                    this.Log("d: " + d, LOG_DEBUG);
                    if (vert) {
                        tile.y = Math.floor((globalY + positive * d) / Env.tileSize);
                    } else {
                        tile.x = Math.floor((globalX + positive * d) / Env.tileSize);
                    }

                    checkStr += `(${tile.x}, ${tile.y}) `;
                    if (!area.isTileOpen(tile)) {
                        checkStr += "NOPE";
                        this.Log(checkStr, LOG_DEBUG);
                        return false;
                    }
                }

                let leftover = d - dist;
                if (leftover > 0) {
                    this.Log("leftover: " + leftover, LOG_DEBUG);
                    if (vert) {
                        tile.y = Math.floor((globalY + positive * dist) / Env.tileSize);
                    } else {
                        tile.x = Math.floor((globalX + positive * dist) / Env.tileSize);
                    }

                    checkStr += `(${tile.x}, ${tile.y}) `;
                    if (!area.isTileOpen(tile)) {
                        checkStr += "NOPE";
                        this.Log(checkStr, LOG_DEBUG);
                        return false;
                    }
                }

                if (vert) {
                    globalY += positive * dist;
                } else {
                    globalX += positive * dist;
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

        // WARNING: MUST keep this in sync with worker values
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

                    console.log(`Message received from worker`); 
                    console.log(data);

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
                EAST
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
        this.movablePathID = {};

        this.workerHandlePath = (path, cb) => {

            // Keep track of the movable's current pathID so that we can skip stale paths
            if (!this.movablePathID[path.movableID]) {
                this.movablePathID[path.movableID] = 0;
            }

            path.id = (++this.movablePathID[path.movableID]);


            if
            (
                path.start.x === path.destination.x &&
                path.start.y === path.destination.y
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
                        movableID: path.movableID,
                        pathID: path.pathID,
                        startTile: path.startTile,
                        destinationTile: path.destinationTile,
                        tileTime: -1,
                        ptTime: -1,

                        ALREADY_THERE: true
                    };

                    cb({
                        result: RESULT_PATH,
                        success: true,
                        path: retPath
                    });
                    return;
                }

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
                    movableID: path.movableID,
                    pathID: path.pathID,
                    startTile: path.startTile,
                    destinationTile: path.destinationTile,
                    start: path.start,
                    walks: path.walks,
                    
                    ptPath: ptPath,
                    tileTime: -1,
                    ptTime: -1,
                };

                cb({
                    result: RESULT_PATH,
                    success: true,
                    path: retPath
                });
                return;
            }

            webworker.postMessage({
                type: HANDLE_PATH,
                path: {
                    movableID: path.movableID,
                    pathID: path.pathID,
                    startTile: path.start,
                    destinationTile: path.destination,
                    startPt: path.startPt,
                    endPt: path.endPt
                }
            }, (data) => {
                if (data.pathID !== this.movablePathID[data.movableID]) {
                    console.log("Stale path, ignoring");
                    return;
                }

                cb(data);
            });
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
    };

    return Pathfinding;
});
