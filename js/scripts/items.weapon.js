define(['SCRIPTINJECT', 'loggable', 'scripts/character'], function(SCRIPTINJECT, Loggable, Character){

    /* SCRIPTINJECT */

	var Weapon = function(){
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
                if (!_.isNumber(args.action)) return new UnexpectedError("No action provided for weapon");

                if (args.action === EVT_ACTIVATE) {
                    return this.wield.bind(_item)(name, character, args.args);
                } else if (args.action === EVT_DEACTIVATE) {
                    return this.unwield.bind(_item)(name, character, args.args);
                } else {
                    return new UnexpectedError("Bad action provided");
                }
			},

            wield: function(name, character, args){
                // TODO: Add to character's stats

                console.log("WIELDING ITEM FOR CHARACTER");
                //character.entity.page.broadcast(EVT_ACTIVATE, {
                //});
            },

            unwield: function(name, character, args){
                console.log("UNWIELDING ITEM OFF CHARACTER");
            }
		};

		this.client = {
			initialize: function(name, character, args){
				_script = this;

				if (!(character instanceof Character)) return new UnexpectedError("Character is not a character");
				if (!_.isObject(args)) return new UnexpectedError("Provided args is not an object");
				if (character.alive !== true) return UnexpectedError("Character is not alive");
                if (!_.isNumber(args.action)) return new UnexpectedError("No action provided for weapon");

                if (args.action === EVT_ACTIVATE) {
                    return this.wield.bind(_item)(name, character, args.args);
                } else if (args.action === EVT_DEACTIVATE) {
                    return this.unwield.bind(_item)(name, character, args.args);
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

            wield: function(name, character, args){
                console.log("WIELDING ITEM FOR CHARACTER");
            },

            unwield: function(name, character, args){
                console.log("UNWIELDING ITEM OFF CHARACTER");
            }
		};

	};

	return Weapon;
});
