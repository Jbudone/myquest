define(['scripts/eventnodes.base'], function(EventNodeBase){

	const RangeAttackEventNode = function() {

        EventNodeBase.call(this);
		
		this.server = {

            Collision(owner, entity) {

                const amPlayer = owner.state.character.isPlayer,
                    isPlayer = entity.character.isPlayer;

                // Players don't attack players
                // NPCs don't attack NPCs
                if(amPlayer === isPlayer) return;

                console.log("COLLIDED WITH ENTITY!");

                console.log("TEMP: NO RANGED, ATTACKING w/ HARDCODED DMG");
                entity.character.damage(2, owner.state.character, {});


                // Apply melee impulse
                if (amPlayer && !entity.character.state.impulsed) {
                    const eventnode = {
                        id: "impulse",
                        data: {
                            character: entity,
                            timer: 200,
                            impulse: {
                                direction: EAST,
                                amount: 8
                            }
                        }
                    };

                    const evtNode = entity.page.area.evtNodeMgr.addNode(eventnode, entity.page, true);
                }
            },

            End(owner, args) {

                const firePoint = args.firePoint,
                    character = owner.state.character.entity,
                    timer = owner.modified.time;

                console.log("FIRING RANGED ATTACK: " + timer);


                const range = 10*16,//instanceArgs.range,
                    width = 8;//instanceArgs.rangeWidth,

                let direction = null,
                    xDir = firePoint.x - character.position.global.x,
                    yDir = firePoint.y - character.position.global.y;
                if (Math.abs(xDir) > Math.abs(yDir)) {
                    direction = (xDir > 0) ? EAST : WEST;
                } else {
                    direction = (yDir > 0) ? SOUTH : NORTH;
                }

                const point = {
                    x: character.position.global.x,
                    y: character.position.global.y
                };

                assert(range >= width);
                assert(width >= 4);

                let topLeft = { x: point.x, y: point.y },
                    botRight = { x: point.x, y: point.y };

                if (direction === NORTH) {
                    topLeft.x = point.x - width;
                    topLeft.y = point.y - range;

                    botRight.x = point.x + width;
                } else if (direction === SOUTH) {
                    topLeft.x = point.x - width;

                    botRight.x = point.x + width;
                    botRight.y = point.y + range;
                } else if (direction === EAST) {
                    topLeft.y = point.y - width;

                    botRight.x = point.x + range;
                    botRight.y = point.y + width;
                } else if (direction === WEST) {
                    topLeft.x = point.x - range;
                    topLeft.y = point.y - width;

                    botRight.y = point.y + width;
                } else {
                    assert(false);
                }

                const cbInfo = {
                    type: EVTNODE_TYPE,
                    id: owner.id,
                    key: 'Collision'
                };

                owner.addEvent('Collision');
                const collision = owner.page.area.physicsMgr.addCollision(topLeft, botRight, cbInfo);
                owner.deactivate();
            },

			activate(resArgs, instanceArgs, modified, state, owner) {
                console.log("ACTIVATE RANGED");

                state.character = instanceArgs.character;
                state.firePoint = instanceArgs.firePoint;

                modified.time = 0;
                const evtCallback = owner.addEvent('End');

                return true;
            },

            step(resArgs, instanceArgs, modified, owner, delta) {
                modified.time += delta;

                const timeout = 2000;
                if (modified.time >= (6000 + timeout)) {
                    owner.cancel();
                } else {
                    console.log("RANGED TIME: " + modified.time);
                }
            },

            deactivate(resArgs, instanceArgs, modified, owner) {
                console.log("DEACTIVATE RANGED");
            },

            cancel(resArgs, instanceArgs, modified, owner) {
                console.log("CANCEL RANGED");
            },

            serialize(resArgs, instanceArgs, modified, owner) {
                return {
                    firePoint: instanceArgs.firePoint,
                    entityId: instanceArgs.character.entity.id
                };
            }
        };


		this.client = {

            End(owner, args) {

                const firePoint = args.firePoint,
                    character = owner.state.character,
                    timer = owner.modified.time;

                let range = 10*16;
                let direction = null,
                    xDir = firePoint.x - character.position.global.x,
                    yDir = firePoint.y - character.position.global.y;
                if (Math.abs(xDir) > Math.abs(yDir)) {
                    direction = (xDir > 0) ? EAST : WEST;
                    firePoint.x = character.position.global.x + ((direction === WEST) ? -1 : 1) * range;
                    firePoint.y = character.position.global.y;
                } else {
                    direction = (yDir > 0) ? SOUTH : NORTH;
                    firePoint.x = character.position.global.x;
                    firePoint.y = character.position.global.y + ((direction === NORTH) ? -1 : 1) * range;
                }

                // FIXME: Abstract where we fetch the projectile sprite
                const projectileSprite = 1960;
                The.renderer.addProjectile(character, firePoint, projectileSprite);

                character.sprite.dirAnimate('atk', direction);

                console.log("FIRING RANGED ATTACK: " + timer);
                owner.deactivate();
            },

            pseudoActivate() {
                // Local player attacking
            },

            pseudoDeactivate() {
                console.log("PSEUDO DEACTIVATE RANGED");
            },

			activate(resArgs, instanceArgs, modified, state, owner) {
                console.log("RANGED ATTACK!!!");

                const source = The.area.movables[instanceArgs.entityId];
                if (source === The.player) {
                    this.pseudoActivate();
                }

                state.character = source;
                state.firePoint = instanceArgs.firePoint;

                modified.time = 0;

                const evtCallback = owner.addEvent('End');
                //source.sprite.dirAnimate('atk', instanceArgs.direction);

                return true;
            },

            step(resArgs, instanceArgs, modified, owner, delta) {
                modified.time += delta;

                if (owner.state.character === The.player) {

                    const mouse = The.UI.lastMouseEvt(),
                        worldPoint = { x: mouse.canvasX + The.camera.globalOffsetX, y: mouse.canvasY - The.camera.globalOffsetY },
                        firePoint = worldPoint,
                        character = owner.state.character;

                    let range = 10*16;

                    let direction = null,
                        xDir = firePoint.x - character.position.global.x,
                        yDir = firePoint.y - character.position.global.y;
                    if (Math.abs(xDir) > Math.abs(yDir)) {
                        direction = (xDir > 0) ? EAST : WEST;
                        firePoint.x = character.position.global.x + ((direction === WEST) ? -1 : 1) * range;
                        firePoint.y = character.position.global.y;
                    } else {
                        direction = (yDir > 0) ? SOUTH : NORTH;
                        firePoint.x = character.position.global.x;
                        firePoint.y = character.position.global.y + ((direction === NORTH) ? -1 : 1) * range;
                    }

                    character.sprite.faceDirection(direction);

                    if (modified.time >= 6000) {
                        modified.time = 6000;
                        owner.trigger('End', { firePoint });
                    } else {
                        console.log("RANGED TIME: " + modified.time);
                    }
                }
            },

            deactivate(resArgs, instanceArgs, modified, owner) {
                this.pseudoDeactivate();
                console.log("DEACTIVATE RANGED");
            },

            cancel(resArgs, instanceArgs, modified, owner) {
                console.log("CANCEL RANGED");
            },

            unload(resArgs, instanceArgs, modified, owner) {
                console.log("UNLOAD RANGED");
            }
        };

        this.initialize(); // Setup from Base
	};

    RangeAttackEventNode.prototype = Object.create(EventNodeBase.prototype);
    RangeAttackEventNode.prototype.constructor = RangeAttackEventNode;

	return RangeAttackEventNode;
});
