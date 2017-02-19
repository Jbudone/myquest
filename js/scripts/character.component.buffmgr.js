define(['SCRIPTINJECT', 'loggable', 'component'], (SCRIPTINJECT, Loggable, Component) => {

    /* SCRIPTINJECT */

    const BuffEvt = 'BuffEvt';

    if (!Env.isServer) {
    }

    const Buff = function(buffRes) {
        this.buffRes = buffRes;
        this.base = new buffRes.base(); // FIXME: I wonder if we could get away with a completely static buff base?

        this.activate = (character) => {
            console.log("ACTIVATING BUFF");
            this.base.activate(character, buffRes.args);
        };
    };

    const BuffMgr = function(character) {

        Component.call(this);

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`BuffMgr: ${character.entity.id}`);

        this.buffs = [];

        this.addBuff = (buffRes) => {
            const buff = new Buff(buffRes);

            // TODO: What if we already have the buff? Should check if it stacks then stack accordingly
            this.buffs.push(buff);
            buff.activate(character);
        };

        this.server = {

            initialize() {

                character.hook(BuffEvt, this).after(function(data){
                    console.log("Buffing user!");
                    console.log(data);

                    // Forward Buff to player
                    if (character.entity.player) {

                        character.entity.player.send(EVT_BUFFED_PRIVATE, {
                            buff: data.buff.id
                        });
                    }

                    // TODO: (Possibly?) Broadcast Buff to everyone else -- Could have this as a property on buff to
                    // determine whether or not its worth broadcasting. Also could send different information



                    this.addBuff(data.buff);
                });
            }
        };

        this.client = {

            initialize() {

                character.hook(BuffEvt, this).after(function(data){
                    UI.postMessage(`Buffed`, MESSAGE_GOOD);
                });

                server.registerHandler(EVT_BUFFED_PRIVATE, 'character.buffmgr');
                server.handler(EVT_BUFFED_PRIVATE).set((evt, data) => {
                    UI.postMessage(`I have been Buffed`);
                    this.Log("I was just buffed yay!");
                    console.log(data);

                    const buff = Buffs[data.buff];
                    this.addBuff(buff);
                });
            },

            restore(component) {

            },
        };
    };


    BuffMgr.prototype = Object.create(Component.prototype);
    BuffMgr.prototype.constructor = BuffMgr;

    return BuffMgr;
});
