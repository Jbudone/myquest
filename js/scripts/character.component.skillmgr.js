define(['loggable', 'component'], (Loggable, Component) => {

    let server, UI;
    if (!Env.isServer) {
        server = The.scripting.server;
        UI     = The.UI;
    }

    const SkillMgr = function(character) {

        Component.call(this, 'skillmgr');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`SkillMgr: ${character.entity.id}`);

        // Common serialization
        this.commonSerialize = () => {
            const data = { };
            return data;
        };


        // TODO: Stealing this function from character.js, should abstract this somewhere
        // FIXME: Only need this on server
        const confirm = (assertion, evt, errorMessage) => {
            if (!assertion) {
                character.entity.player.respond(evt.id, false, {
                    msg: errorMessage
                });
                return false;
            }

            return true;
        };


        const _skills = {};

        // FIXME: Need a better manager for active/queued nodes/states
        let activeEvtNode = null,
            queuedEvtNode = null;
        let isFiring = false;

        this.commonRestore = (component) => {

        };

        this.server = {

            initialize() {
                if (character.entity.player) {
                    character.entity.player.registerHandler(EVT_SKILL_MELEE);
                    character.entity.player.handler(EVT_SKILL_MELEE).set(this.melee);

                    character.entity.player.registerHandler(EVT_SKILL_RANGEATTACK_BEGIN);
                    character.entity.player.handler(EVT_SKILL_RANGEATTACK_BEGIN).set(this.rangeAttackBegin);

                    character.entity.player.registerHandler(EVT_SKILL_RANGEATTACK_END);
                    character.entity.player.handler(EVT_SKILL_RANGEATTACK_END).set(this.rangeAttackEnd);
                }

                character.hook('StateEvt_Interrupted', this).after(() => {
                    this.interrupt();
                });

                this.step = this.firstStep;
            },

            needsUpdate: true,

            firstStep(delta) {

                // FIXME: Load all skills/instincts here
                //const attackInfo  = character.entity.npc.attackInfo;

                //if (!attackInfo) throw Err(`No attack info found for NPC`, arguments, character.entity.npc);
                //if (!attackInfo.ability) throw Err("No attack ability found for npc");

                //const combat = character.brain.instincts.combat;
                //const melee = combat.getAbility(attackInfo.ability);

                //_skills['combat'] = combat;
                //_skills['melee'] = melee;


                this.step = this._step;
            },

            _step(delta) {

                if (activeEvtNode && activeEvtNode.destroyed) {
                    activeEvtNode = null;
                }
            },

            netSerialize() {
                return this.commonSerialize();
            },

            serialize() {
                return this.commonSerialize();
            },

            restore(component) {
                this.commonRestore(component);
            },

            goToAndThen(character, position, func, cancel, data) {

                if (queuedEvtNode) {
                    queuedEvtNode.cancel();
                }

                queuedEvtNode = { func, cancel, data };

                // Are we out of position?
                if (character.entity.position.global.x !== position.x || character.entity.position.global.y !== position.y) {

                    // Pathfind to position
                    // NOTE: Its possible the user/server paths differed, so we can't use any tricks w/ the existing
                    // path (if there is one) to backtrack/stop at the dest
                    character.entity.page.area.pathfinding.workerHandlePath({
                        movableID: character.entity.id,
                        startPt: { x: character.entity.position.global.x, y: character.entity.position.global.y },
                        endPt: { x: position.x, y: position.y },
                        immediate: true
                    }).then((data) => {

                        // FIXME: Need to recalibrate from curPos -> nearest point along path?
                        if (data.path.ALREADY_THERE) {

                            console.log("No path to be created..we're already there!");
                            return;
                        }

                        console.log(`${now()} Pathfinding to position: (${character.entity.position.global.x}, ${character.entity.position.global.y}) -> (${position.x}, ${position.y})`); // `({

                        const path  = data.path,
                            movable = data.movable;
                        movable.addPath(path).finished(function(){
                            console.log(`${now()} Finished melee path`);
                            queuedEvtNode.func();
                        }, function(){
                            character.entity.player.respond(evt.id, false, {
                                position: { x: character.entity.position.global.x, y: character.entity.position.global.y },
                                msg: "Path to melee cancelled"
                            });
                        });
                        movable.recordNewPath(path);

                    }).catch((data) => {
                        console.error("Could not find path!");

                        character.entity.player.respond(evt.id, false, {
                            position: { x: character.entity.position.global.x, y: character.entity.position.global.y },
                            msg: "Could not find path"
                        });
                    });

                    return;
                }

                queuedEvtNode.func();
            },

            melee(evt, data) {

                console.log(`${now()} RECEIVED MELEE REQUEST`);

                const direction = data.direction,
                    position = data.position;

                if
                (
                    (
                        confirm(_.isObject(data), evt, "No args given") &&

                        // direction
                        confirm('direction' in data && _.isFinite(data.direction), evt, "Bad direction argument given") &&
                        confirm(inRange(data.direction, NORTH, WEST), evt, "Bad direction given") &&

                        // position
                        confirm('position' in data && 'x' in position && 'y' in position, evt, "Bad position argument given") &&
                        confirm(_.isFinite(position.x) && _.isFinite(position.y), evt, "Invalid position given") &&

                        confirm(!character.state.busy, evt, "Character is busy")
                    ) === false
                )
                {
                    return;
                }


                const doMelee = function() {
                    const attackInfo  = this.character.entity.npc.attackInfo;

                    const eventnode = {
                        id: 'melee',
                        direction: this.direction,
                        character: this.character,
                        range: attackInfo.range,
                        rangeWidth: attackInfo.rangeWidth
                        //melee: _skills['melee']
                    };

                    const evtNode = this.character.entity.page.area.evtNodeMgr.addNode(eventnode, this.character.entity.page, true);
                    queuedEvtNode = null;
                    activeEvtNode = evtNode;
                    this.character.entity.player.respond(this.evt.id, true, {
                        evtId: evtNode.id
                    });
                };

                const cancel = function() {
                    this.character.entity.player.respond(this.evt.id, false);
                };

                const meleeEnv = {
                    evt, direction, character
                };

                const doMeleeBound = doMelee.bind(meleeEnv),
                    cancelBound = cancel.bind(meleeEnv);

                character.charComponent('skillmgr').goToAndThen(character, position, doMeleeBound, cancelBound, { id: 'melee' });
            },

            rangeAttackBegin(evt, data) {

                console.log(`${now()} RECEIVED RANGEATTACK REQUEST`);

                const position = data.position,
                    firePoint = data.firePoint;

                if
                (
                    (
                        confirm(_.isObject(data), evt, "No args given") &&

                        // position
                        confirm('position' in data && 'x' in position && 'y' in position, evt, "Bad position argument given") &&
                        confirm(_.isFinite(position.x) && _.isFinite(position.y), evt, "Invalid position given") &&

                        // firePoint
                        confirm('firePoint' in data && 'x' in firePoint && 'y' in firePoint, evt, "Bad position argument given") &&
                        confirm(_.isFinite(firePoint.x) && _.isFinite(firePoint.y), evt, "Invalid position given") &&

                        confirm(!character.state.busy, evt, "Character is busy")
                    ) === false
                )
                {
                    return;
                }


                const doRanged = function() {
                    const attackInfo  = this.character.entity.npc.attackInfo;

                    const eventnode = {
                        id: 'rangeattack',
                        firePoint: this.firePoint,
                        character: this.character
                    };

                    const evtNode = this.character.entity.page.area.evtNodeMgr.addNode(eventnode, this.character.entity.page, true);
                    queuedEvtNode = null;
                    activeEvtNode = evtNode;
                    this.character.entity.player.respond(this.evt.id, true, {
                        evtId: evtNode.id
                    });
                };

                const cancel = function() {
                    this.character.entity.player.respond(this.evt.id, false);
                };

                const rangedEnv = {
                    evt, firePoint, character
                };

                const doRangedBound = doRanged.bind(rangedEnv),
                    cancelBound = cancel.bind(rangedEnv);

                character.charComponent('skillmgr').goToAndThen(character, position, doRangedBound, cancelBound, { id: 'ranged' });
            },

            rangeAttackEnd(evt, data) {

                console.log(`${now()} RECEIVED RANGEATTACK END REQUEST`);

                const firePoint = data.firePoint,
                    evtId = data.id;

                if
                (
                    (
                        confirm(_.isObject(data), evt, "No args given") &&

                        // firePoint
                        confirm('firePoint' in data && 'x' in firePoint && 'y' in firePoint, evt, "Bad position argument given") &&
                        confirm(_.isFinite(firePoint.x) && _.isFinite(firePoint.y), evt, "Invalid position given") &&

                        // Is there an evtNode associated w/ this end event? Is it either active or queued?
                        confirm(_.isFinite(evtId), evt, "Bad evtId given") &&
                        confirm((activeEvtNode && activeEvtNode.evtNodeRes.id === 'rangeattack') || (queuedEvtNode && queuedEvtNode.data.id === 'ranged'), evt, "Ending range attack when no begin evt exists")

                    ) === false
                )
                {
                    return;
                }


                if (activeEvtNode) {
                    activeEvtNode.trigger('End', { firePoint });
                } else {
                    queuedEvtNode.data.end = evt;
                }

                character.entity.player.respond(evt.id, true);
            },

            interrupt() {

                if (activeEvtNode) {
                    activeEvtNode.cancel();
                    activeEvtNode = null;
                }

                if (queuedEvtNode) {
                    queuedEvtNode.cancel();
                    queuedEvtNode = null;
                }

                The.player.character.state.busy = false;
            }
        };

        this.client = {

            initialize() {

                let lastAttacked = now();

                The.user.hook('rightClicked', The.user).after((mouse) => {
                    // FIXME: Melee attack (later on do a mapping for inputs??)


                    if (The.player.character.state.busy) {
                        return;
                    }

                    const _now = now();
                    if (_now - lastAttacked < 900) { // FIXME: Hardcoded timer
                        return; // Too recent
                    }

                    const worldPoint = { x: mouse.canvasX + The.camera.globalOffsetX, y: mouse.canvasY - The.camera.globalOffsetY };
                    const direction = directionFromOffset(worldPoint.x - The.player.position.global.x, worldPoint.y - The.player.position.global.y);

                    const init = {
                        evtNodeRes: "melee",
                        data: {
                            entityId: The.player.id,
                            direction: direction // cardinal + diagonal directions?
                        }
                    };

                    const page = The.area.curPage,
                        evtNode = The.area.evtNodeMgr.localInitializeNode(init, page);

                    The.player.cancelPath();

                    lastAttacked = _now;
                    server.request(EVT_SKILL_MELEE, {
                        direction: direction,
                        position: { x: The.player.position.global.x, y: The.player.position.global.y }
                    })
                    .then((result) => {
                        console.log("Successfully melee'd in Skillmgr to server");
                        evtNode.linkToServer(result);
                    }, (reply) => {
                        The.UI.postMessage(`Could not melee: ${reply.msg}`);
                    })
                    .catch(errorInGame);
                });

                The.user.hook('middleDown', The.user).after((mouse) => {

                    if (The.player.character.state.busy) {
                        return;
                    }

                    const worldPoint = { x: mouse.canvasX + The.camera.globalOffsetX, y: mouse.canvasY - The.camera.globalOffsetY };
                    const direction = directionFromOffset(worldPoint.x - The.player.position.global.x, worldPoint.y - The.player.position.global.y),
                        firePoint = worldPoint;

                    const init = {
                        evtNodeRes: "rangeattack",
                        data: {
                            entityId: The.player.id,
                            firePoint: firePoint
                        }
                    };

                    const page = The.area.curPage,
                        evtNode = The.area.evtNodeMgr.localInitializeNode(init, page);

                    isFiring = evtNode;
                    The.player.cancelPath();
                    The.player.character.state.busy = true;

                    const _now = now();
                    lastAttacked = _now;
                    server.request(EVT_SKILL_RANGEATTACK_BEGIN, {
                        position: { x: The.player.position.global.x, y: The.player.position.global.y },
                        firePoint: { x: firePoint.x, y: firePoint.y }
                    })
                    .then((result) => {
                        evtNode.linkToServer(result);
                    }, (reply) => {
                        The.UI.postMessage(`Could not range attack: ${reply.msg}`);
                        debugger; // FIXME: Cancel evtNode rather than deactivate??
                        evtNode.cancel();
                        The.player.character.state.busy = false;
                        isFiring = false;
                    })
                    .catch(errorInGame);
                });

                The.user.hook('middleUp', The.user).after((mouse) => {

                    if (isFiring) {
                        
                        const worldPoint = { x: mouse.canvasX + The.camera.globalOffsetX, y: mouse.canvasY - The.camera.globalOffsetY },
                            firePoint = worldPoint,
                            evtNode = isFiring;

                        evtNode.trigger('End', { firePoint });
                        server.request(EVT_SKILL_RANGEATTACK_END, {
                            firePoint: { x: firePoint.x, y: firePoint.y },
                            id: evtNode.id
                        })
                        .then((result) => {
                            evtNode.linkToServer(result);
                        }, (reply) => {
                            // Doesn't matter if it failed on server; nothing we can do about it
                        })
                        .catch(errorInGame);

                        isFiring = null;
                        The.player.character.state.busy = false;

                    }
                });

                The.player.character.hook('StateEvt_Interrupted', this).after(() => {
                    this.interrupt();
                });
            },

            interrupt() {

                if (isFiring) {
                    isFiring.cancel();
                    isFiring = null;
                }

                The.player.character.state.busy = false;
            },

            needsUpdate: true,

            step(delta) {

                if (isFiring) {
                    if (isFiring.destroyed) {
                        isFiring = null;
                    }
                }

                The.player.character.state.busy = false;
            },

            serialize() {
                return this.commonSerialize();
            },

            restore(component) {
                this.commonRestore(component);
            },

            netRestore(component) {
                this.commonRestore(component);
            },

            netInitialize(component) {
                this.netRestore(component);
            },

            unload() {
                The.user.unhook(this);
            }
        };
    };


    SkillMgr.prototype = Object.create(Component.prototype);
    SkillMgr.prototype.constructor = SkillMgr;

    const initialState = { };

    return {
        name: "SkillManager",
        newInstance: function(character){ return new SkillMgr(character); },
        initialState: initialState
    };
});
