define(['scripts/eventnodes.base'], function(EventNodeBase){

	const MeleeEventNode = function() {

        EventNodeBase.call(this);
		
		this.server = {

            Collision(owner, entity) {

                const amPlayer = owner.state.character.isPlayer,
                    isPlayer = entity.character.isPlayer;

                // Players don't attack players
                // NPCs don't attack NPCs
                if(amPlayer === isPlayer) return;

                console.log("COLLIDED WITH ENTITY!");

                const melee = owner.state.melee;
                if (melee) {
                    melee.attackTarget(entity.character);

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

                } else {
                    console.log("TEMP: NO MELEE, ATTACKING w/ HARDCODED DMG");
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
                }
            },

			activate(resArgs, instanceArgs, modified, state, owner) {
                console.log("ACTIVATE MELEE");

                state.melee = instanceArgs.melee;
                state.character = instanceArgs.character;

                const point = {
                    x: instanceArgs.character.entity.position.global.x,
                    y: instanceArgs.character.entity.position.global.y
                };

                const range = instanceArgs.range,
                    width = instanceArgs.rangeWidth,
                    direction = instanceArgs.direction;

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
                modified.collision = collision;

                return false;
            },

            step(resArgs, instanceArgs, modified, owner, delta) { },

            deactivate(resArgs, instanceArgs, modified, owner) {
                console.log("DEACTIVATE MELEE");
            },

            cancel(resArgs, instanceArgs, modified, owner) {
                console.log("CANCEL MELEE");
            },

            serialize(resArgs, instanceArgs, modified, owner) {
                return {
                    direction: instanceArgs.direction,
                    entityId: instanceArgs.character.entity.id
                };
            }
        };


		this.client = {

            pseudoActivate() {
                // Local player attacking
            },

            pseudoDeactivate() {
                console.log("PSEUDO DEACTIVATE MELEE");
            },

			activate(resArgs, instanceArgs, modified, state, owner) {
                // FIXME: Melee attack
                console.log("MELEE ATTACK!!!");

                const source = The.area.movables[instanceArgs.entityId];
                if (source === The.player) {
                    this.pseudoActivate();
                }

                source.sprite.dirAnimate('atk', instanceArgs.direction);

                return false;
            },

            step(resArgs, instanceArgs, modified, owner, delta) { },

            deactivate(resArgs, instanceArgs, modified, owner) {
                console.log("DEACTIVATE MELEE");
            },

            cancel(resArgs, instanceArgs, modified, owner) {
                console.log("CANCEL MELEE");
            },

            unload(resArgs, instanceArgs, modified, owner) {
                console.log("UNLOAD MELEE");
            }
        };

        this.initialize(); // Setup from Base
	};

    MeleeEventNode.prototype = Object.create(EventNodeBase.prototype);
    MeleeEventNode.prototype.constructor = MeleeEventNode;

	return MeleeEventNode;
});
