define(['SCRIPTINJECT', 'loggable', 'scripts/character'], (SCRIPTINJECT, Loggable, Character) => {

    /* SCRIPTINJECT */

    const Talkto = function() {

        extendClass(this).with(Loggable);
        this.setLogGroup('Interactable');
        this.setLogPrefix('Interactable');

        this.name           = "interactable";
        this.static         = false;
        const _interactable = this;
        let _script         = null;

        this.server = {
            initialize(name, character, args) {
                _script = this;
                return _interactable.interact(name, character, args);
            },

            interact: (name, character, args) => {
                if (!(character instanceof Character)) return new Error("Character is not a character");
                if (!_.isObject(args)) return new Error("Provided args is not an object");
                if (character.alive !== true) return new Error("Character is not alive");

                // Is this a conversation tree? Or just an array of messages
                console.log(args);
                if (args.interaction) {
                    const interactionMgr = character.charComponent('interactionmgr');

                    const reply = interactionMgr.interact(name); // TODO: Eventually include args for particular phrases

                    if (reply) {

                        character.entity.player.send(EVT_INTERACT, {
                            base: 'talkto',
                            character: character.entity.id,
                            message: reply,
                            name: name
                        });
                    }
                } else {

                    if (!args.hasOwnProperty('messages')) return new Error("Arguments does not provide messages");
                    if (!_.isArray(args.messages)) return new Error("Description is not a string");

                    redis.getValue(name, character.entity.id).then(function(value){

                        if (value === null) {
                            // Key was not set yet, this is our first interaction with this script
                            // NOTE: unless the interaction has expired already
                            value = 0;
                        } else {
                            if (!value.hasOwnProperty('interaction')) throw new Error("Interaction not provided for ("+name+", "+character.entity.id+")");
                            value = parseInt(value.interaction, 10);
                            if (!_.isFinite(value) || isNaN(value)) throw new Error("Interaction value is not a number");
                        }

                        // Value is the 

                        var message   = args.messages[value],
                            nextValue = (value + 1) % args.messages.length;
                        redis.setValue(name, character.entity.id, 'interaction', nextValue);

                        character.entity.player.send(EVT_INTERACT, {
                            base: 'talkto',
                            character: character.entity.id,
                            message: message,
                            name: name
                        });

                    }, function(err){ errorInGame(err);
                    }).catch(Error, function(err){ errorInGame(err);
                    }).error(function(){ errorInGame(err); });
                }
            }
        };

        this.client = {
            initialize: function(name, character, args){
                _script = this;
                return this.interact.bind(_interactable)(name, character, args);
            },

            interact: function(name, character, args){
                if (character.entity.id === The.player.id) {
                    UI.postMessage(args.message);
                    UI.interaction(name, args.message);
                } else {
                    UI.postMessage("He ponders at that thing: "+ args.message);
                }
            }
        };

    };

    return {
        handledBy: CLIENT_AND_SERVER,
        dynamic: true,
        base: Talkto
    };
});
