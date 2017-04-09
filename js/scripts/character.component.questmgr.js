define(['loggable', 'component', 'scripts/scriptFSM'], (Loggable, Component, FSM) => {

    const QuestEvt = 'QuestEvt',
        Quests     = Resources.quests;

    const Quest = function(character, id) {

        const questRef = Quests[id];
        FSM.call(this, id, questRef.fsm, character);

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

    Quest.prototype = Object.create(FSM.prototype);
    Quest.prototype.constructor = Quest;

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
