define(['scripts/eventnodes.base'], function(EventNodeBase){

	const ImpulseEventNode = function() {

        EventNodeBase.call(this);

        const stepImpulse = (entity, delta, impulse) => {

            const area = entity.page.area,
                pos = { x: entity.position.global.x, y: entity.position.global.y },
                oldTile = { x: entity.position.tile.x, y: entity.position.tile.y };

            let impulseDelta = impulse.amount * (delta / 100),
                direction = impulse.direction;

            let dX = 0, dY = 0;

            if (direction === NORTH || direction === NORTHWEST || direction === NORTHEAST) {
                dY = -1;
            } else if (direction === SOUTH || direction === SOUTHWEST || direction === SOUTHEAST) {
                dY = 1;
            }

            if (direction === WEST || direction === NORTHWEST || direction === SOUTHWEST) {
                dX = -1;
            } else if (direction === EAST || direction === NORTHEAST || direction === SOUTHEAST) {
                dX = 1;
            }

            // Impulse, check for collisions and adjust impulse until we're not in a collision
            pos.x += impulseDelta * dX;
            pos.y += impulseDelta * dY;
            let tileX = Math.floor(pos.x / Env.tileSize),
                tileY = Math.floor(pos.y / Env.tileSize);
            while (impulseDelta > 0 && !area.isTileOpen({ x: tileX, y: tileY })) {

                let overDelta = 1000000;
                if (dX > 0) {
                    overDelta = (pos.x % Env.tileSize + 1);
                } else if (dX < 0) {
                    overDelta = Env.tileSize - (pos.x % Env.tileSize);
                }

                if (dY > 0) {
                    overDelta = Math.min(overDelta, (pos.x % Env.tileSize + 1));
                } else if (dY < 0) {
                    overDelta = Math.min(overDelta, Env.tileSize - (pos.x % Env.tileSize));
                }

                impulseDelta -= overDelta;
                pos.x -= overDelta * dX;
                pos.y -= overDelta * dY;

                tileX = Math.floor(pos.x / Env.tileSize);
                tileY = Math.floor(pos.y / Env.tileSize);
            }

            if (impulseDelta <= 0) {
                return 0;
            }

            // Update position
            entity.updatePosition(pos.x, pos.y);
            if (oldTile.x !== entity.position.tile.x || oldTile.y !== entity.position.tile.y) {
                entity.triggerEvent(EVT_MOVED_TO_NEW_TILE);
            } else {
                entity.triggerEvent(EVT_MOVING_TO_NEW_TILE);
            }

            // FIXME: Check for collision; if collision then find nearest impulse possibility and return used delta to
            // get to that point

            return delta;
        };
		
		this.server = {

			activate(resArgs, instanceArgs, modified, state, owner) {
                console.log("ACTIVATE IMPULSE");
                modified.timer = instanceArgs.data.timer;

                owner.addEvent('ImpulseUpdate');

                const entity = instanceArgs.data.character;

                // Already impulsing?
                if (entity.character.state.impulsed) {
                    console.log("NOP YOU ALREADY HAVE IMPULSE");
                    return false;
                }

                entity.character.state.impulsed = 1;
                state.entity = entity;
                state.activated = true;
                owner.broadcast('ImpulseUpdate', {
                    change: 'initial',
                    position: { x: entity.position.global.x, y: entity.position.global.y }
                });

                return true;
            },

            step(resArgs, instanceArgs, modified, owner, delta) {

                let usedDelta = stepImpulse(owner.state.entity, Math.min(delta, modified.timer), instanceArgs.data.impulse);
                modified.timer -= usedDelta;

                return (modified.timer > 0);
            },

            deactivate(resArgs, instanceArgs, modified, owner) {
                const entity = instanceArgs.data.character;
                if (!owner.state.activated) {
                    return;
                }

                entity.character.state.impulsed = 0;
                owner.broadcast('ImpulseUpdate', {
                    change: 'final',
                    position: { x: entity.position.global.x, y: entity.position.global.y }
                });
                console.log("DEACTIVATE IMPULSE");
            },

            serialize(resArgs, instanceArgs, modified, owner) {
                return {
                    impulse: instanceArgs.data.impulse,
                    timer: modified.timer,
                    entityId: instanceArgs.data.character.id
                };
            }
        };


		this.client = {

            ImpulseUpdate(owner, args) {
                const entity = owner.state.entity;
                if (args.change === 'initial') {
                    const oldTile = { x: entity.position.tile.x, y: entity.position.tile.y };
                    entity.updatePosition(args.position.x, args.position.y);
                    if (oldTile.x !== entity.position.tile.x || oldTile.y !== entity.position.tile.y) {
                        entity.triggerEvent(EVT_MOVED_TO_NEW_TILE);
                    } else {
                        entity.triggerEvent(EVT_MOVING_TO_NEW_TILE);
                    }

                } else if (args.change === 'final') {
                    // FIXME: Ensure we end up at this position
                    const oldTile = { x: entity.position.tile.x, y: entity.position.tile.y };
                    entity.updatePosition(args.position.x, args.position.y);
                    if (oldTile.x !== entity.position.tile.x || oldTile.y !== entity.position.tile.y) {
                        entity.triggerEvent(EVT_MOVED_TO_NEW_TILE);
                    } else {
                        entity.triggerEvent(EVT_MOVING_TO_NEW_TILE);
                    }

                } else {
                    assert(false); // Unexpected change to impulse
                }
            },

            pseudoActivate() {
                // Local player attacking
            },

            pseudoDeactivate() {
                console.log("PSEUDO DEACTIVATE IMPULSE");
            },

			activate(resArgs, instanceArgs, modified, state, owner) {
                // FIXME: Melee attack
                console.log("IMPULSE!!!");

                owner.addEvent('ImpulseUpdate');

                const source = The.area.movables[instanceArgs.entityId];
                state.entity = source;
                if (source === The.player) {
                    this.pseudoActivate();
                }

                return true;
            },

            step(resArgs, instanceArgs, modified, owner, delta) {

                let usedDelta = stepImpulse(owner.state.entity, Math.min(delta, modified.timer), instanceArgs.impulse);
                modified.timer -= usedDelta;

                return (modified.timer > 0);
            },

            deactivate(resArgs, instanceArgs, modified, owner) {
                console.log("DEACTIVATE IMPULSE");
            },

            unload(resArgs, instanceArgs, modified, owner) {
                console.log("UNLOAD IMPULSE");
            }
        };

        this.initialize(); // Setup from Base
	};

    ImpulseEventNode.prototype = Object.create(EventNodeBase.prototype);
    ImpulseEventNode.prototype.constructor = ImpulseEventNode;

	return ImpulseEventNode;
});
