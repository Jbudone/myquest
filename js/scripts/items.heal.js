define(['SCRIPTENV', 'loggable', 'scripts/character'], function(SCRIPTENV, Loggable, Character){

	eval(SCRIPTENV);

	var Heal = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Item');
		this.setLogPrefix('(Item) ');

		this.name   = "item";
		this.static = false;
		var _item   = this,
			_script = null;

		
		this.server = {
			initialize: function(character, args){
				_script = this;
				this.heal.bind(_item)(character, args);
			},

			heal: function(character, args){
				if (!(character instanceof Character)) return new UnexpectedError("Character is not a character");
				if (!_.isObject(args)) return new UnexpectedError("Provided args is not an object");
				if (!args.hasOwnProperty('amt')) return new UnexpectedError("Arguments does not provide amount");
				if (isNaN(args.amt)) return new UnexpectedError("Heal amount is not a number");
				if (character.alive !== true) return UnexpectedError("Character is not alive");

				var healTo = character.health + args.amt;
				if (healTo > character.entity.npc.health) healTo = character.entity.npc.health;
				character.health = healTo;

				character.entity.page.broadcast(EVT_USE_ITEM, {
					base: 'heal',
					character: character.entity.id,
					health: character.health
				});
			}
		};

		this.client = {
			initialize: function(character, args){
				_script = this;
				this.heal.bind(_item)(character, args);
			},

			heal: function(character, args){
				character.health = args.health;
				if (character.entity.id === The.player.id) {
					UI.postMessage("You healed up!");
				} else {
					UI.postMessage("He totally healed up!");
				}
			}
		};

	};

	return Heal;
});