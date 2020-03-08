define(
    [
        'SCRIPTINJECT', 'scripts/character', 'scripts/character.ai.instinct', 'movable', 'hookable', 'dynamic', 'loggable'
    ],
    (
        SCRIPTINJECT, Character, Instinct, Movable, Hookable, Dynamic, Loggable
    ) => {

        /* SCRIPTINJECT */

        addKey('PATH_CHASE');

        const Movement = function(game, brain) {

            Instinct.call(this, game, brain);

            extendClass(this).with(Hookable);
            extendClass(this).with(Dynamic);
            extendClass(this).with(Loggable);

            this.setLogGroup('Movement');
            this.setLogPrefix('Movement');

            const character = brain.character;

            this.name = 'movement';

            this.chase = (target, options, maxWalk) => {

                assert(target instanceof Character, "Target not a character");

                if (!options) options = {};
                _.defaults(options, {
                    range: 1,
                    excludeTile: false, // Exclude the center/from tiles?
                    shootThrough: false // Can we shoot through shootable tiles? (used for range combat or long-range melee)
                });

                // TODO: chase after target

                // TODO: on path recalculating; consider using the current path and stepping backwards through the
                // path, then using A* on each tile along the path to see if there's a faster path update. This
                // would avoid a full A* recalculation
                let addedPath    = null,
                    path         = null,
                    pathId       = null;


                let queuedCb = null,
                    queuedStop = null;

                let cbs = {
                    succeeded: function(){},
                    failed: function(){},
                };

                const __then = () => {

                    // We may have not setup our callbacks yet before reaching this. Just early out and use queuedCb to
                    // hit this when we set our callbacks
                    if (!cbs.succeeded && !cbs.failed) return;

                    if (addedPath === ALREADY_THERE) {
                        this.Log("We're already there", LOG_DEBUG);
                        cbs.succeeded();
                    } else if (addedPath === PATH_TOO_FAR) {
                        this.Log("You're too far!", LOG_DEBUG);
                        cbs.failed(addedPath);
                    } else if (addedPath) {
                        addedPath.finished(cbs.succeeded, cbs.failed);
                    } else {
                        this.Log("Chase path was not added -- however we are neither at our destination, nor is it too far away", LOG_WARNING);
                        cbs.failed();
                    }
                };

                const setCallbacks = {

                    then: (succeeded, failed) => {

                        if (succeeded) cbs.succeeded = succeeded;
                        if (failed)    cbs.failed = failed;

                        if (queuedCb) {
                            __then();
                        }

                        return setCallbacks;
                    },

                    onPathUpdate: () => { return setCallbacks; }, // TODO: when target moves tile and path changes (to check for path distance > care-factor distance)

                    stop: (keepCallbacks) => {
                        if (addedPath && character.entity.path && character.entity.path.id === pathId && character.entity.path.flag === PATH_CHASE) {
                            if (!keepCallbacks) {
                                character.entity.path.onFinished = function(){};
                                character.entity.path.onFailed = function(){};
                            }

                            character.entity.cancelPath();
                        } else {
                            queuedStop = pathId;
                        }

                        addedPath = null;
                    }
                };



                const playerX = character.entity.position.global.x,
                    playerY   = character.entity.position.global.y,
                    toX       = target.entity.position.global.x,
                    toY       = target.entity.position.global.y;

                character.entity.cancelPath();
                character.entity.page.area.pathfinding.workerHandlePath({
                    movableID: character.entity.id,
                    startPt: { x: playerX, y: playerY },
                    endPt: { x: toX, y: toY }
                }).then((data) => {

                    if (queuedStop) {
                        this.Log("Queued to stop path before we finished fetching path. Just ignore this", LOG_DEBUG);
                        return;
                    }

                    if (data.path.ALREADY_THERE) {

                        addedPath = ALREADY_THERE;
                        return;
                    }

                    const path = data.path;
                    if (maxWalk && path.length() > maxWalk) {
                        addedPath = PATH_TOO_FAR;
                    } else {
                        path.flag = PATH_CHASE;
                        addedPath = character.entity.addPath(path);
                        pathId    = character.entity.path.id;

                        character.entity.recordNewPath(path);
                    }

                    __then();

                }).catch((data) => {
                    console.error("Could not find path!");
                    console.log(`FAILED TO FIND PATH: (${playerX}, ${playerY}) -> (${toX}, ${toY})`);
                    cbs.failed();
                });

                return setCallbacks;
            };

            this.stopChasing = (target) => {
                character.entity.cancelPath();
            };

            this.goToTile = (tile, range) => {

                assert(tile instanceof Tile, "Target not a tile");

                let reachedTile       = function(){},
                    couldNotReachTile = function(){},
                    alreadyThere      = false,
                    addedPath         = null;


                const playerX = character.entity.position.global.x,
                    playerY   = character.entity.position.global.y,
                    toX       = tile.x * Env.tileSize,
                    toY       = tile.y * Env.tileSize,
                    fromTiles = [new Tile(Math.floor(playerX / Env.tileSize), Math.floor(playerY / Env.tileSize))],
                    toTiles   = [new Tile(Math.floor(toX / Env.tileSize), Math.floor(toY / Env.tileSize))];



                character.entity.cancelPath();
                character.entity.page.area.pathfinding.workerHandlePath({
                    movableID: character.entity.id,
                    startPt: { x: playerX, y: playerY },
                    endPt: { x: toX, y: toY }
                }).then((data) => {

                    if (data.path.ALREADY_THERE) {

                        alreadyThere = true;
                        return;
                    }

                    const path = data.path;
                    path.flag = PATH_CHASE;
                    addedPath = character.entity.addPath(path).finished(function(){reachedTile();}, function(){couldNotReachTile();});
                    character.entity.recordNewPath(path);

                }).catch((data) => {
                    console.error("Could not find path!");
                });

                return {
                    then: (success, failed) => {
                        if (alreadyThere) {
                            if (success) {
                                success();
                            }
                            return;
                        }

                        reachedTile       = success || function(){};
                        couldNotReachTile = failed || function(){};

                        // We already have a path
                        if (addedPath) {
                            addedPath.finished(reachedTile, couldNotReachTile);
                        }
                    }
                };
            };

            this.inRangeOf = (target, options) => {

                assert(target instanceof Character, "Target not a character");

                if (!options) options = {};
                options = _.defaults(options, {
                    range: 1,
                    rangeRule: ADJACENT_RANGE,
                    shootThrough: false // Can we shoot through shootable tiles? (used for range combat or long-range melee)
                });

                // FIXME: Consider obstacles in the way
                if (options.filterFunc) {
                    // Manual filter function
                    return options.filterFunc(character.entity.position, target.entity.position, character.entity.page.area);
                } else {
                    if (options.rangeRule === ADJACENT_RANGE) {

                        const xDistance = target.entity.position.tile.x - character.entity.position.tile.x,
                            yDistance   = target.entity.position.tile.y - character.entity.position.tile.y;
                        if ((Math.abs(xDistance) <= options.range && yDistance === 0) ||
                            (Math.abs(yDistance) <= options.range && xDistance === 0)) {

                            // Check each tile along the direction to ensure that there is no collision
                            // TODO: If we could store/cache collisions in the page as a bitmask in both X/Y directions
                            // then we could simply turn this into a bitwise operation (may need 2 ops if it goes across
                            // the page)
                            // TODO: Could cache those bitwise operations between points
                            const x  = character.entity.position.tile.x,
                                y    = character.entity.position.tile.y,
                                tile = { x, y };
                            let dist = null,
                                dir  = null;

                            if (xDistance !== 0) {
                                dist = Math.abs(xDistance);
                                dir = xDistance > 0 ? 1 : -1;
                            } else if (yDistance !== 0) {
                                dist = Math.abs(yDistance);
                                dir = yDistance > 0 ? 1 : -1;
                            } else {
                                // Well this is awkward... we're both ontop of each other
                                return true;
                            }

                            let tileFilterFunc = null;
                            if (options.tileFilterFunc) {
                                tileFilterFunc = options.tileFilterFunc;
                            }

                            for (let i = 0; i < dist; ++i) {
                                if (xDistance) tile.x += dir;
                                else tile.y += dir;

                                if (tileFilterFunc) {
                                    if (!tileFilterFunc(tile)) {
                                        return false;
                                    }
                                } else {
                                    // TODO: Can we shoot through a tile which we don't know about?
                                    if (!character.entity.page.area.hasTile(tile) || !character.entity.page.area.isTileOpen(tile)) {
                                        if (!options.shootThrough || !character.entity.page.area.isShootableTile(tile)) {
                                            return false;
                                        }
                                    }
                                }
                            }

                            return true;
                        }

                        return false;
                    } else {
                        throw Err("No support for non-adjacent range checking");
                    }
                }
            };

            this.server = {
                initialize: function(){
                }
            };
        };

        Movement.prototype = Object.create(Instinct.prototype);
        Movement.prototype.constructor = Movement;

        return Movement;
    });
