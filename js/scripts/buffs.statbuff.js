define(['scripts/buffs.base'], function(BuffBase){

    const MAX_MULTIPLIER = "MAX_MULTIPLIER";

	const StatBuff = function() {

        BuffBase.call(this);
		
		this.server = {

			activate(character, args) {

                const modified = {};

                for (let i = 0; i < args.stats.length; ++i) {
                    const statBuff = args.stats[i],
                        charStat   = character.stats[statBuff.stat],
                        curRatio   = charStat.cur / charStat.curMax;

                    let newMax = parseInt(charStat.curMax * statBuff.amount, 10),
                        newCur = parseInt(curRatio * newMax, 10);

                    // FIXME: Stats should probably have a more reasonable upperbound per stat
                    newMax = _.clamp(newMax, 1, Number.MAX_SAFE_INTEGER);
                    newCur = _.clamp(newCur, 1, Number.MAX_SAFE_INTEGER);


                    modified[statBuff.stat] = {
                        difference: (newMax - charStat.curMax),
                        curMax: newMax,
                        cur: newCur
                    };

                    charStat.curMax = newMax;
                    charStat.cur    = newCur;
                    console.log("Buffing stat " + statBuff.stat + " to " + charStat.curMax);

                    console.log("Your " + statBuff.stat + " is now " + charStat.cur);
                }

                return modified;

				// var healTo = character.health + args.amt;
				// if (healTo > character.entity.npc.health) healTo = character.entity.npc.health;
				// character.health = healTo;

				// character.entity.page.broadcast(EVT_USE_ITEM, {
				// 	base: 'heal',
				// 	character: character.entity.id,
				// 	health: character.health,
				// 	name: name
				// });
            },

            deactivate(character, args, modified) {

                const _modified = {};

                for (const statName in modified) {
                    const modifiedStat = modified[statName].difference,
                        charStat       = character.stats[statName],
                        curRatio       = charStat.cur / charStat.curMax;

                    let newMax = parseInt(charStat.curMax - modifiedStat, 10),
                        newCur = parseInt(curRatio * newMax, 10);

                    // FIXME: Stats should probably have a more reasonable upperbound per stat
                    newMax = _.clamp(newMax, 1, Number.MAX_SAFE_INTEGER);
                    newCur = _.clamp(newCur, 1, Number.MAX_SAFE_INTEGER);

                    _modified[statName] = {
                        difference: (newMax - charStat.curMax),
                        curMax: newMax,
                        cur: newCur
                    };

                    charStat.curMax = newMax;
                    charStat.cur = newCur;
                    console.log("Restoring stat " + statName + " to " + charStat.curMax);

                }

                return _modified;
            }
		};

		this.client = {

			activate(character, args, modified) {

                for (const statName in modified) {
                    const charStat = character.stats[statName];
                    charStat.curMax = modified.curMax;
                    charStat.cur = modified.cur;
                }

				//character.health = args.health;
				//if (character.entity.id === The.player.id) {
				//	UI.postMessage("You healed up!");
				//} else {
				//	UI.postMessage("He totally healed up!");
				//}
            },

            deactivate(character, args, modified) {

                for (const statName in modified) {
                    const charStat = character.stats[statName],
                        modStat    = modified[statName];
                    charStat.curMax = modStat.curMax;
                    charStat.cur = modStat.cur;
                }
            }
		};

        this.initialize(); // Setup from Base
	};

    StatBuff.prototype = Object.create(BuffBase.prototype);
    StatBuff.prototype.constructor = StatBuff;

	return StatBuff;
});
