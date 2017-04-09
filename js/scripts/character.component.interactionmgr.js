define(['loggable', 'component', 'scripts/scriptFSM'], (Loggable, Component, FSM) => {

    const Interactions = Resources.interactions;

    let server, UI, User;
    if (!Env.isServer) {
        server = The.scripting.server;
        UI     = The.UI;
        User   = The.user;
    }

    const Interaction = function(character, id) {

        const interactionRef = Interactions[id].fsm;
        FSM.call(this, id, interactionRef, character);

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

    Interaction.prototype = Object.create(FSM.prototype);
    Interaction.prototype.constructor = Interaction;

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

                const result = interaction.input(key);

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

            interact(interactableID, key) {

                let interaction = this.interactions[interactableID];
                if (!interaction) {
                    interaction = new Interaction(character, interactableID);
                    this.interactions[interactableID] = interaction;
                }

                interaction.input(key);
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
