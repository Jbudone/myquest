define(['loggable', 'component'], (Loggable, Component) => {

    const QuestEvt = 'QuestEvt',
        Quests     = Resources.quests;

    const Quest = function(character, id) {
        const questRef = Quests[id];
        this.questRef = questRef;
        this.state = 0;

        this.transition = (state) => {
            this.state = state;
        };

        this.execute = (execution) => {
            execution.forEach((execute) => {
                if (execute.evt) {
                    const evt = execute.evt;
                    if (evt === 'BuffEvt') {
                        const buff = Resources.buffs[execute.buff];
                        character.doHook('BuffEvt').post({
                            buff: buff
                        });
                    }
                }
            });
        };

        this.input = (key) => {
            // TODO: Magic here (fetch next FSM node, execute, return reply)

            Log(`Quest ${id} Received key ${key}`);
            const fsm = this.questRef.fsm;

            let state = fsm.states[this.state];

            let execution = null;

            // TODO: Try to go to next state
            state.transitions.forEach((transition) => {
                if (transition.key === key) {

                    // FIXME: Matches conditions?
                    let shouldTransition = true;
                    if (transition.conditions) {
                        const conditions = transition.conditions;
                        conditions.forEach((condition) => {
                            const { variable, op, expectedValue } = condition;

                            // Matches condition?
                            let value;
                            if (variable === "CHARACTER_LEVEL") {
                                value = character.charComponent('levelling').level;
                            } else {
                                throw Err(`Unknown variable ${variable}`);
                            }

                            let result;
                            if (op === "GTEQ") {
                                result = value >= expectedValue;
                            } else {
                                throw Err(`Unknown op ${op}`);
                            }

                            if (!result) {
                                shouldTransition = false;
                            }
                        });
                    }

                    if (shouldTransition) {
                        Log(`Quest ${id} Transitioning from state ${this.state} to ${transition.state}`);
                        this.transition(transition.state);
                        state = fsm.states[this.state];
                        execution = state.execution;

                        if (execution) {
                            this.execute(execution);
                        }
                    } else {
                        Log(`Quest ${id} Could not transition from state ${this.state} to ${transition.state} (conditions failed)`);
                    }
                }
            });

            /*
 "fsm": {
            "states": [
                {
                    "execution": [
                        {
                            "evt": 'BuffEvt',
                            "buff": KingBadBuff
                        }
                    ],
                    "transitions": [
                        {
                            "key": "talkedToKing-Good",
                            "conditions": [
                                "variable": CHARACTER_LEVEL,
                                "op": GTEQ,
                                "value": 2
                            ],
                            "state": 1
                        }
                    ]
                },

                {
                    "execution": [
                        {
                            "evt": 'BuffEvt',
                            "buff": KingGoodBuff
                        }
                    ],
                    "transitions": [
                        {
                            "key": "talkedToKing-Bad",
                            "state": 0
                        }
                 
                }
            ]
        }
             */
        };


        this.serialize = () => {
            const data = {
                state: this.state,
            };

            return data;
        };

        this.restore = (component) => {
            this.state = component.state;
        };
    };

    const QuestMgr = function(character) {

        Component.call(this, 'questmgr');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`QuestMgr: ${character.entity.id}`);

        this.quests = {};

        this.server = {

            initialize() {

                character.hook(QuestEvt, this).after(function(data){

                    // Received quest key from somewhere
                    const id = data.id,
                        value = data.value;

                    // NOTE: Quests should begin in an initial state which is not executed initially
                    // FIXME: When we eventually preprocess/analyze/compile FSMs, we should ensure there is not
                    // execution in the initial state
                    let quest = this.quests[id];
                    if (!quest) {
                        quest = new Quest(character, id);
                        this.quests[id] = quest;
                    }

                    quest.input(value);
                });
            },

            serialize() {
                const data = {
                    quests: {}
                };

                _.each(this.quests, (quest, id) => {
                    data.quests[id] = quest.serialize();
                });

                return data;
            },

            restore(component) {

                _.each(component.quests, (compQuest, id) => {
                    const quest = new Quest(character, id);
                    quest.restore(compQuest);

                    this.quests[id] = quest;
                });
            }
        };

        this.client = {

            initialize() {

            }
        };
    };


    QuestMgr.prototype = Object.create(Component.prototype);
    QuestMgr.prototype.constructor = QuestMgr;

    const initialState = {
        quests: {}
    };

    return {
        name: "QuestManager",
        newInstance: function(character){ return new QuestMgr(character); },
        initialState: initialState
    };
});
