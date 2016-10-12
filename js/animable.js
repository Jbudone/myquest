
define(['sprite'], (Sprite) => {

    const Animable = function(spriteID) {

        Ext.extend(this, 'animable');

        Sprite.call(this, spriteID);

        this.animations = Resources.sprites[spriteID].data.animations;
        this.animation  = null;
        this.repeating  = null;

        this.lastStep   = 0;
        this.spriteStep = 0;
        this.speed      = 100;

        this.animate = (spriteID, repeat) => {
            if (Env.isServer) return;
            if (this.animation != this.animations[spriteID]) {
                this.animation = this.animations[spriteID];
                this.repeating = repeat;
                this.state.y   = this.animation.row * this.tileSize;
                this.state.x   = 0;
                // if (this.animation.sheet) this.state.sheet = this.animation.sheet;
                // else delete this.state.sheet;
            }
        };

        this.dirAnimate = (spriteID, direction, repeat) => {
            if (Env.isServer || Env.isTesting) return;

            let dir = "up";
                 if (direction === NORTH) dir = "up";
            else if (direction === SOUTH) dir = "down";
            else if (direction === WEST)  dir = "left";
            else if (direction === EAST)  dir = "right";

            if (this.animations[spriteID+'_'+dir]) {
                this.animate(spriteID+'_'+dir, repeat);
            } else if (this.animations[spriteID]) {
                this.animate(spriteID, repeat);
            } else {
                Log(`Could not animate [${spriteID}] in direction (${direction}). Possible Animations: [${Object.keys(this.animations)}]. Looking for (${spriteID}_${dir})`, LOG_ERROR);
            }
        };

        this.idle = (onAnimation) => {
            if (onAnimation) {
                const animation = this.animations[onAnimation];
                this.state.y = animation.row * this.tileSize;
                this.state.x = 0;
                this.animation = null;
            } else if (this.animation) {
                this.state.y = this.animation.row * this.tileSize;
                this.state.x = 0;
                this.animation = null;
            }
        };

        this.step = (time) => {

            if (this.animation) {
                if (time - this.lastStep >= this.speed) {
                    // update animation
                    ++this.spriteStep;
                    if (this.spriteStep >= this.animation.length) {
                        this.spriteStep = 0;
                        if (!this.repeating) {
                            this.animation = null;
                        }
                    }
                    this.state.x = this.spriteStep * this.tileSize;

                    this.lastStep = time;
                }
            }
        };
    };

    Animable.prototype = Object.create(Sprite.prototype);
    Animable.prototype.constructor = Animable;

    return Animable;
});
