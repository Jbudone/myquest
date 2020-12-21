define(['serializable'], (Serializable) => {

    const now = Date.now;

    const isObjectEmpty = function(obj) {
        assert(obj instanceof Object, "Expected object");

        let empty = true;
        for (const s in obj) {
            empty = false;
            break;
        }

        return empty;
    };

    const frontOfObject = function(obj) {
        assert(obj instanceof Object, "Expected object");

        for (const k in obj){
            return k;
        }
        return null;
    };

    const inRange = function(n, min, max) {
        return n >= min && n <= max;
    };

    const directionFromOffset = function(x, y) {
        return (Math.abs(x) > Math.abs(y)) ?  (x >= 0 ? EAST : WEST) : (y >= 0 ? SOUTH : NORTH);
    };

    const extendClass = function(toClass) {
        return {
            with(module) {
                const copy = (target) => {
                    const type = typeof target;
                    if (type === 'object') {

                        if (target === null) return null;
                        if (target instanceof Array) {
                            const arr = [];
                            for (let i = 0; i < target.length; ++i) {
                                arr.push( copy(target[i]) );
                            }
                            return arr;
                        } else {
                            const obj = {};
                            for (const key in target) {
                                obj[key] = copy(target[key]);
                            }
                            return obj;
                        }
                    } else {
                        return target;
                    }
                };

                for (const key in module) {
                    toClass[key] = copy(module[key]);
                }

                return toClass;
            }
        };
    };

    const Tile = function(x, y, area) {
        if (!_.isFinite(x) || !_.isFinite(y)) {
            throw Err(`Tile has bad x,y arguments (${x}, ${y})`);
        }

        extendClass(this).with(Serializable);
        this.x = x;
        this.y = y;
        this.page = null;

        if (area) {
            if (!area.pages) throw Err("Expected Area object");
            const pageY = parseInt(y / Env.pageHeight, 10),
                pageX   = parseInt(x / Env.pageWidth, 10),
                pageI   = area.pagesPerRow * pageY + pageX;
            this.page = area.pages[pageI];
            if (!this.page) throw Err(`Could not find page in area (${pageX}, ${pageY})`);
        }

        this.toJSON = () => {
            const tile = {
                x: this.x,
                y: this.y
            };
            if (this.page) tile.page = this.page.index;
        };

        this.offset = (xOff, yOff) => {
            if (!_.isFinite(yOff) || !_.isFinite(xOff)) throw Err(`Tile offset requires number (${xOff}, ${yOff})`);
            const y = this.y + yOff,
                x   = this.x + xOff;

            // FIXME: Is it necessary to return/throw error for bad offset from tile?
            // if (y < 0 || x < 0) return new Error("Bad offset from tile.."); // TODO: check y/x too far?
            return new Tile(x, y);
        };
    };

    const Walk = function(direction, distance, destination) {
        extendClass(this).with(Serializable);
        this.direction   = direction;
        this.distance    = distance; // distance (global real coordinates)
        this.walked      = 0; // distance travelled already
        this.destination = destination;
    };

    const Path = function() {
        extendClass(this).with(Serializable);
        this.id          = null;
        this.flag        = 0;
        this.walks       = [];
        this.start       = null; // TODO: NEED THIS (splitWalks)
        this.onFinished  = function(){}; 
        this.onFailed    = function(){};
        this.walked      = 0; // Number of steps into the path
        this.walkIndex   = 0; // Index of the walk that we're currently on
        this.lastMarkedWalked = 0; // How much had we walked at the last mark? In other words, triggering evt progress will mark the path `path.lastMarkedWalked = path.walked`
        this.debugging   = {};

        this.length = () => {
            let distance = 0;
            for (let i = 0; i < this.walks.length; ++i) {
                distance += this.walks[i].distance;
            }
            return distance;
        };

        this.addWalk = (direction, distance, destination) => {
            assert(_.isFinite(direction) && _.isFinite(distance), `Expected direction/distance as numbers (${direction}, ${distance})`);
            this.walks.push((new Walk(direction, distance, destination)));
        };

        this.unshiftWalk = (direction, distance) => {
            if (this.walks.length > 0) {
                let frontWalk = this.walks[0]

                assert(frontWalk.walked === 0, "Unshifting a walk to a path that's already been partially walked in");

                // Are we moving in either the same or opposing direction as our current walk? If so
                // then we can merge with this walk
                if (direction === frontWalk.direction) {
                    frontWalk.distance += distance;
                }
                else if
                (
                    (direction === NORTH && frontWalk.direction === SOUTH) ||
                    (direction === SOUTH && frontWalk.direction === NORTH) ||
                    (direction === WEST && frontWalk.direction === EAST) ||
                    (direction === EAST && frontWalk.direction === WEST)
                )
                {
                    frontWalk.distance -= distance;
                    if (frontWalk.distance === 0) {
                        this.walks.shift();
                    } else if (frontWalk.distance < 0) {
                        frontWalk.direction = direction;
                        frontWalk.distance *= -1;
                    }
                }
                else {
                    this.walks.unshift(new Walk(direction, distance));
                }
            } else {
                this.walks.unshift(new Walk(direction, distance));
            }
        };

        this.finished = () => {
            if (this.walks.length === 0) return true;
            if (this.walks.length === (this.walkIndex + 1) && this.walks[this.walkIndex].walked == this.walks[this.walkIndex].distance) return true;
            return false;
        };

        this.splitWalks = () => {

            const walks = [],
                maxWalk = Env.game.splitWalkLength * Env.tileSize;
            let curTile = this.start;
            for (let i = 0; i < this.walks.length; ++i) {
                const walk = this.walks[i],
                    steps  = walk.distance;
                let walked = 0;

                while (walked < steps) {
                    const nextWalk = new Walk(walk.direction, null, null);
                    let xDistance  = 0,
                        yDistance  = 0;

                    if (walked + maxWalk > steps) {
                        nextWalk.distance = (steps - walked);
                    } else {
                        nextWalk.distance = maxWalk;
                    }

                         if (walk.direction === NORTH) yDistance = -nextWalk.distance;
                    else if (walk.direction === SOUTH) yDistance =  nextWalk.distance;
                    else if (walk.direction === WEST)  xDistance = -nextWalk.distance;
                    else if (walk.direction === EAST)  xDistance =  nextWalk.distance;
                    curTile = curTile.offset( Math.round(xDistance / Env.tileSize),
                                              Math.round(yDistance / Env.tileSize) );
                    if (!curTile) throw Err("Bad tile");
                    nextWalk.destination = curTile;

                    walked += maxWalk;
                    walks.push(nextWalk);
                }
            }

            this.walks = walks;
        };

        this.findPositionAlongPath = (position, from) => {

            // In many cases the from/position will be somewhere along the same walk, we can check direction along path
            // (forwards/backwards/equal) by giving each index a ridiculous offset, and an offset along walk to compare
            // points in same walk
            const MAX_WALK_DIST = 10000;

            let foundPos = false,
                foundStart = false,
                curPos = this.start;

            const inWalkRange = (pt, l0, l1) => {
                return (pt >= Math.min(l0, l1) && pt <= Math.max(l0, l1));
            };

            const inWalkRangeDiag = (pt, l0, l1, dir) => {
                const dX = (dir === NORTHEAST || dir === SOUTHEAST) ? 1 : -1;
                const dY = (dir === NORTHWEST || dir === NORTHEAST) ? -1 : 1;

                const l0X = pt.x - l0.x,
                    l0Y = pt.y - l0.y;
                if (dX * l0X - dY * l0Y !== 0) return false; // Equal x/y distance

                const l1X = pt.x - l1.x,
                    l1Y = pt.y - l1.y;
                if (dX * l1X - dY * l1Y !== 0) return false; // Equal x/y distance

                if
                (
                    pt.x >= Math.min(l0.x, l1.x) &&
                    pt.x <= Math.max(l0.x, l1.x) &&
                    pt.y >= Math.min(l0.y, l1.y) &&
                    pt.y <= Math.max(l0.y, l1.y)
                )
                {
                    return true;
                }

                return false;
            };

            // FIXME: Linear search along points for either to/from point
            for (let i = 0; i < this.walks.length; ++i) {
                const walk = this.walks[i];
                if (walk.direction === WEST || walk.direction === EAST) {
                    if
                    (
                        foundPos === false &&
                        position.y === curPos.y &&
                        inWalkRange(position.x, curPos.x, walk.destination.x)
                    )
                    {
                        foundPos = i * MAX_WALK_DIST + Math.abs(position.x - curPos.x);
                    }

                    if
                    (
                        foundStart === false &&
                        from.y === curPos.y &&
                        inWalkRange(from.x, curPos.x, walk.destination.x)
                    )
                    {
                        foundStart = i * MAX_WALK_DIST + Math.abs(from.x - curPos.x);
                    }
                } else if (walk.direction === NORTH || walk.direction === SOUTH) {
                    if
                    (
                        foundPos === false &&
                        position.x === curPos.x &&
                        inWalkRange(position.y, curPos.y, walk.destination.y)
                    )
                    {
                        foundPos = i * MAX_WALK_DIST + Math.abs(position.y - curPos.y);
                    }

                    if
                    (
                        foundStart === false &&
                        from.x === curPos.x &&
                        inWalkRange(from.y, curPos.y, walk.destination.y)
                    )
                    {
                        foundStart = i * MAX_WALK_DIST + Math.abs(from.y - curPos.y);
                    }
                } else { // Diagonal
                    if
                    (
                        foundPos === false &&
                        inWalkRangeDiag(position, curPos, walk.destination, walk.direction)
                    )
                    {
                        foundPos = i * MAX_WALK_DIST + Math.abs(position.x - curPos.x);
                    }

                    if
                    (
                        foundStart === false &&
                        inWalkRangeDiag(from, curPos, walk.destination, walk.direction)
                    )
                    {
                        foundStart = i * MAX_WALK_DIST + Math.abs(from.x - curPos.x);
                    }
                }

                if (foundPos !== false && foundStart !== false) break;
                curPos = walk.destination;
            }

            if (foundStart === false) assert(false); // From pos not on path; this probably wasn't planned
            if (foundPos === false) return PATHPOS_NOTONPATH;
            return (foundPos - foundStart > 0 ? PATHPOS_UPCOMING : PATHPOS_PASSED);
        };
    };

    const BufferQueue = function() {
        this.taco  = [];
        this.bell  = [];
        this.state = true;

        this.switch = () => {
            this.state = !this.state;
        };

        this.queue = (data) => {
            const buffer = (this.state ? this.taco : this.bell);
            buffer.push(data);
        };

        this.read = () => (this.state ? this.bell : this.taco);

        this.clear = () => {
            if (this.state) this.bell = [];
            else this.taco = [];
        };
    };

    return {
        now,
        extendClass,
        Walk,
        Path,
        Tile,
        BufferQueue,
        isObjectEmpty,
        frontOfObject,
        inRange,
        directionFromOffset
    };
});
