define(['SCRIPTINJECT', 'loggable', 'component'], (SCRIPTINJECT, Loggable, Component) => {

    /* SCRIPTINJECT */

    const DeathEvt    = 'die',
        RespawningEvt = 'respawning';

    const DeathMgr = function(character) {

        Component.call(this, 'deathmgr');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`DeathMgr: ${character.entity.id}`);

        this.server = {

            initialize() {

                character.hook(RespawningEvt, this).after(function(data){

                    this.Log("You just respawned!", LOG_DEBUG);
                    character.doHook('BuffEvt').post({
                        buff: Buffs.DeathSickness
                    });
                });

                character.hook(DeathEvt, this).after(function(advocate){

                    this.Log("You just died!", LOG_DEBUG);

                    // Drop items
                    console.log("Dropping inventory");
                    const inventory = character.inventory;
                    for (let i = 0; i < inventory.slots.length; ++i) {
                        inventory.dropSlot(i);
                    }
                });
            }
        };

        this.client = {

            initialize() {

                character.hook(RespawningEvt, this).after(function(data){
                    UI.postMessage(`Alas, I have died!`, MESSAGE_BAD);
                });
            }
        };
    };


    DeathMgr.prototype = Object.create(Component.prototype);
    DeathMgr.prototype.constructor = DeathMgr;

    const initialState = {

    };

    return {
        name: "DeathManager",
        newInstance: function(character){ return new DeathMgr(character); },
        initialState: initialState
    };
});
