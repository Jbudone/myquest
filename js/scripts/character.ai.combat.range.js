define(['SCRIPTINJECT', 'scripts/character', 'scripts/character.ai.ability', 'loggable'], (SCRIPTINJECT, Character, Ability, Loggable) => {

    /* SCRIPTINJECT */

    // Ranged Combat
    //
    // Allows shooting (in cardinal directions) to the target from a distance. On clients this can create a projectile
    // sprite which travels from the source to target. Firing should be able to pass certain collidables too (eg. able
    // to fire over the edge of a cliff)
    //
    // TODO: Projectile sprite on client
    // TODO: Determine which tiles can be fired through even though they're collidables

    const Range = function(game, combat, character) {

        Ability.call(this);

        extendClass(this).with(Loggable);
        this.setLogGroup('Combat');

        const _range = this;
        let _script = null;


        const attackInfo = character.entity.npc.attackInfo,
            range        = attackInfo.range;

        /* Expanding Circle Filter Function
         *
         *   TODO: ISSUES PREVENTING THIS ALGORITHM
         *
         *
         *   Issue 1: Diagonal directions
         *
         *
         *       Stage 1       Stage 2
         *
         *      .........     .........
         *      ....X....     .......X.      By allowing diagonal directions we run into the problem
         *      .../.....     .........      where an entity could be in a diagonal angle other than 45
         *      ../###        ...###         degrees, blocked by some collision but still able to fire.
         *      .*.###        .*.###         How do we tell the northeast expanding tile to not expand
         *      ...###        ...###         eastwards?
         *
         *
         *   Issue 2
         *
         *
         *      .........
         *      .......X.
         *      .........     By expanding upwards we have a degree of angles in the arc, which means that
         *      ...###...     the next expansion upwards will allow tiles to the right, and in turn the tile
         *      ...###...     to the right will allow another expansion to the right, hitting something that's
         *      ...###...     directly blocked. There will obviously be some overlap in expanding tile arcs
         *      .........     and blocked arcs, so we need to find a way to only dismiss expansions
         *      .*.......     
         *      .........
         *
         *
         *
         *   --------------------------------------------------------------------------------
         *
         *
         *
         * Each tile is expanded outwards like a circle. When an expansion (tile) is a collision, the whole
         * arc along that edge of the circle is halted and no longer expanded.
         *
         * Each tile has an arc which indicates the direction that it represents (eg. from the initial tile:
         * the tile immediately above would represent the northern arc of a circle w/ 65 degrees of freedom).
         * The initial tile represents the arc of the entire circle. The tile can expand outwards in the
         * directions provided (its arc) and passes along a segment of its arc to its children. Children could
         * potentially share the same edges of their arc (ie. one child's arc crosses over into another
         * child's arc).
         *
         * Since we're keeping track of available directions/arcs we need to expand outwards in levels. One
         * potential issue would be if one tile blocks off a certain direction, and then the next tile which
         * is about to be iterated happens to be in that direction, and is skipped. Essentially all tiles on
         * the same level need to be determined before adding the new blocking directions from that level.
         * 
         * In each expansion iteration we need to keep track of the expanding (outermost) tiles and the
         * blocked directions. Expanding one tile involves finding the potential tiles in its provided
         * direction, checking those tile directions against the blocked directions to see if we can expand
         * there.
         *
         * When checking potential tiles based off of their direction and the blocked directions we have the
         * option of skipping the tile if there's any crossover whatsoever, or only skipping the tile if
         * there's full crossover of the directions.
         *
         *
         *          Stage 1        Stage 2
         *                                 
         *                         ......        Notice how stage 2 has the option of including or dismissing
         *                         .X..^.        the upper-left tile. The blocked tile essentially blocks the
         *                         ..\.|.        northwest direction, however the north-northwest direction is
         *          ###...         ###\|.        not fully blocked by the collision.
         *          ###.^.         ###.*.
         *          ###.|.         ###...
         *             .|.            ...
         *             .*.            ...
         *             ...            ...
         *
         *
         * For now it seems better to block any tile with any crossover whatsoever. This is because sprites
         * only have cardinal directions which they can shoot, so it would look incredibly awkward for sprite
         * to be looking in one direction and fire in an angled direction
         *
         *
         *         ......      
         *         .X....
         *         ..\...
         *         ###\..     Should the sprite be looking up or left when firing northwest?
         *         ###.*.
         *         ###...
         */


        /*
         this.chaseEntityFilterFunc = function(tile, area){

         var tiles              = [],
         expandingTiles     = [], // The currently expanding tiles (these should all belong to the same level)
         nextExpandingTiles = [], // The next level of expanding tiles
         blockedArcs        = []; // Sorted by starting degree point (NORTH is 0 degrees)


        // Initial tile
        var _tile = { tile: tile, arc: { from: 0, to: 360 } };
        expandingTiles.push(_tile);


        while (expandingTiles.length) {

        var expandingTile = expandingTiles.pop();

        // There are 8 tiles neighbouring each tile. Check each direction against our current
        // direction and the blocked directions to see whichs ones can be added
        // Directions are added in order of direction (degrees), so that each element is 45 degrees
        // forwards from the previous
        var neighbourDirections = [];
        neighbourDirections.push({ yOff: -1, xOff: 0 });
        neighbourDirections.push({ yOff: -1, xOff: -1 });
        neighbourDirections.push({ yOff: 0,  xOff: -1 });
        neighbourDirections.push({ yOff: 1,  xOff: -1 });
        neighbourDirections.push({ yOff: 1,  xOff: 0 });
        neighbourDirections.push({ yOff: 1,  xOff: 1 });
        neighbourDirections.push({ yOff: 0,  xOff: 1 });
        neighbourDirections.push({ yOff: -1, xOff: 1 });
        for (var i = 0; i < neighbourDirections.length; ++i) {
        var dir = neighbourDirections[i],
        deg = i * 45,
        tile = new Tile(expandingTile.tile.x + dir.xOff, expandingTile.tile.y + dir.yOff);

        // FIXME: Check if the tile is open, otherwise add its arc to the blocked arcs


        // Does the direction fit in our expanding direction?
        if (deg < expandingTile.arc.from || deg > expandingTile.arc.to) {
        continue; // Direction is not in the direction of our expanding arc
        }

        // Is the direction blocked currently?
        var isBlocked = false;
        for (var j = 0; j < blockedArcs.length; ++j ) {
        if (deg >= blockedArcs[j].from && deg <= blockedArcs[j].to) {
        isBlocked = true;
        break;
        }
        }
        if (isBlocked) continue;

        nextExpandingTiles.push({ tile: tile, arc: { from: 0, to: 0 } });
        }

        // Have we finished expanding all tiles on the current outermost layer?
        if (expandingTiles.length === 0) {
        // Time to switch to the next layer
        expandingTiles = nextExpandingTiles;
        }
        }




        var tiles = [],
        x = tile.x,
        y = tile.y;
        for (var yOff=(range*-1); yOff<=range; ++yOff) {
            for (var xOff=(range*-1); xOff<=range; ++xOff) {
                var _tile = new Tile(x + xOff, y + yOff);
                tiles.push(_tile); // FIXME: Check if tile is acceptable (open?)
            }
    }


        // // Draw mini-area of failed path area
        // console.log("chaseEntityFilterFunc (range" + range + "): ");
        // var borderOffset = 12,
        //  aboutTile = tile,
        //  startY = Math.max(0, aboutTile.y - borderOffset),
        //  endY   = Math.min(area.areaHeight - 1, aboutTile.y + borderOffset),
        //  startX = Math.max(0, aboutTile.x - borderOffset),
        //  endX   = Math.min(area.areaWidth - 1, aboutTile.x + borderOffset),
        //  myTile = character.entity.position.tile;

        // for (var y = startY; y < endY; ++y) {
        //  var line = "     ";
        //  for (var x = startX; x < endX; ++x) {
        //      var symbol = area.isTileOpen({x:x,y:y}) ? "." : "#",
        //          isAToTile = false;

        //      for(var i=0; i<tiles.length; ++i) {
        //          if (tiles[i].x == x && tiles[i].y == y) {
        //              symbol = '%';
        //          }
        //      }



        //      if (x == myTile.x && y == myTile.y) {
        //          symbol = "@";
        //      } else if (x == tile.x && y == tile.y) {
        //          symbol = "X";
        //      }
        //      
        //      line += symbol;
        //  }
        //  console.log(line);
        // }


    return tiles;
    };

    this.inRangeFilterFunc = function(myPosition, targetPosition, area){

        // FIXME: Clean this the hell up: could be far more efficient than this crap
        var yourTile = targetPosition.tile, // FIXME: What if they're on the edge? Should expand to side tiles too?
        x = yourTile.x,
        y = yourTile.y;
        for (var yOff=(range*-1); yOff<=range; ++yOff) {
            for (var xOff=(range*-1); xOff<=range; ++xOff) {
                if (myPosition.tile.x == (x + xOff) && myPosition.tile.y == (y + yOff)) return true;
            }
        }

        return false;
    };
    */

        this.canAttackThroughShootable = true;

        this.server = {
            initialize() {
                _script = this;
            },

            attackTarget: (target) => {
                assert(target instanceof Character, "Target is not a character");

                if (!target.isAttackable()) {
                    return false;
                }

                this.Log("ATTACKING YOU: "+target);

                // TODO: Abstract damage
                const DAMAGE = 20;

                target.damage(DAMAGE, character, {
                    projectile: true // FIXME: Abstract the projectile type
                });
                this.Log(" I SHOT YOU FOR " + DAMAGE);

                return true;
            }
        };

        this.client = {
            initialize() {
                throw Err("Ranged combat not ready for clients yet");
            }
        };
    };


    Range.prototype = Object.create(Ability.prototype);
    Range.prototype.constructor = Range;

    return Range;
});
