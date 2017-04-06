define(['loggable', 'component'], (Loggable, Component) => {

    const Interactions = Resources.interactions;

    let server, UI;
    if (!Env.isServer) {
        server = The.scripting.server;
        UI     = The.UI;
    }

    const Interaction = function(character, id) {

        const interactionRef = Interactions[id];
        this.interactionRef = interactionRef;
        this.state = 0;
        this.subState = 0; // Processing an array within a state

        this.transition = (state) => {
            this.state = state;
            this.subState = 0;
        };

        this.execute = (execution) => {

            if (Env.isServer) {
                // Handle Quest key
                if (execution.questKey) {
                    const questKey = execution.questKey;
                    character.doHook('QuestEvt').post({
                        id: questKey.id,
                        value: questKey.value
                    });
                }
            } else {

                if (execution.speak) {
                    UI.postMessage(execution.speak);
                    UI.interaction(id, execution.speak);
                }
                
                if (execution.message) {
                    UI.postMessage(execution.message);
                }
            }
        };

        if (!Env.isServer) {
            this.processResult = (stateInfo) => {
                const fsm = this.interactionRef.fsm;

                let execute = null;
                if
                (
                    this.state !== stateInfo.state ||
                    this.subState !== stateInfo.subState
                )
                {
                    this.state = stateInfo.state;
                    this.subState = stateInfo.subState;

                    const state = fsm.states[this.state];
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

        this.interact = (key) => {
            // TODO: Magic here (fetch next FSM node, execute, return reply)

            const fsm = this.interactionRef.fsm;

            let state = fsm.states[this.state];

            let execute = null;

            // TODO: Try to go to next state

            if (state.execution.multipleExecution) {
                // This is a multiple execution state
                // Perhaps our subState hasn't reached the end yet
                const executions      = state.execution.multipleExecution.executions,
                    transitionToState = state.execution.multipleExecution.transitionToState;

                execute = executions[this.subState];
                ++this.subState;

                if (this.subState >= executions.length) {
                    this.transition(transitionToState);
                }
            } else {
                // TODO: Regular FSM logic
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

            /*
 "fsm": {
            "states": [
                {
                    "execution": {
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
                    },
                    "transitions": []
                }
            ]
        }
             */
        };


        this.serialize = () => {
            const data = {
                state: this.state,
                subState: this.subState
            };

            return data;
        };

        this.restore = (component) => {
            this.state = component.state;
            this.subState = component.subState;
        };
    };

    const InteractionMgr = function(character) {

        Component.call(this, 'interactionmgr');

        extendClass(this).with(Loggable);

        this.setLogGroup('Component');
        this.setLogPrefix(`InteractionMgr: ${character.entity.id}`);

        this.interactions = {};

        this.server = {

            initialize() {

            },

            interact(id, key) {

                let interaction = this.interactions[id];
                if (!interaction) {
                    interaction = new Interaction(character, id);
                    this.interactions[id] = interaction;
                }

                const result = interaction.interact();

                character.entity.player.send(EVT_INTERACT, {
                    id: id,
                    result: result
                });

                return result;
            },

            serialize() {
                const data = {
                    interactions: {}
                };

                _.each(this.interactions, (interaction, id) => {
                    data.interactions[id] = interaction.serialize();
                });

                return data;
            },

            restore(component) {

                _.each(component.interactions, (compInteraction, id) => {
                    const interaction = new Interaction(character, id);
                    interaction.restore(compInteraction);

                    this.interactions[id] = interaction;
                });
            }
        };

        this.client = {

            initialize() {

                server.registerHandler(EVT_INTERACT, 'character.interactionmgr');
                server.handler(EVT_INTERACT).set((evt, data) => {
                    const {id, result} = data;

                    let interaction = this.interactions[id];
                    if (!interaction) {
                        interaction = new Interaction(character, id);
                        this.interactions[id] = interaction;
                    }

                    interaction.processResult(result);
                });
            },

            unload() {
                server.handler(EVT_INTERACT).unset();
            },

            interact(interactableID) {

                let interaction = this.interactions[interactableID];
                if (!interaction) {
                    interaction = new Interaction(character, interactableID);
                    this.interactions[interactableID] = interaction;
                }

                interaction.interact();
            },

            simpleInteract(interactionID) {

                let interactable = Resources.interactables.list[interactionID],
                    args = interactable.args;

                if (args.description) {
                    UI.postMessage(args.description);
                }
            }
        };
    };


    InteractionMgr.prototype = Object.create(Component.prototype);
    InteractionMgr.prototype.constructor = InteractionMgr;

    const initialState = {
        interactions: {}
    };

    return {
        name: "InteractionManager",
        newInstance: function(character){ return new InteractionMgr(character); },
        initialState: initialState
    };
});
