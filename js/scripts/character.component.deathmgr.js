define(['SCRIPTINJECT', 'loggable', 'component'], (SCRIPTINJECT, Loggable, Component) => {

    /* SCRIPTINJECT */

    const DeathEvt = 'die',
        RespawningEvt = 'respawning';

    if (!Env.isServer) {

        /*
        server.registerHandler(EVT_GAIN_LEVEL, 'character.level');
        server.handler(EVT_GAIN_LEVEL).set(function(evt, data) {
            UI.postMessage(`Ding! ${data.entityId} levelled up to ${data.level}`, MESSAGE_INFO);
            The.area.movables[data.entityId].character.doHook(GainLevelEvt).post(data);
        });
        */
    }

    const DeathMgr = function(character) {

        Component.call(this);

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`DeathMgr: ${character.entity.id}`);

        this.server = {

            initialize() {

                character.hook(RespawningEvt, this).after(function(data){

                    this.Log("You just died!", LOG_DEBUG);
                    character.doHook('BuffEvt').post({
                        buff: Buffs.DeathSickness
                    });
                });
            }
        };

        this.client = {

            initialize() {

                character.hook(RespawningEvt, this).after(function(data){
                    UI.postMessage(`Alas, I have died!`, MESSAGE_BAD);
                });
            },

            restore(component) {

            },
        };
    };


    DeathMgr.prototype = Object.create(Component.prototype);
    DeathMgr.prototype.constructor = DeathMgr;

    const initialState = {

    };

    return {
        newInstance: function(character){ return new DeathMgr(character); },
        initialState: initialState
    };
});
