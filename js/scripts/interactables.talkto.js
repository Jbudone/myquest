define(['SCRIPTENV', 'loggable', 'scripts/character'], function(SCRIPTENV, Loggable, Character){

	eval(SCRIPTENV);

	var Talkto = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Interactable');
		this.setLogPrefix('(Interactable) ');

		this.name           = "interactable";
		this.static         = false;
		var _interactable   = this,
			_script         = null;
		
		this.server = {
			initialize: function(name, character, args){
				_script = this;
				return this.interact.bind(_interactable)(name, character, args);
			},

			interact: function(name, character, args){
				if (!(character instanceof Character)) return new Error("Character is not a character");
				if (!_.isObject(args)) return new Error("Provided args is not an object");
				if (!args.hasOwnProperty('messages')) return new Error("Arguments does not provide messages");
				if (!_.isArray(args.messages)) return new Error("Description is not a string");
				if (character.alive !== true) return new Error("Character is not alive");

				redis.getValue(name, character.entity.id).then(function(value){

					if (value === null) {
						// Key was not set yet, this is our first interaction with this script
						// NOTE: unless the interaction has expired already
						value = 0;
					} else {
						if (!value.hasOwnProperty('interaction')) throw new Error("Interaction not provided for ("+name+", "+character.entity.id+")");
						value = parseInt(value.interaction);
						if (!_.isFinite(value) || isNaN(value)) throw new Error("Interaction value is not a number");
					}

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
		};

		this.client = {
			initialize: function(name, character, args){
				_script = this;
				return this.interact.bind(_interactable)(name, character, args);
			},

			interact: function(name, character, args){
				if (character.entity.id === The.player.id) {
					UI.postMessage(args.message);
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
