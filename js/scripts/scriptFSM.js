define(() => {

    const ScriptFSM = function(id, fsm, character) {

        this.id = id;
        this.fsm = fsm;
        this.state = 0;
        this.subState = -1; // Processing an array within a state

        this.transition = (state) => {
            this.state = state;
            this.subState = -1;
        };

        if (!Env.isServer) {
            this.processResult = (stateInfo) => {

                let execute = null;
                if
                (
                    this.state !== stateInfo.state ||
                    this.subState !== stateInfo.subState
                )
                {
                    this.state = stateInfo.state;
                    this.subState = stateInfo.subState;

                    const state = this.fsm.states[this.state];
                    let execute = null;
                    if (state.execution.multipleExecution) {
                        const executions = state.execution.multipleExecution.executions;
                        execute = executions[this.subState];
                    } else {

                    }

                    if (execute) {
                        this.execute(execute);
                    }
                }
            };
        }

        this.execute = (execution) => {

            let UI, User;
            if (!Env.isServer) {
                UI     = The.UI;
                User   = The.user;
            }

            if (Env.isServer) {
                // Handle Quest key
                if (execution.questKey) {
                    const questKey = execution.questKey;
                    character.doHook('QuestEvt').post({
                        id: questKey.id,
                        value: questKey.value
                    });
                }

                if (execution.evt) {
                    const evt = execution.evt;
                    if (evt.evt === 'BuffEvt') {
                        const buff = Resources.buffs[evt.buff];
                        character.doHook('BuffEvt').post({
                            buff: buff
                        });
                    }
                }
            } else {

                if (execution.speak) {
                    UI.postMessage(execution.speak);
                    UI.interaction(this.id, execution.speak);
                }
                
                if (execution.message) {
                    UI.postMessage(execution.message);
                }

                if (execution.dialog) {
                    UI.postDialogOptions(execution.dialog, (dialog) => {
                        User.clickedInteractable(id, dialog.key);
                    });
                }
            }
        };

        this.input = (key) => {
            let execute = null;

            // TODO: Try to go to next state

            let state = this.fsm.states[this.state];
            if (state.execution.multipleExecution) {
                // This is a multiple execution state
                // Perhaps our subState hasn't reached the end yet
                const executions      = state.execution.multipleExecution.executions,
                    transitionToState = state.execution.multipleExecution.transitionToState;

                ++this.subState;
                if (this.subState >= executions.length) {
                    this.transition(transitionToState);
                    this.input(key);
                } else {
                    execute = executions[this.subState];
                }

                /*
                    "multipleExecution": {
                        "executions": [
                            { "message": "Hullo" },
                            { "message": "How are you" },
                            { "message": "I too am well" },
                            {
                                "message": "LOLWUTWUT",
                                "questEvent": {
                                    "id": "kinglyquest",
                                    "value": "talkedToKing-13"
                                }
                            }
                        ],
                        "transitionToState": 0
                    }
                */

            } else {

                if ('transitionToState' in state) {
                    this.transition(state.transitionToState);
                    state = this.fsm.states[this.state];
                    execute = state.execution;
                } else {

                    // Try to transition
                    let transitioned = false;
                    for (let i = 0; i < state.transitions.length; ++i) {
                        const transition = state.transitions[i];
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
                                Log(`Interaction ${id} Transitioning from state ${this.state} to ${transition.state}`);
                                this.transition(transition.state);
                                state = this.fsm.states[this.state];
                                execute = state.execution;
                                transitioned = true;
                                break;
                            }
                        }
                    }

                    if (!transitioned) {
                        execute = state.execution;
                    }
                }


                /*
                    "execution": {
                        "speak": "Which pill do you pick?",
                        "dialog": [
                            {
                                "key": "redPill",
                                "message": "Pick the Red Pill"
                            },
                            {
                                "key": "bluePill",
                                "message": "Pick the Blue Pill"
                            }
                        ]
                    },
                */
            }

            if (execute) {
                // TODO: Execute shit here
                this.execute(execute);
            }

            let result = {
                state: this.state,
                subState: this.subState
            };
            return result;
        }
    };

    return ScriptFSM;
});
