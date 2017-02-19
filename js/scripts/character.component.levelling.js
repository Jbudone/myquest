define(['SCRIPTINJECT', 'loggable', 'component'], (SCRIPTINJECT, Loggable, Component) => {

    /* SCRIPTINJECT */

    const GainXPEvt = 'GainedXP',
        GainLevelEvt = 'GainedLevel';

    if (!Env.isServer) {

        server.registerHandler(EVT_GAIN_LEVEL, 'character.level');
        server.handler(EVT_GAIN_LEVEL).set(function(evt, data) {
            UI.postMessage(`Ding! ${data.entityId} levelled up to ${data.level}`, MESSAGE_INFO);
            The.area.movables[data.entityId].character.doHook(GainLevelEvt).post(data);
        });
    }


    const Levelling = function(character) {

        Component.call(this);

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`Levelling: ${character.entity.id}`);

        this.level = 0;
        this.XP = 0;

        // If we lose XP/Levels for what ever reason (*cough* dying *cough*) we want to keep track of what XP/Level
        // we've actually achieved. This is mostly important for visual effects (visual cue that we're regaining lost
        // XP), and disallowing doubling up on level rewards. We could arguably wield items with level requirements that
        // we've already achieved
        this.achievedXP = 0;
        this.achievedLevel = 0;

        let levelRules = null;

        this.server = {

            initialize() {

                character.hook(GainXPEvt, this).after(function(data){
                    this.Log(`Woahh I just gained some XP ${data.XP}`);
                    this.XP += data.XP;

                    if (this.XP >= levelRules.nextLevelXP) {
                        // FIXME: Levelup!

                        ++this.level;
                        this.XP = 0;

                        levelRules = Rules.level[this.level];
                        character.entity.page.broadcast(EVT_GAIN_LEVEL, {
                            entityId: character.entity.id,
                            level: this.level
                        });
                    }
                });

                levelRules = Rules.level[this.level];
            }
        };

        this.client = {

            initialize() {

                character.hook(GainLevelEvt, this).after(function(data){

                    this.level = data.level;

                    levelRules = Rules.level[this.level];

                    this.Log(`Woahhh I just levelled up! ${data.level}`);
                    UI.postMessage(`  Zomg the levelup is for me!`);
                    UI.postMessage(levelRules.message);
                });

                levelRules = Rules.level[this.level];
            },

            restore(component) {
                UI.postMessage("Restoring level from previous character!");
                this.level = component.level;
                this.XP = component.XP;

                levelRules = Rules.level[this.level];
            },
        };
    };


    Levelling.prototype = Object.create(Component.prototype);
    Levelling.prototype.constructor = Levelling;

    return Levelling;
});
