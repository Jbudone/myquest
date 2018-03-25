define(['loggable', 'component'], (Loggable, Component) => {

    // FIXME: Check if JS uses string/symbol tables behind the scene, which is more efficient to pass around and
    // compare? 
    const RegenerateEvt = 'regenerate';

    // Static Initialization
    // TODO: Toss forwardToCharacter into SCRIPTINJECT
    // FIXME: Is the wait necessary? Could we init immediately?
    let staticInit = function() {};
    let server, UI;
    if (!Env.isServer) {

        UI     = The.UI;
        server = The.scripting.server;
        staticInit = function() {
            server.registerHandler(EVT_REGENERATE, 'character.regeneration');
            server.handler(EVT_REGENERATE).set(function(evt, data) {
                UI.postMessage(`Regenerating ${data.entityId} to health ${data.health}`, MESSAGE_INFO);

                // TODO: Look for character and emit regen on him
                The.area.movables[data.entityId].character.doHook(RegenerateEvt).post(data);
            });

            staticInit = function(){};
        };
    }

    const Regeneration = function(character) {

        Component.call(this, 'regeneration');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`Regeneration: ${character.entity.id}`);

        this.server = {

            initialize() {

                character.hook('damaged', this).after(() => {
                    this.nextTick = this.tickTime; // Reset regen tick counter
                });
            },

            needsUpdate: true,

            nextTick: 2000,
            tickTime: 2000,

            step(delta) {
                // FIXME: Sleep/Wake step (change on characters componentsToUpdate list) when health changes

                // FIXME: Use stats instead (stats.maxHealth)
                if (character.health < character.stats.health.curMax) {

                    this.nextTick -= delta;
                    if (this.nextTick <= 0) {

                        this.nextTick = this.tickTime;

                        // Regen Formula
                        // Roughly we want constitution and your (current) maximum health to determine how much health
                        // you gain per tick. Both variables act as factors to improve your regen rate.
                        //
                        // Play with values here:
                        //
                        //   var formula = (X, Y, con, level, health) => Math.pow(health, X) + Math.pow(con, Y)
                        //   
                        //   var reportList = [
                        //     { con: 1, health: 10, level: 1 },
                        //     { con: 2, health: 20, level: 2 },
                        //     { con: 8, health: 20, level: 10 },
                        //     { con: 3, health: 100, level: 8 },
                        //     { con: 8, health: 100, level: 8 }
                        //   ]
                        //
                        //   var report = (X, Y) => {
                        //     for (var i=0; i<reportList.length; ++i) {
                        //       let { con, health, level } = reportList[i], tickRate = formula(X, Y, con, level, health);
                        //       console.log(`${con} con, ${health} hp, lvl ${level} ===> ${tickRate}     ${health / tickRate}s to regen`);
                        //     }
                        //   };
                        //
                        //
                        //
                        //
                        // Regen without level
                        //
                        // regen/tick = (health ^ X) + (con ^ Y)
                        // X = 0.2, Y = 0.8
                        // 1 con, 10 hp, lvl 1 ===> 2.6     3.9s to regen
                        // 2 con, 20 hp, lvl 2 ===> 3.6     5.6s to regen
                        // 8 con, 20 hp, lvl 10 ===> 7.1    2.8s to regen
                        // 3 con, 100 hp, lvl 8 ===> 5.0    20.3s to regen
                        // 8 con, 100 hp, lvl 8 ===> 7.8    12.8s to regen
                        //
                        // TODO: (regen formula including level?)
                        // I would love to include level in the regen, but this feels awkward if NPCs don't have a
                        // level. Come back later to determine if we should include level in the regen, but maybe only
                        // for players? Or perhaps we'll give NPCs levels later on?
                        let newHealth = character.health + Math.ceil(Math.pow(character.stats.health.curMax, 0.5) * 0.04 * character.stats.con.cur);
                        newHealth = parseInt(newHealth, 10);
                        if (newHealth > character.stats.health.curMax) {
                            newHealth = character.stats.health.curMax;
                        }

                        this.Log(`Regen character health from ${character.health} to ${newHealth}`);
                        character.setNetSerializeEnabled(false);
                        character.health = newHealth;
                        character.setNetSerializeEnabled(true);

                        // TODO: We don't need to broadcast every character's regen tick immediately; could toss this onto
                        // a low priority buffer (gets sent out either with the next broadcast, or within some X time)
                        character.entity.page.broadcast(EVT_REGENERATE, {
                            entityId: character.entity.id,
                            health: newHealth
                        });
                    }
                } else {
                    this.nextTick = this.tickTime;
                }
            }
        };

        this.client = {

            initialize() {

                staticInit();

                character.hook(RegenerateEvt, this).after(function(data){
                    this.Log(`Oh snap! I just regenerated to ${data.health}`);
                    character.health = data.health;
                });
            },

            unload() { }
        };
    };

    Regeneration.prototype = Object.create(Component.prototype);
    Regeneration.prototype.constructor = Regeneration;

    const initialState = {

    };

    return {
        name: "Regeneration",
        newInstance: function(character){ return new Regeneration(character); },
        initialState: initialState
    };
});
