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

        let activeEvtNode = null;

        this.commonRestore = (component) => {

        };

        this.server = {

            initialize() {
                if (character.entity.player) {
                    character.entity.player.registerHandler(EVT_SKILL_MELEE);
                    character.entity.player.handler(EVT_SKILL_MELEE).set(this.melee);
                }

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
                    activeEvtNode = false;
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

                        confirm(!activeEvtNode, evt, "Still busy attacking")
                    ) === false
                )
                {
                    return;
                }


                const doMelee = () => {
                    const attackInfo  = character.entity.npc.attackInfo;

                    const eventnode = {
                        id: 'melee',
                        direction,
                        character,
                        range: attackInfo.range,
                        rangeWidth: attackInfo.rangeWidth
                        //melee: _skills['melee']
                    };

                    const evtNode = character.entity.page.area.evtNodeMgr.addNode(eventnode, character.entity.page, true);
                    activeEvtNode = evtNode;
                    character.entity.player.respond(evt.id, true, {
                        evtId: evtNode.id
                    });
                };


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

                        console.log(`${now()} Pathfinding to position: (${character.entity.position.global.x}, ${character.entity.position.global.y}) -> (${position.x}, ${position.y})`);

                        const path  = data.path,
                            movable = data.movable;
                        movable.addPath(path).finished(function(){
                            console.log(`${now()} Finished melee path`);
                            doMelee();
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

                doMelee();
            }
        };

        this.client = {

            initialize() {

                let lastAttacked = now();

                The.user.hook('rightClicked', The.user).after((mouse) => {
                    // FIXME: Melee attack (later on do a mapping for inputs??)


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

            },

            needsUpdate: true,

            step(delta) {

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
