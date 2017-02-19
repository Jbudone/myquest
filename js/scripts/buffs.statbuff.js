define(['scripts/buffs.base'], function(BuffBase){

    const MAX_MULTIPLIER = "MAX_MULTIPLIER";

	const StatBuff = function() {

        BuffBase.call(this);
		
		this.server = {

			activate(character, args) {

                console.log("ACTIVATING STAT BUFF");
                for (let i = 0; i < args.stats.length; ++i) {
                    const statBuff = args.stats[i],
                        charStat = character.stats[statBuff.stat],
                        newMax = charStat.curMax * statBuff.amount;

                    charStat.curMax = parseInt(newMax, 10);
                    console.log("Buffing stat " + statBuff + " to " + charStat.curMax);

                    if (charStat.cur > charStat.curMax) {
                        charStat.cur = charStat.curMax;
                    }

                    console.log("Your " + statBuff + " is now " + charStat.cur);
                }

                /*
				var healTo = character.health + args.amt;
				if (healTo > character.entity.npc.health) healTo = character.entity.npc.health;
				character.health = healTo;

				character.entity.page.broadcast(EVT_USE_ITEM, {
					base: 'heal',
					character: character.entity.id,
					health: character.health,
					name: name
				});
                */
			}
		};

		this.client = {

			activate(character, args) {

                for (let i = 0; i < args.stats.length; ++i) {
                    const statBuff = args.stats[i],
                        charStat = character.stats[statBuff.stat];
                    charStat.curMax *= statBuff.amount;
                }
                /*
				character.health = args.health;
				if (character.entity.id === The.player.id) {
					UI.postMessage("You healed up!");
				} else {
					UI.postMessage("He totally healed up!");
				}
                */
			}
		};

        this.initialize(); // Setup from Base
	};

    StatBuff.prototype = Object.create(BuffBase.prototype);
    StatBuff.prototype.constructor = StatBuff;

	return StatBuff;
});
