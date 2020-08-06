define(['loggable'], (Loggable) => {

    const Collision = function(mgr, topLeft, botRight, cbInfo) {

        this.checkCollision = (entity) => {
            console.log(entity.position.global);
            if
            (
                entity.position.global.x >= topLeft.x &&
                entity.position.global.y >= topLeft.y &&
                entity.position.global.x <  botRight.x &&
                entity.position.global.y <  botRight.y
            )
            {
                console.log("  Collision found");
                this.collide(entity);
            }
        };

        this.collide = (entity) => {
            
            if (cbInfo.type === EVTNODE_TYPE) {
                mgr.area.evtNodeMgr.triggerNode(cbInfo.id, cbInfo.key, entity);
            } else {
                assert(false);
            }
        };
    };

    const PhysicsMgr = function(area) {

        extendClass(this).with(Loggable);

        this.setLogGroup('PhysicsMgr');
        this.setLogPrefix(`PhysicsMgr: ${area.id}`);

        this.area = area;


        this.lastTick = 0;

        this.initialize = () => {

            // FIXME: Subscribe to pages being added; then subscribe to movement in those pages; then check for
            // collision
        };

        this.step = (time) => {

            let delta = time - this.lastTick;
            if (this.lastTick === 0) delta = 0;
            this.lastTick = time;

        };


        this.unload = () => {

        };


        const collisions = [];

        this.addCollision = (topLeft, botRight, cbInfo) => {
            const collision = new Collision(this, topLeft, botRight, cbInfo);
            collisions.push(collision);

            // FIXME: Check for collisions
            console.log("Checking for collision");
            console.log(topLeft);
            console.log(botRight);
            _.forEach(this.area.movables, (movable) => {
                collision.checkCollision(movable);
            });
            return collision;
        };
    };

    return PhysicsMgr;
});

