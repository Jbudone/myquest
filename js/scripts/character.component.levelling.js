define(['loggable', 'component'], (Loggable, Component) => {

    const GainXPEvt     = 'GainedXP',
        GainLevelEvt    = 'GainedLevel',
        UpdatedLevelEvt = 'UpdatedLevel',
        DeathEvt        = 'die',
        Rules           = Resources.rules,
        UI              = The.UI;


    let staticInit = function() {};
    let server;
    if (!Env.isServer) {

        server = The.scripting.server;
        staticInit = function() {

            server.registerHandler(EVT_UPDATE_LEVEL, 'character.level');
            server.handler(EVT_UPDATE_LEVEL).set(function(evt, data) {
                UI.postMessage(`Ding! ${data.entityId} levelled up to ${data.level}`, MESSAGE_INFO);
                The.area.movables[data.entityId].character.doHook(UpdatedLevelEvt).post(data);
            });

            // FIXME: Need to static unload when unloading all levelling components (zoning out)

            staticInit = function(){};
        };
    }

    const Levelling = function(character) {

        Component.call(this, 'levelling');

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

        // Common serialization
        this.commonSerialize = () => {

            const data = {
                level: this.level,
                XP: this.XP,
                achievedXP: this.achievedXP,
                achievedLevel: this.achievedLevel
            };

            return data;
        };

        this.commonRestore = (component) => {

            this.level         = component.level;
            this.XP            = component.XP;
            this.achievedXP    = component.achievedXP;
            this.achievedLevel = component.achievedLevel;

            levelRules = Rules.level[this.level];
        };

        this.nextLevelXP = () => levelRules.nextLevelXP;

        this.server = {

            initialize() {

                character.hook(GainXPEvt, this).after(function(data){
                    this.Log(`Woahh I just gained some XP ${data.XP}`);

                    if (!levelRules.nextLevelXP) {
                        this.Log("Looks like I'm at the max level..");
                        return;
                    }

                    const prevXP = this.XP,
                        prevLevel = this.level;
                    this.XP += data.XP;

                    let increasedMaxXP = true;
                    if (
                        this.level < this.achievedLevel || // At least a level behind
                        (
                            // Same level but not the achieved XP
                            this.level === this.achievedLevel &&
                            this.XP <= this.achievedXP
                        )
                    )
                    {
                        increasedMaxXP = false;
                    }

                    if (increasedMaxXP) {
                        this.achievedXP = this.XP;
                    }


                    if (this.XP >= levelRules.nextLevelXP) {

                        ++this.level;
                        this.XP = this.XP - levelRules.nextLevelXP;
                        levelRules = Rules.level[this.level];


                        if (increasedMaxXP) {
                            // FIXME: Levelup!
                            this.achievedLevel = this.level;
                            this.achievedXP = this.XP;
                        }

                        character.entity.page.broadcast(EVT_UPDATE_LEVEL, {
                            entityId: character.entity.id,
                            level: this.level,
                            XP: this.XP
                        });
                    } else {

                        if (character.entity.player) {
                            character.entity.player.send(EVT_UPDATE_XP, {
                                XP: this.XP
                            });
                        }
                    }

                    this.Log(`You gained some XP: (Level ${prevLevel}, XP ${prevXP}) => (Level ${this.level}, XP ${this.XP} / ${levelRules.nextLevelXP}); achieved: ${this.achievedLevel} level  ${this.achievedXP} XP`);
                });

                character.hook(DeathEvt, this).after(function(advocate){

                    this.Log("You just died!", LOG_DEBUG);

                    // Lose XP
                    if (levelRules.canLoseXP) {
                        this.Log("Taking away some of your hard earned XP");

                        // FIXME: Don't you dare leave this -- need to calculate lost XP based off level in gamerules
                        const prevLevel = this.level,
                            prevXP = this.XP;

                        const loseXP = 20;
                        let XP = this.XP - loseXP;
                        if (XP < 0) {
                            this.Log("Dropping your level");

                            // Need to drop a level
                            --this.level;
                            levelRules = Rules.level[this.level];
                            this.XP = levelRules.nextLevelXP + XP;
                            assert(this.XP >= 0, "We dropped enough XP to drop more than one level!");

                            character.entity.page.broadcast(EVT_UPDATE_LEVEL, {
                                entityId: character.entity.id,
                                level: this.level,
                                XP: this.XP
                            });
                        } else {

                            if (character.entity.player) {
                                character.entity.player.send(EVT_UPDATE_XP, {
                                    XP: this.XP
                                });
                            }
                        }

                        this.Log(`You lost some XP: (Level ${prevLevel}, XP ${prevXP}) => (Level ${this.level}, XP ${this.XP} / ${levelRules.nextLevelXP}); achieved: ${this.achievedLevel} level  ${this.achievedXP} XP`);
                    }
                });

                levelRules = Rules.level[this.level];
            },

            netSerialize() {
                return this.commonSerialize();
            },

            serialize() {
                return this.commonSerialize();
            },

            restore(component) {
                this.commonRestore(component);
            }
        };

        this.client = {

            initialize() {

                staticInit();

                character.hook(UpdatedLevelEvt, this).after(function(data){

                    let increasedMaxXP = true;
                    if (
                        data.level < this.achievedLevel || // At least a level behind
                        (
                            // Same level but not the achieved XP
                            data.level === this.achievedLevel &&
                            data.XP <= this.achievedXP
                        )
                    )
                    {
                        increasedMaxXP = false;
                    }

                    this.level = data.level;
                    this.XP    = data.XP;
                    levelRules = Rules.level[this.level];

                    if (increasedMaxXP) {
                        this.achievedXP = this.XP;
                        this.achievedLevel = this.level;
                    }

                    this.Log(`Woahhh I just levelled up! ${data.level}`);
                    UI.postMessage(`  Zomg the levelup is for me! ${this.level} / ${this.achievedLevel}`);

                    if (increasedMaxXP) {
                        UI.postMessage(levelRules.message);
                    } else {
                        UI.postMessage("Just catching up to my old level..");
                    }
                });

                server.registerHandler(EVT_UPDATE_XP, 'character.levelling');
                server.handler(EVT_UPDATE_XP).set((evt, data) => {

                    this.XP = data.XP;
                    if (this.XP > this.achievedXP) {
                        this.achievedXP = this.XP;
                    }
                    
                    UI.postMessage(`Yay, XP!  ${this.XP} / ${this.achievedXP}`);
                });

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
                character.hook(UpdatedLevelEvt, this).remove();
                server.handler(EVT_UPDATE_XP).unset();
            }
        };
    };


    Levelling.prototype = Object.create(Component.prototype);
    Levelling.prototype.constructor = Levelling;

    const initialState = {
        level: 1,
        XP: 0,
        achievedXP: 0,
        achievedLevel: 1
    };

    return {
        name: "Levelling",
        newInstance: function(character){ return new Levelling(character); },
        initialState: initialState
    };
});
