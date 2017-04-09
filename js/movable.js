
// Movable
define(
    [
        'entity', 'animable', 'dynamic'
    ],
    (
        Entity, Animable, Dynamic
    ) => {

        addKey('REC_NEW_PATH');
        addKey('REC_FINISHED_PATH');
        addKey('REC_CANCELLED_PATH');

        const Movable = function(spriteID, page, params) {

            Entity.call(this, spriteID, page);

            extendClass(this).with(Dynamic);

            // Position will always accurately reflect the movables position in the area. It is split between tile
            // and real coordinates. Since the movable could be part way between two tiles, it makes sense to
            // consider its real coordinates (x=tile.x*tileSize) and its tile coordinates. Note that these are
            // both global coordinates, and do not consider the offset within the page (local coordinates).
            //
            // Tile is the global discrete tile position within the area. Global is a continuous value (eg. as you
            // move between tile 0 and tile 1, your global.x goes from (tileSize/2) to ((1+tileSize)/2))
            //
            // This variable should be updated with updatePosition() immediately after the movable has moved
            // somewhere (eg. moving, zoning, respawning)
            //
            // Local coordinates used to be included within the position, but quickly caused problems. I've
            // removed local coordinates and will calculate those on the fly where necessary. This can be done by,
            //  local.x = global.x % (Env.tileSize*Env.pageWidth)
            //  local.y = global.y % (Env.tileSize*Env.pageHeight)
            //  page.x  = parseInt(global.x / (Env.tileSize*Env.pageWidth))
            //  page.y  = parseInt(global.y / (Env.tileSize*Env.pageHeight))
            //  pageI   = page.y * area.pagesPerRow + page.x
            //
            // local.x and local.y may be outside of the current page. Since a movable may be walking between two
            // tiles which are on adjacent pages, and the movable is only considered to be standing on 1 tile at a
            // time, that current tile is the one which is rounded from the global position. In other words, take
            // the global position and round it to the nearest tile. So if a movable is currently standing on a
            // tile at the top of the page (y==0), but walking north to the next tile, his local.y will be less
            // than 0.
            //
            // NOTE: JS uses float64 numbers, so our safe range for numbers are Number.MAX_SAFE_INTEGER == 2^53.
            // This should be more than enough for even the largest areas
            //
            this.position = {
                tile:   { x: 0, y: 0 },
                global: { x: 0, y: 0 }
            };

            this.updatePosition = (globalX, globalY) => {

                if (globalX !== undefined && globalX !== undefined) {
                    this.position.global.x = globalX;
                    this.position.global.y = globalY;
                }

                this.position.tile.x = parseInt(this.position.global.x * Env.invTileSize, 10);
                this.position.tile.y = parseInt(this.position.global.y * Env.invTileSize, 10);

                if (!_.isFinite(this.position.tile.x) || !_.isFinite(this.position.tile.y)) {
                    throw Err("Bad tile!");
                }
            };

            this.pathHistory = [];
            this.pathHistoryCursor = 0; // Where are we pointing within the pathHistory?

            // Store history of paths for entity: path id/flag, to/from, received path and current state (if client); print this out nicely, potentially with visuals (tiled on left, and zoom-in of recalibration on right)
            const _movable = this;
            const RecordablePath = function(path, pathState) {

                this.id   = path.id;
                this.flag = path.flag;
                this.time = now();

                this.localState = {
                    global: {
                        x: _movable.position.global.x,
                        y: _movable.position.global.y
                    },
                    tile: {
                        x: _movable.position.tile.x,
                        y: _movable.position.tile.y
                    }
                };

                this.pathState = null;

                if (pathState) {
                    this.pathState = {
                        global: {
                            x: pathState.position.global.x,
                            y: pathState.position.global.y
                        },
                        tile: {
                            x: pathState.position.tile.x,
                            y: pathState.position.tile.y
                        }
                    };
                }

                const start = this.pathState ? this.pathState : this.localState;

                this.destination = {
                    x: start.tile.x,
                    y: start.tile.y
                };


                // Recorded Path (tile/global, to, walks, area, id/flag, time)
                // State: (tile/global)
                this.walks = [];

                let globalX = start.global.x,
                    globalY = start.global.y;
                for (let i = 0; i < path.walks.length; ++i) {
                    let walk = path.walks[i];
                    this.walks.push({ direction: walk.direction, distance: walk.distance, walked: walk.walked });

                    // TODO: What about putting walk.walked into consideration? But then we would need to consider
                    // the start state's global position as opposed to tile (I think?)
                         if (walk.direction === NORTH) globalY -= walk.distance - walk.walked;
                    else if (walk.direction === SOUTH) globalY += walk.distance - walk.walked;
                    else if (walk.direction === WEST) globalX -= walk.distance - walk.walked;
                    else if (walk.direction === EAST) globalX += walk.distance - walk.walked;
                }

                this.destination.x = Math.floor(globalX / Env.tileSize);
                this.destination.y = Math.floor(globalY / Env.tileSize);

                const area = _movable.page.area;
                if (area.hasTile(this.destination)) {
                    assert(area.isTileOpen({ x: this.destination.x, y: this.destination.y }), "Path destination is not open!");
                }

                this.toString = () => {
                    let pathStr = "";
                    this.walks.forEach((walk) => {
                        pathStr += `${walk.distance - walk.walked} ${keyStrings[walk.direction]} - `;
                    });
                    return `Added Path {${this.id}, ${this.flag}}: from (${start.tile.x}, ${start.tile.y}) to (${this.destination.x}, ${this.destination.y}): {${start.global.x}, ${start.global.y}}  ${pathStr}`;
                };
            };

            this.recordPathHistory = (evt) => {
                const index = this.pathHistoryCursor;
                this.pathHistoryCursor = (index + 1) % Env.game.debugPath.pathHistory;
                this.pathHistory[index] = evt;

                if (evt.path) {
                    evt.toString = evt.path.toString;
                } else if (evt.type === REC_CANCELLED_PATH) {
                    evt.toString = () => `Cancelled Path {${evt.id}, ${evt.flag}}`;
                } else if (evt.type === REC_FINISHED_PATH) {
                    evt.toString = () => `Finished Path {${evt.id}, ${evt.flag}}`;
                }
            };

            this.recordCancelledPath = (path) => {
                this.recordPathHistory({
                    path: null,
                    id: path.id,
                    flag: path.flag,
                    type: REC_CANCELLED_PATH
                });
            };

            this.recordFinishedPath = (path) => {
                this.recordPathHistory({
                    path: null,
                    id: path.id,
                    flag: path.flag,
                    type: REC_FINISHED_PATH
                });
            };

            this.recordNewPath = (path, pathState) => {
                this.recordPathHistory({
                    path: new RecordablePath(path, pathState),
                    id: path.id,
                    flag: path.flag,
                    type: REC_NEW_PATH
                });
            };

            this.getPathHistory = () => {
                const history = this.pathHistory
                    .slice(this.pathHistoryCursor)
                    .concat(
                        this.pathHistory.slice(0, this.pathHistoryCursor)
                    );
                return history;
            };

            this.getPathHistoryString = () => {
                const history = this.getPathHistory();
                let historyString = "";
                history.forEach((evt) => {
                    historyString += evt.toString() + "\n";
                });

                return historyString;
            };


            // Set any predefined parameters for the movable
            if (params) {
                for (const param in params) {
                    this[param] = params[param];

                    if (param === 'position') {
                        if (!this.position.tile)   this.position.tile = {};
                        if (!this.position.global) this.position.global = {};
                        this.updatePosition();
                    }
                }
            }

            Ext.extend(this,'movable');

            // Path consists of an array of walks where each walk is a direction/distance pair. Note that walks
            // can be split up if they're too large so that we avoid sending too much information. The goal is to
            // avoid cheating by minimizing how much path information we send to the client.
            //
            // Any time we begin walking along a path, and periodically throughout our walk along the path, an
            // event is triggered to inform the server that the path needs to be sent
            // EVT_PATH_PARTIAL_PROGRESS:   - Initial walk (0%) when beginning a new path
            //                              - X steps since the last EVT_PATH_PARTIAL_PROGRESS sent
            //
            //
            // Since paths are relayed to the clients we need to be able to determine if the received path is the
            // same as our active path. This can happen if the user moves somewhere, his path is sent to the
            // server and then broadcasted to everyone (including himself). We need to be able to discard the same
            // received path. Also note that paths received from the server are only a subset of the entire path
            // (to avoid cheating), so its not enough to compare the walks of the path. For this reason we need to
            // keep track of the path id. We also need to consider the fact that paths can be created on the
            // server and sent to the same user who may have already started a new path. Consider the user
            // clicking to move somewhere directly before receiving a new path from the server which automatically
            // moves him into combat. In this case both paths could have the same id but are completely different.
            // Because of this we need to distinguish the origin of the path by its flag.
            //
            // lastPathId: A keyval object where the key is the path flag and the value is the last added path
            // with that flag type. Note that this can wrap around as well.
            this.path       = null;
            this.lastPathId = {};

            this.hasHadPath = (path) => {
                if (this.lastPathId[path.flag]) {
                    // Note that lastPathId can wraparound
                    const dist   = this.lastPathId[path.flag] - path.id,
                        TOO_MUCH = 1000; // FIXME: Env, and find a reasonable number
                    if (dist >= 0 && dist < TOO_MUCH) {
                        return true;
                    } else if (dist < 0 && (this.lastPathId[path.flag] + (Number.MAX_SAFE_INTEGER - path.id)) < TOO_MUCH) {
                        return true;
                    }
                }

                return false;
            };

            this.sprite = (new Animable(this.npc.sheet)); // FIXME: should not need animable for server

            this.moving       = false;
            this.direction    = null;
            this.speed        = 50;
            this.moveSpeed    = this.npc.speed;
            this.invMoveSpeed = 1 / this.npc.speed;
            this.lastMoved    = now();
            this.zoning       = false;


            // Debugging information
            // This contains stuff like rendering hints (eg. if I'm a client, what does the server think my position is?)
            // FIXME: Find a better way to store this
            this.debugging = {};

            this.physicalState = new State(STATE_ALIVE);

            this.lastStep = 0;
            this.faceDirection = (direction) => {
                if (this.direction != direction) {
                    this.direction = direction;
                    let dir="";
                    if (direction == NORTH) dir = "up";
                    else if (direction == SOUTH) dir = "down";
                    else if (direction == WEST)  dir = "left";
                    else if (direction == EAST)  dir = "right";
                    if (dir) {
                        this.sprite.idle('walk_'+dir);
                    }
                }
            };


            this.step = _.wrap(this.step, (step, time) => {

                if (this.physicalState.state !== STATE_ALIVE) {
                    this.handlePendingEvents();
                    return;
                }

                const stepResults = step.apply(this, [time]), // TODO: generalize this wrap/apply operation for basic inheritance
                    timeDelta = time - this.lastMoved;

                // Have we zoned? Disallow stepping page-specific things
                if (!this.page) {
                    if (this.path) {
                        if (_.isFunction(this.path.onFailed)) this.path.onFailed();
                        this.path = null;
                    }
                }

                if (this.path) {
                    // player step checks path, decrements from walk steps

                    let delta = timeDelta;
                    if (this.hasOwnProperty('isZoning')) delete this.isZoning;

                    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                    // TODO: try determining how many tiles we've moved based off delta, then find the tile that
                    // we end up at, then trigger WALKED_TO_TILE for each tile from next position to this
                    // position (only have to do these calculations once)
                    //  Server could be updated less frequently?  OR  only update pages when their delta
                    //  accumulates passed a threshold
                    /*
                     if (Env.isServer) {
                     if (delta >= (this.moveSpeed * Env.tileSize)) {
                     var tilesWalked = [],
                     path = this.path,
                     walk = path.walks[0],
                     numTiles = Math.floor(delta / (this.moveSpeed * Env.tileSize));

                     while (numTiles > 0) {

                     if (++walk.walked >= walk.distance) {
                     this.triggerEvent(EVT_FINISHED_WALK, walk.direction);
                     path.walks.shift();

                     if (path.walks.length == 0) {
                     this.triggerEvent(EVT_FINISHED_PATH, path.id);
                     if (_.isFunction(this.path.onFinished)) this.path.onFinished();
                     this.path = null;

                    // Finished moving
                    this.moving = false; // TODO: necessary?
                    this.sprite.idle();

                    this.triggerEvent(EVT_FINISHED_MOVING);
                    break;
                    }

                    walk = path.walks[0];
                    this.triggerEvent(EVT_PREPARING_WALK, walk);
                    }
                    }
                    }
                    } else {
                    */

                    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


                    // Are we just beginning a new walk?
                    // We need to send this immediately since we could end up zoning to another page before we get a chance
                    // to send the path, and never end up sending that path to players who could only view us in our
                    // previous page
                    let sentInitialPath = false;
                    if (this.path.lastMarkedWalked === 0) {
                        this.triggerEvent(EVT_PATH_PARTIAL_PROGRESS, this.path);
                        sentInitialPath = true;
                    }

                    while (delta >= this.moveSpeed && this.path && !this.path.finished()) {

                        if (!_.isArray(this.path.walks) ||
                            this.path.walks.length === 0) {

                            if (_.isFunction(this.path.onFailed)) this.path.onFailed();
                            this.path = null;
                            throw Err("Path of length 0 walks");
                        }

                        const path    = this.path,
                            walk      = path.walks[path.walkIndex],
                            steps     = (walk.distance - walk.walked),
                            direction = walk.direction;

                        let deltaSteps   = Math.floor(delta * this.invMoveSpeed),
                            deltaTaken   = null,
                            posK         = (walk.direction==NORTH||walk.direction==SOUTH?this.position.global.y:this.position.global.x),
                            finishedWalk = false,
                            hasZoned     = false;


                        // Are we able to move more than necessary for the current walk?
                        if (deltaSteps > steps) {
                            // TODO: change lastMoved to when this move WOULD have finished to satisfy steps
                            deltaSteps = steps;
                        }

                        // How much delta are we using up in this iteration
                        deltaTaken = deltaSteps * this.moveSpeed;
                        delta -= deltaTaken;

                        // Movement direction
                        if (direction == EAST || direction == SOUTH) posK += deltaSteps;
                        else                                         posK -= deltaSteps;

                        //Log(`(${path.id}, ${path.flag}) Moving ${keyStrings[direction]} ${deltaSteps}  TO: ${posK}  (${steps} steps)`, LOG_DEBUG);

                        // Are we just beginning this next walk?
                        if (!walk.started) {
                            walk.started = true;
                            this.direction = direction;
                            if (!Env.isServer) {
                                     if (direction==EAST)       this.sprite.animate('walk_right', true);
                                else if (direction==WEST)       this.sprite.animate('walk_left', true);
                                else if (direction==SOUTH)      this.sprite.animate('walk_down', true);
                                else if (direction==NORTH)      this.sprite.animate('walk_up', true);
                            }

                            this.triggerEvent(EVT_PREPARING_WALK, walk);
                        }

                        // Keep track of our progress in the path/walk
                        walk.walked = Math.min(walk.distance, walk.walked + deltaSteps);
                        path.walked += deltaSteps;

                        // Finished this walk?
                        if (walk.walked >= walk.distance) {

                            finishedWalk = true;
                            this.triggerEvent(EVT_FINISHED_WALK, direction);

                            // Finished the path?
                            if (path.walkIndex >= (path.walks.length - 1)) {
                                this.lastMoved += delta;
                            } else {
                                ++path.walkIndex;
                            }
                        }


                        // Movement calculation
                        //
                        // tile is a real number (not an int). We can compare tile to our current tile to
                        // determine where we're moving. If tile rounds down to less than our current tile, we're
                        // moving down; likewise if tile rounds up to more than our current tile, we're moving up.
                        // Note that these are the only two possible rounding cases. If tile rounded down and
                        // rounded are the same, and not equal to our current tile, then we've finished moving to
                        // this new tile
                        const tile = posK * Env.invTileSize;
                        if (direction==NORTH || direction==SOUTH) {
                            if (Math.floor(tile) !== this.position.tile.y || Math.ceil(tile) !== this.position.tile.y) {
                                if ((direction==NORTH && tile < this.position.tile.y) ||
                                    (direction==SOUTH && tile >= (this.position.tile.y + 1))) {
                                    // Moved to new tile
                                    this.updatePosition(this.position.global.x, posK);
                                    this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
                                } else {
                                    // Moving to new tile
                                    this.updatePosition(this.position.global.x, posK);
                                    this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
                                }
                            } else {
                                // Moved back to center of current tile (changed direction of path)
                                this.position.global.y = posK;
                            }
                        } else {
                            if (Math.floor(tile) !== this.position.tile.x || Math.ceil(tile) !== this.position.tile.x) {
                                if ((direction==WEST && tile < this.position.tile.x) ||
                                    (direction==EAST && tile >= (this.position.tile.x + 1))) {
                                    // FIXME: use >= (this.position.tile.x+0.5) to allow reaching new tile while walking to it
                                    //          NOTE: need to consider walking west and reaching next tile too early

                                    // Moved to new tile
                                    this.updatePosition(posK, this.position.global.y);
                                    this.triggerEvent(EVT_MOVED_TO_NEW_TILE);
                                } else {
                                    // Moving to new tile
                                    this.updatePosition(posK, this.position.global.y);
                                    this.triggerEvent(EVT_MOVING_TO_NEW_TILE);
                                }
                            } else {
                                // Moved back to center of current tile (changed direction of path)
                                this.position.global.x = posK;
                            }
                        }

                        if (this.position.global.x % Env.tileSize !== 0 && this.position.global.y % Env.tileSize !== 0) {
                            Log("Moved outside of both the horizontal and vertical center of the tile", LOG_ERROR);
                            Log(`I am: ${this.id}`, LOG_ERROR);
                            Log(this.position.global, LOG_ERROR);
                            Log(this.getPathHistoryString(), LOG_ERROR);
                            assert(false, "Moved outside of both the horizontal and vertical center of the tile");
                        }


                        hasZoned = this.hasOwnProperty('isZoning');
                        if (!hasZoned) {

                            // Movable has finished the walk. This is only a final step to calibrate the user to the
                            // center of the tile
                            //if (finishedWalk) {
                            //    // TODO: might need to change lastMoved to reflect this recalibration
                            //    this.position.global.x = Env.tileSize * Math.round(this.position.global.x * Env.invTileSize);
                            //    this.position.global.y = Env.tileSize * Math.round(this.position.global.y * Env.invTileSize);
                            //}
                            this.updatePosition();

                        }

                        this.lastMoved += deltaTaken;
                    }

                    // We may have zoned and thus lost our path
                    if (this.path) {

                        // Have we moved enough to trigger some partial progress through the path?
                        // FIXME: stepsWalked in Env
                        if ((this.path.lastMarkedWalked === 0) ||  // Started the path
                            (this.path.lastMarkedWalked - this.path.walked > 100)) { // Made some more notable progress through the path

                            // Don't send the partial path progress if we've already sent this before our path handling
                            if (!sentInitialPath) {
                                this.triggerEvent(EVT_PATH_PARTIAL_PROGRESS, this.path);
                            }

                            this.path.lastMarkedWalked = this.path.walked;
                        }


                        // Have we finished the entire path?
                        // Properly clear the path and trigger the path progress
                        if (this.path.finished()) {
                            // FIXME
                            this.triggerEvent(EVT_FINISHED_PATH, this.path.id);
                            if (_.isFunction(this.path.onFinished)) this.path.onFinished();
                            this.recordFinishedPath(this.path);
                            this.path = null;

                            // Finished moving
                            this.moving = false; // TODO: necessary?
                            this.sprite.idle();

                            this.triggerEvent(EVT_FINISHED_MOVING);
                        }

                    }

                    if (this.hasOwnProperty('isZoning')) delete this.isZoning;


                } else {
                    this.lastMoved = time;
                }
                this.sprite.step(time);


                const dynamicHandler = this.handler('step');
                if (dynamicHandler) {
                    dynamicHandler.call(timeDelta);
                }

                return stepResults;
            });

            this.pathToStr = () => {

                if (!this.path) {
                    return "No Path";
                }

                let str = `(${this.path.id}, ${this.path.flag}): `;
                this.path.walks.forEach((walk) => {
                    const walked = walk.walked ? (`, walked: ${walk.walked}`) : "";
                    str += `{${walk.distance} ${keyStrings[walk.direction]} ${walked}}, `;
                });

                return str;
            };

            this.addPath = (path) => {


                // add/replace path

                // Keep track of this path so that we know we've already added/ran it
                if (!this.lastPathId[path.flag]) this.lastPathId[path.flag] = 0;
                if (!path.id) {
                    path.id = (++this.lastPathId[path.flag]);

                    // Wraparound if necessary
                    if (path.id > Number.MAX_SAFE_INTEGER) {
                        path.id = 1;
                        this.lastPathId[path.flag] = 1;
                    }
                } else {
                    this.lastPathId[path.flag] = path.id;
                }

                if (path.id === undefined && path.flag === undefined) {
                    throw Err("Adding path with no id or flag set");
                }

                Log(`[${this.id}] Adding path {${path.id}, ${path.flag})`, LOG_DEBUG);

                if (this.path) {
                    this.recordCancelledPath(this.path);
                }

                if (this.path && _.isFunction(this.path.onFailed)) {
                    this.path.onFailed(EVT_NEW_PATH);
                }

                let x = this.position.global.x,
                    y = this.position.global.y;
                for (let j = 0; j < path.walks.length; ++j) {
                    let walk = path.walks[j];
                         if (walk.direction === NORTH) y -= walk.distance - walk.walked;
                    else if (walk.direction === SOUTH) y += walk.distance - walk.walked;
                    else if (walk.direction === WEST) x -= walk.distance - walk.walked;
                    else if (walk.direction === EAST) x += walk.distance - walk.walked;
                    else throw Err(`Bad direction: ${walk.direction}`);

                    let onX = x % Env.tileSize === 0,
                        onY = y % Env.tileSize === 0;

                    if (!onX && !onY) {
                        throw Err("Added path which will surely get us off center of tile!");
                    } else if (!onX && (walk.direction === NORTH || walk.direction === SOUTH)) {
                        throw Err("Added path which will surely get us off center of tile!");
                    } else if (!onY && (walk.direction === WEST || walk.direction === EAST)) {
                        throw Err("Added path which will surely get us off center of tile!");
                    }
                }
                Log(`Position: (${this.position.global.x}, ${this.position.global.y}) ==> (${x}, ${y})`, LOG_DEBUG);
                Log(path, LOG_DEBUG);

                // FIXME: Is this a good idea? Probably not since we received their state at the point in time that they
                // were partially through this walk (eg. we zone into a page where they're part way through their walk
                // and we have their current state)
                for (let j = 0; j < path.walks.length; ++j) {
                    path.walks[j].started = false; // in case walk has already started on server
                    path.walks[j].steps   = 0;
                }


                this.path = path; // replace current path with this
                this.triggerEvent(EVT_PREPARING_WALK, path.walks[0]);
                this.triggerEvent(EVT_NEW_PATH, path);

                return {
                    finished: (success, failed) => {
                        if (_.isFunction(success)) this.path.onFinished = success;
                        if (_.isFunction(failed))  this.path.onFailed   = failed;
                    }
                };
            };

            this.cancelPath = () => {
                if (this.path) {
                    if (_.isFunction(this.path.onFailed)) {
                        this.path.onFailed();
                    }

                    this.triggerEvent(EVT_CANCELLED_PATH, { id: this.path.id, flag: this.path.flag });
                    this.recordCancelledPath(this.path);
                    this.path = null;
                    this.sprite.idle();
                }
            };


            this.directionOfTarget = (target) => {
                const myY     = this.position.global.y,
                    myX       = this.position.global.x,
                    yourY     = target.position.global.y,
                    yourX     = target.position.global.x;

                let direction = null;
                     if (myY > yourY) direction = NORTH;
                else if (myY < yourY) direction = SOUTH;
                else if (myX > yourX) direction = WEST;
                else if (myX < yourX) direction = EAST;
                return direction;
            };

            this.unload = () => {
                this.triggerEvent(EVT_UNLOADED);
                this.unloadListener();
                Log("Unloading movable..", LOG_DEBUG);
            };
        };

        Movable.prototype = Object.create(Entity.prototype);
        Movable.prototype.constructor = Movable;

        return Movable;
    });
