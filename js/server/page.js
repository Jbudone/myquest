
// Page (Server)
define(
    [
        'movable'
    ],
    (
        Movable
    ) => {

        const Page = {

            zones: {},
            spawns: {},

            _init() {

                // TODO: Find a better way to handle adding entities before they have a character ready
                this.registerHook('addcharacterlessentity');
                this.listenTo(this, EVT_ADDED_ENTITY, (page, entity) => {

                    if (!entity.character) {
                        this.doHook('addcharacterlessentity').pre(entity);
                    }

                    const ent = {
                        id: entity.id,
                        position: {
                            global: {
                                x: entity.position.global.x,
                                y: entity.position.global.y
                            },
                            tile: {
                                x: entity.position.tile.x,
                                y: entity.position.tile.y
                            }
                        },
                        spriteID: entity.spriteID,
                        state: entity.sprite.state,
                        zoning: entity.zoning,
                        path: (entity.path ? entity.path.serialize() : null),
                        _character: entity.character.netSerialize()
                    };

                    // TODO: Do entity.playerID check and simply start indices from 1 (hidden classes)
                    if ('playerID' in entity) {
                        ent.playerID = entity.playerID;
                        ent.name = entity.name;
                    }

                    this.eventsBuffer.push({
                        evtType: EVT_ADDED_ENTITY,
                        entity: ent,
                        frameId: (++The.frameEvtId)
                    });


                    //this.Log("Added entity["+entity.id+"]("+entity.spriteID+") to page ("+this.index+")("+entity.position.global.x+","+entity.position.global.y+")", LOG_DEBUG);
                    /*
                     this.listenTo(entity, EVT_PREPARING_WALK, function(entity, walk){
                     if (!_.isFinite(entity.position.global.y) || !_.isFinite(entity.position.global.x)) throw new Error("Entity global position is illegal!");
                     if (!_.isFinite(this.x) || !_.isFinite(this.y)) throw new Error("Page has illegal position!");

                     var state = {
                     page: this.index,
                     position: {
                     global: {
                     x: entity.position.global.x,
                     y: entity.position.global.y },
                     tile: {
                     x: entity.position.tile.x,
                     y: entity.position.tile.y }
                     },
                     },
                     path = walk.toJSON(),
                     data = null;

                     if (_.isError(path)) throw path;

                     data = {
                     id: entity.id,
                     state: state,
                     path: path,
                     };


                     this.Log("Entity [" + entity.id + "] sending Path: from (" + state.position.tile.x + ", " + state.position.tile.y + ")");
                     this.Log("      (REAL) from (" + state.position.global.x + ", " + state.position.global.y + ")");



                    // FIXME: uncomment this to send move event immediately -- testing for bad position
                    //          synchronization between client/server
                    // var self = this;
                    // for (var movableID in this.area.movables) {
                    //  var movable = this.area.movables[movableID];
                    //  if (!movable.player) continue;
                    //  if (movable.player.pages.hasOwnProperty(self.index)) {
                    //      var s = JSON.stringify({
                    //         evtType: EVT_PAGE_EVENTS,
                    //         page: self.index,
                    //         events: JSON.stringify({events:[JSON.stringify({
                    //             evtType: EVT_PREPARING_WALK,
                    //             data: data
                    //         })]})
                    //      });
                    //      movable.player.client.send(s);
                    //  }
                    // }

                    // FIXME: uncomment this for standard (old) move event handling -- sends single walk event
                    //this.eventsBuffer.push({
                    //  evtType: EVT_PREPARING_WALK,
                    //  data: data
                    //});
                    });
                    */


                    // Send path updates any time the entity makes progress through its path
                    this.listenTo(entity, EVT_PATH_PARTIAL_PROGRESS, (entity, path) => {

                        assert(_.isFinite(entity.position.global.y) && _.isFinite(entity.position.global.x), "Illegal entity global position");

                        const state = {
                            page: this.index,
                            position: {
                                global: {
                                    x: entity.position.global.x,
                                    y: entity.position.global.y },
                                tile: {
                                    x: entity.position.tile.x,
                                    y: entity.position.tile.y }
                            }
                        };

                        // Continuously append walks to the path until we reach the max path size
                        const pathToSend = { walks: [], id: path.id, flag: path.flag };
                        let sizeOfPath = 0;
                        path.walks.forEach((walk) => {
                            pathToSend.walks.push({
                                direction: walk.direction,
                                distance: walk.distance,
                                walked: walk.walked
                            });

                            sizeOfPath += (walk.distance - walk.walked);
                            // FIXME: Env for max size of path to send
                            // if (sizeOfPath > (Env.tileSize * 30)) {
                            //   break;
                            // }
                        });


                        const data = {
                            id: entity.id,
                            state,
                            path: pathToSend
                        };

                        this.eventsBuffer.push({
                            evtType: EVT_PATH_PARTIAL_PROGRESS,
                            data,
                            frameId: (++The.frameEvtId)
                        });
                    });

                    // If the path has been cancelled broadcast to users so that they can see the entity stop moving
                    this.listenTo(entity, EVT_CANCELLED_PATH, (entity, path) => {

                        // FIXME: Also need user to forward EVT_CANCELLED_PATH to server in case they cancel the path

                        const state = {
                            page: this.index,
                            position: {
                                global: {
                                    x: entity.position.global.x,
                                    y: entity.position.global.y },
                                tile: {
                                    x: entity.position.tile.x,
                                    y: entity.position.tile.y }
                            }
                        };

                        const data = {
                            id: entity.id,
                            state,
                            path: {
                                id: path.id,
                                flag: path.flag
                            }
                        };

                        this.eventsBuffer.push({
                            evtType: EVT_CANCELLED_PATH,
                            data,
                            frameId: (++The.frameEvtId)
                        });

                        this.Log(`Entity [${entity.id}] cancelling Path {${path.id}, ${path.flag}}`, LOG_DEBUG);
                    });
                });

                this.listenTo(this, EVT_ZONE_OUT, (page, entity) => {
                    assert(_.isFinite(entity.id), "Entity does not have a legal id");

                    this.eventsBuffer.push({
                        evtType: EVT_REMOVED_ENTITY,
                        entity: { id: entity.id },
                        frameId: (++The.frameEvtId)
                    });
                });
            },

            initialize() {

            },

            // Spawn all initial movables in page
            // NOTE: since the scriptmgr hasn't been started yet, we want to spawn everything as soon as the scriptmgr
            // (in particular Game and Character) is ready
            initialSpawn() {

                if (this.spawns) {
                    _.each(this.spawns, (spawn, spawnCoord) => {

                        spawnCoord = parseInt(spawnCoord, 10);
                        if (!_.isFinite(spawnCoord)) throw Err(`spawnCoord not a number: ${spawnCoord}`);

                        const npc = _.find(Resources.npcs, (n) => n.sheet === spawn.id);
                        if (!npc) { throw Err(`Could not find spawn unit: ${spawn.id}`); }

                        const localY = parseInt(spawnCoord / Env.pageWidth, 10),
                            localX   = spawnCoord % Env.pageWidth;

                        const entity = new Movable(npc.id, this, {
                                position: {
                                    global: {
                                        x: (this.x + localX) * Env.tileSize,
                                        y: (this.y + localY) * Env.tileSize
                                    }
                                }
                            });

                        this.Log(`Spawning spawn[${spawn.id}] at: (${localX}, ${localY})`, LOG_DEBUG);
                        this.area.watchEntity(entity);
                        this.addEntity(entity);
                    });
                }
            },

            broadcast(evtID, args) {
                this.eventsBuffer.push({
                    evtType: evtID,
                    data: args,
                    frameId: (++The.frameEvtId)
                });
            },

            fetchEventsBuffer() {

                if (!this.eventsBuffer.length) return null;

                const pageEvents = [],
                    data         = {};
                let json         = null;

                for (let i = 0; i < this.eventsBuffer.length; ++i) {
                    json = JSON.stringify(this.eventsBuffer[i]);
                    if (_.isError(json)) throw json;

                    pageEvents.push(json);
                }
                this.eventsBuffer = [];

                data.page   = this.index;
                data.events = pageEvents;

                const buffer = JSON.stringify(data);
                if (_.isError(buffer)) throw buffer;

                return buffer;
            },

            serialize(options) {

                const serialized = {};

                serialized.index = this.index;
                if (options | PAGE_SERIALIZE_BASE) {
                    serialized.x = this.x;
                    serialized.y = this.y;

                    serialized.tiles         = this.tiles;
                    serialized.sprites       = this.sprites;
                    serialized.collidables   = this.collidables;
                    serialized.items         = this.items;
                    serialized.interactables = this.interactables;

                    if (Env.game.useJPS) {
                        serialized.jumpPoints       = this.jumpPoints;
                        serialized.forcedNeighbours = this.area.forcedNeighbours;
                    }
                }

                if (options | PAGE_SERIALIZE_MOVABLES) {
                    serialized.movables = {};
                    _.each(this.movables, (entity, entityID) => {

                        let path = null;
                        if (entity.path) {
                            path = entity.path.serialize();
                            if (_.isError(path)) throw path;
                        }

                        const _character = entity.character.netSerialize();

                        const ent = {
                            id: entity.id,
                            position: {
                                global: {
                                    x: entity.position.global.x,
                                    y: entity.position.global.y
                                },
                                tile: {
                                    x: entity.position.tile.x,
                                    y: entity.position.tile.y
                                }
                            },
                            spriteID: entity.spriteID,
                            state: entity.sprite.state,
                            zoning: entity.zoning,
                            path,
                            _character
                        };

                        if ('name' in entity) {
                            ent.name = entity.name;
                        }

                        if ('playerID' in entity) {
                            ent.playerID = entity.playerID;
                        }

                        serialized.movables[entityID] = ent;
                    });

                    // FIXME: Not a movable, maybe we can rename from MOVABLES to DYNAMIC
                    serialized.evtnodes = this.area.evtNodeMgr.serializePage(this);
                }

                return JSON.stringify(serialized);
            },

            checkZoningTile(x, y) {
                const index = y * Env.pageWidth + x;
                if (this.zones[index]) {
                    return this.zones[index];
                }
                return false;
            }
        };

        return Page;
    });
