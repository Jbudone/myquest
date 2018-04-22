define(['loggable', 'component'], (Loggable, Component) => {

    const GainXPEvt     = 'GainedXP',
        GainLevelEvt    = 'GainedLevel',
        UpdatedLevelEvt = 'UpdatedLevel',
        DeathEvt        = 'die',
        Rules           = Resources.rules,
        UI              = The.UI;


    let server;
    if (!Env.isServer) {
        server = The.scripting.server;
    }

    const Levelling = function(character) {

        Component.call(this, 'levelling');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`Levelling: ${character.entity.id}`);

        character.addProperty('level', 'level', this, 0, true, Env.isServer ? null : (oldLevel, newLevel) => {
        
            const data = {
                    entityId: character.entity.id,
                    level: newLevel,
                    XP: this.XP
                };
            UI.postMessage(`Ding! ${data.entityId} levelled up to ${newLevel}`, MESSAGE_INFO);
            The.area.movables[data.entityId].character.doHook(UpdatedLevelEvt).post(data);
        });

        character.addProperty('XP', 'XP', this, 0, true, Env.isServer ? null : (oldXP, newXP) => {

            if (this.XP > this.achievedXP) {
                this.achievedXP = this.XP;
            }

            UI.postMessage(`Yay, XP!  ${this.XP} / ${this.achievedXP}`);
        }, true);

        // If we lose XP/Levels for what ever reason (*cough* dying *cough*) we want to keep track of what XP/Level
        // we've actually achieved. This is mostly important for visual effects (visual cue that we're regaining lost
        // XP), and disallowing doubling up on level rewards. We could arguably wield items with level requirements that
        // we've already achieved
        this.achievedXP = 0;
        this.achievedLevel = 0;
        this.enabled = true;

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
        };

        this.nextLevelXP = () => Rules.level[this.level].nextLevelXP;

        this.server = {

            initialize() {

                character.hook(GainXPEvt, this).after(function(data){
                    if (!this.enabled) return;

                    this.Log(`Woahh I just gained some XP ${data.XP}`);

                    let levelRules = Rules.level[this.level];
                    if (!levelRules.nextLevelXP) {
                        this.Log("Looks like I'm at the max level..");
                        return;
                    }

                    const prevXP = this.XP,
                        prevLevel = this.level;

                    let newXP = this.XP + data.XP;

                    let increasedMaxXP = true;
                    if (
                        this.level < this.achievedLevel || // At least a level behind
                        (
                            // Same level but not the achieved XP
                            this.level === this.achievedLevel &&
                            newXP <= this.achievedXP
                        )
                    )
                    {
                        increasedMaxXP = false;
                    }

                    if (increasedMaxXP) {
                        this.achievedXP = newXP;
                    }


                    if (newXP >= levelRules.nextLevelXP) {

                        // NOTE: We want XP to netSerialize before level (for callback ordering)
                        const newLevel = this.level + 1;
                        this.XP = newXP - levelRules.nextLevelXP;
                        levelRules = Rules.level[newLevel];
                        this.level = newLevel;

                        if (increasedMaxXP) {
                            // FIXME: Levelup!
                            this.achievedLevel = this.level;
                            this.achievedXP = this.XP;

                            // Level stat increases
                            if (levelRules.bonuses) {
                                for (const bonusKey in levelRules.bonuses) {
                                    const stat = character.stats[bonusKey],
                                        statInc = levelRules.bonuses[bonusKey];
                                    if (stat.curMax === stat.max) {
                                        if (stat.cur === stat.curMax) {
                                            stat.cur += statInc;
                                        }
                                        stat.curMax += statInc;
                                    }
                                    stat.max += statInc;
                                }
                            }
                        }
                    } else {
                        this.XP = newXP;
                    }

                    this.Log(`You gained some XP: (Level ${prevLevel}, XP ${prevXP}) => (Level ${this.level}, XP ${this.XP} / ${levelRules.nextLevelXP}); achieved: ${this.achievedLevel} level  ${this.achievedXP} XP`);
                });

                character.hook(DeathEvt, this).after(function(advocate){
                    if (!this.enabled) return;

                    this.Log("You just died!", LOG_DEBUG);
                    let levelRules = Rules.level[this.level];

                    // Lose XP
                    if (levelRules.canLoseXP) {
                        this.Log("Taking away some of your hard earned XP");

                        // FIXME: Don't you dare leave this -- need to calculate lost XP based off level in gamerules
                        const prevLevel = this.level,
                            prevXP = this.XP;

                        const loseXP = Math.ceil(levelRules.nextLevelXP * 0.1);
                        let XP = this.XP - loseXP;
                        if (XP < 0) {
                            this.Log("Dropping your level");

                            // Need to drop a level
                            // NOTE: We want XP to netSerialize before level (for callback ordering)
                            const newLevel = this.level - 1;
                            levelRules = Rules.level[newLevel];
                            this.XP = levelRules.nextLevelXP + XP;
                            assert(this.XP >= 0, "We dropped enough XP to drop more than one level!");
                            this.level = newLevel;
                        }

                        this.Log(`You lost some XP: (Level ${prevLevel}, XP ${prevXP}) => (Level ${this.level}, XP ${this.XP} / ${levelRules.nextLevelXP}); achieved: ${this.achievedLevel} level  ${this.achievedXP} XP`);
                    }
                });

            },

            netSerialize() {
                return this.commonSerialize();
            },

            serialize() {
                return this.commonSerialize();
            },

            restore(component) {
                // NOTE: We're going to serialize XP/level separately, no need to netSerialize too
                character.setNetSerializeEnabled(false);
                this.commonRestore(component);
                character.setNetSerializeEnabled(true);
            },

            firstTimeSetup() {
                this.level         = 1;
                this.XP            = 0;
                this.achievedXP    = 0;
                this.achievedLevel = 1;
            }
        };

        this.client = {

            initialize() {

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

                    let levelRules = Rules.level[this.level];

                    if (increasedMaxXP) {
                        this.achievedXP = this.XP;
                        this.achievedLevel = this.level;
                    }

                    FX.event('levelup', $(this), {});
                    this.Log(`Woahhh I just levelled up! ${data.level}`);
                    UI.postMessage(`  Zomg the levelup is for me! ${this.level} / ${this.achievedLevel}`);

                    if (increasedMaxXP) {
                        UI.postMessage(levelRules.message);
                    } else {
                        UI.postMessage("Just catching up to my old level..");
                    }
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
