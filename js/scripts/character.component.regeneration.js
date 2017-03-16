define(['loggable', 'component'], (Loggable, Component) => {

    // FIXME: Check if JS uses string/symbol tables behind the scene, which is more efficient to pass around and
    // compare? 
    const RegenerateEvt = 'regenerate';

    // Static Initialization
    // TODO: Toss forwardToCharacter into SCRIPTINJECT
    // FIXME: Is the wait necessary? Could we init immediately?
    let staticInit = function() {};
    let server;
    if (!Env.isServer) {

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

            initialize() { },

            needsUpdate: true,

            nextTick: 1000,
            tickTime: 1000,

            step(delta) {
                // FIXME: Sleep/Wake step (change on characters componentsToUpdate list) when health changes

                // FIXME: Use stats instead (stats.maxHealth)
                if (character.health < character.stats.health.curMax) {

                    this.nextTick -= delta;
                    if (this.nextTick <= 0) {

                        this.nextTick = this.tickTime;

                        let newHealth = character.health + character.stats.health.curMax * 0.01 * character.stats.con.cur;
                        newHealth = parseInt(newHealth, 10);
                        if (newHealth > character.stats.health.curMax) {
                            newHealth = character.stats.health.curMax;
                        }

                        this.Log(`Regen character health from ${character.health} to ${newHealth}`);
                        character.health = newHealth;

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

            unload() {
                server.handler(EVT_REGENERATE).unset();
            }
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
