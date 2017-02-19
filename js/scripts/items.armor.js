define(['SCRIPTINJECT', 'loggable', 'scripts/character'], function(SCRIPTINJECT, Loggable, Character){

    /* SCRIPTINJECT */

	var Armor = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Item');
		this.setLogPrefix('(Item) ');

		this.name   = "item";
		this.static = false;
		var _item   = this,
			_script = null;

		
		this.server = {
			initialize: function(name, character, args){
				_script = this;

				if (!(character instanceof Character)) return new UnexpectedError("Character is not a character");
				if (!_.isObject(args)) return new UnexpectedError("Provided args is not an object");
				if (character.alive !== true) return UnexpectedError("Character is not alive");
                if (!_.isNumber(args.action)) return new UnexpectedError("No action provided for armor");

                if (args.action === EVT_ACTIVATE) {
                    return this.wear.bind(_item)(name, character, args.args);
                } else if (args.action === EVT_DEACTIVATE) {
                    return this.takeOff.bind(_item)(name, character, args.args);
                } else {
                    return new UnexpectedError("Bad action provided");
                }
			},

            wear: function(name, character, args){
                // TODO: Add to character's stats

                console.log("WEARING ITEM FOR CHARACTER");
                //character.entity.page.broadcast(EVT_ACTIVATE, {
                //});
            },

            takeOff: function(name, character, args){
                console.log("TAKING ITEM OFF CHARACTER");
            }
		};

		this.client = {
			initialize: function(name, character, args){
				_script = this;

				if (!(character instanceof Character)) return new UnexpectedError("Character is not a character");
				if (!_.isObject(args)) return new UnexpectedError("Provided args is not an object");
				if (character.alive !== true) return UnexpectedError("Character is not alive");
                if (!_.isNumber(args.action)) return new UnexpectedError("No action provided for armor");

                if (args.action === EVT_ACTIVATE) {
                    return this.wear.bind(_item)(name, character, args.args);
                } else if (args.action === EVT_DEACTIVATE) {
                    return this.takeOff.bind(_item)(name, character, args.args);
                } else {
                    return new UnexpectedError("Bad action provided");
                }
			},

            /*
			heal: function(name, character, args){
				character.health = args.health;
				if (character.entity.id === The.player.id) {
					UI.postMessage("You healed up!");
				} else {
					UI.postMessage("He totally healed up!");
				}
			}
            */

            wear: function(name, character, args){
                console.log("WEARING ITEM FOR CHARACTER");
            },

            takeOff: function(name, character, args){
                console.log("TAKING ITEM OFF CHARACTER");
            }
		};

	};

	return Armor;
});
