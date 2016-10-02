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

                const setCallbacks = {

                    then: (succeeded, failed) => {

                        if (!_.isFunction(succeeded)) succeeded = function(){};
                        if (!_.isFunction(failed)) failed = function(){};

                        if (addedPath === ALREADY_THERE) {
                            succeeded();
                        } else if (addedPath === PATH_TOO_FAR) {
                            failed(addedPath);
                        } else if (addedPath) {
                            addedPath.finished(succeeded, failed);
                        } else if (failed) {
                            failed();
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
                        }

                        addedPath = null;
                    }
                };

                path = character.entity.page.area.pathfinding.findPath(character.entity, target.entity, options);
                if (path) {

                    if (path === ALREADY_THERE) {

                        // We're already there..
                        addedPath = path;
                    } else if (maxWalk && path.length() > maxWalk) {

                        addedPath = PATH_TOO_FAR;
                    } else {

                        path.flag = PATH_CHASE;
                        addedPath = character.entity.addPath(path);
                        pathId    = character.entity.path.id;

                        /* Here for debugging purposes
                        const fromTile = character.entity.position.tile,
                            toTile     = target.entity.position.tile;
                        let curRealX   = character.entity.position.global.x,
                            curRealY   = character.entity.position.global.y;
                        this.Log(`  (${fromTile.x}, ${fromTile.y}) ==> (${toTile.x}, ${toTile.y})`, LOG_DEBUG);
                        for (let i = 0; i < path.walks.length; ++i) {
                            const walk          = path.walks[i];
                            let walkStr         = `     (${Math.floor(curRealX / Env.tileSize)}, ${Math.floor(curRealY / Env.tileSize)})`,
                                accumulatedWalk = 0;

                            this.Log(`  walk[${i}]: ${keyStrings[walk.direction]} for ${walk.distance} steps`, LOG_DEBUG);
                            for (let j = 0; j < Math.ceil(walk.distance / Env.tileSize); ++j) {
                                const amt = Math.min(Env.tileSize, walk.distance - accumulatedWalk);
                                     if (walk.direction === NORTH) curRealY -= amt;
                                else if (walk.direction === SOUTH) curRealY += amt;
                                else if (walk.direction === WEST)  curRealX -= amt;
                                else if (walk.direction === EAST)  curRealX += amt;
                                accumulatedWalk += amt;

                                const curTile = { x: Math.floor(curRealX / Env.tileSize), y: Math.floor(curRealY / Env.tileSize) };
                                walkStr += `   ===>   (${curTile.x}, ${curTile.y})`;

                                // Is this a collision?
                                if (!character.entity.page.area.hasTile(curTile) || !character.entity.page.area.isTileOpen(curTile)) {
                                    debugger;
                                    walkStr += " XXX COLLISION XXX ";
                                }

                                this.Log(walkStr, LOG_DEBUG);
                                walkStr = "";
                            }
                        }
                        */
                    }
                } else {
                    const fromTile = character.entity.position.tile,
                        toTile     = target.entity.position.tile;
                    this.Log(`FAILED TO FIND PATH: (${fromTile.x}, ${fromTile.y}) ==> (${toTile.x}, ${toTile.y})`);
                }

                return setCallbacks;
            };

            this.stopChasing = (target) => {
                character.entity.cancelPath();
            };

            this.goToTile = (tile, range) => {

                assert(tile instanceof Tile, "Target not a tile");

                let reachedTile       = function(){},
                    couldNotReachTile = function(){},
                    alreadyThere      = false;

                const path = character.entity.page.area.pathfinding.findPath(character.entity, tile, { range: range, maxWeight: 0 });
                if (path) {

                    if (path === ALREADY_THERE) {
                        // We're already there..
                        alreadyThere = true;
                    } else {
                        path.flag = PATH_CHASE;
                        character.entity.addPath(path).finished(function(){reachedTile();}, function(){couldNotReachTile();});
                    }
                }

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
