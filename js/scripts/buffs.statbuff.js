define(['scripts/buffs.base'], function(BuffBase){

    const MAX_MULTIPLIER = "MAX_MULTIPLIER",
        CUR_MULTIPLIER   = "CUR_MULTIPLIER",
        CUR_ADDMULT      = "CUR_ADDMULT",
        CUR_ADD          = "CUR_ADD";

	const StatBuff = function() {

        BuffBase.call(this);
		
		this.server = {

			activate(character, args) {

                const modified = {};

                for (let i = 0; i < args.stats.length; ++i) {

                    const statBuff = args.stats[i],
                        charStat   = character.stats[statBuff.stat];

                    let newMax = charStat.curMax,
                        newCur = charStat.cur,
                        difference = 0;

                    if (statBuff.type === MAX_MULTIPLIER) {

                        const curRatio   = charStat.cur / charStat.curMax;

                        newMax = parseInt(charStat.curMax * statBuff.amount, 10);
                        newCur = parseInt(curRatio * newMax, 10);

                        // FIXME: Stats should probably have a more reasonable upperbound per stat
                        newMax = _.clamp(newMax, 1, Number.MAX_SAFE_INTEGER);
                        newCur = _.clamp(newCur, 1, Number.MAX_SAFE_INTEGER);

                        difference = newMax - charStat.curMax;

                        console.log("Buffing stat (.curMax) " + statBuff.stat + " to " + charStat.curMax);

                        console.log("Your " + statBuff.stat + " is now " + charStat.cur);

                    } else if (statBuff.type === CUR_MULTIPLIER) {

                        newCur = parseInt(charStat.cur * statBuff.amount, 10);
                        newCur = _.clamp(newCur, Number.MIN_SAFE_INTEGER, charStat.curMax);
                        difference = newCur - charStat.cur;

                        console.log(`Buffing (${statBuff.stat}) from ${charStat.cur} -> ${newCur}    (diff: ${difference})`);

                    } else if (statBuff.type === CUR_ADDMULT) {

                        let addAmt = parseInt(charStat.cur * statBuff.amount, 10);
                        newCur = _.clamp(charStat.cur + addAmt, Number.MIN_SAFE_INTEGER, charStat.curMax);
                        difference = newCur - charStat.cur;

                        console.log(`Buffing (${statBuff.stat}) from ${charStat.cur} -> ${newCur}    (diff: ${difference})`);

                    } else if (statBuff.type === CUR_ADD) {

                        newCur = _.clamp(charStat.cur + statBuff.amount, Number.MIN_SAFE_INTEGER, charStat.curMax);
                        difference = newCur - charStat.cur;

                        console.log(`Buffing (${statBuff.stat}) from ${charStat.cur} -> ${newCur}    (diff: ${difference})`);

                    } else {
                        throw Err(`Unexpected statBuff type: ${statBuff.type}`);
                    }
                    
                    const modification = {
                        difference: difference,
                        curMax: newMax,
                        cur: newCur,
                        permanent: _.defaultTo(statBuff.permanent, false),
                        type: statBuff.type
                    }

                    this.handleStatChange(character, statBuff.stat, statBuff, modification);

                    modified[statBuff.stat] = modification;
                }

                return modified;
            },

            handleStatChange(character, statName, statBuff, modified) {

                const charStat = character.stats[statName];

                // If we're updating health we need to explicitly damage the character (and probably heal later too).
                // Even if we're updating max, we could in turn be updating cur as well (ratio changed)
                if (statName === "health" && modified.cur !== charStat.cur) {
                    // Health is a special case; need to run through damage/heal

                    if (modified.difference < 0) {
                        const source = null; // FIXME: Who did this buff come from
                        character.damage(modified.difference * -1, source, {});
                    } else {
                        charStat.cur = modified.cur;
                    }

                }

                charStat.curMax = modified.curMax;
                charStat.cur    = modified.cur;
            },

            deactivate(character, args, modified) {

                const _modified = {};

                for (const statName in modified) {

                    if (modified[statName].permanent === true) continue;

                    const statBuff     = modified[statName],
                        modifiedStat   = statBuff.difference,
                        charStat       = character.stats[statName];

                    let newMax = charStat.curMax,
                        newCur = charStat.cur,
                        difference = 0;

                    if (statBuff.type === MAX_MULTIPLIER) {

                        const curRatio = charStat.cur / charStat.curMax;

                        newMax = parseInt(charStat.curMax - modifiedStat, 10);
                        newCur = parseInt(curRatio * newMax, 10);

                        // FIXME: Stats should probably have a more reasonable upperbound per stat
                        newMax = _.clamp(newMax, 1, Number.MAX_SAFE_INTEGER);
                        newCur = _.clamp(newCur, 1, Number.MAX_SAFE_INTEGER);

                        difference = newMax - charStat.curMax;

                        console.log("Restoring stat " + statName + " to " + charStat.curMax);

                    } else if (statBuff.type === CUR_MULTIPLIER) {

                        newCur = parseInt(charStat.cur - modifiedStat, 10);
                        newCur = _.clamp(newCur, 1, charStat.curMax);

                        difference = newMax - charStat.curMax;

                        console.log(`Removing Buff. Restoring (${statName}) from ${charStat.cur} -> ${newCur}    (diff: ${modifiedStat})`);

                    } else if (statBuff.type === CUR_ADDMULT) {
                        
                        newCur = parseInt(charStat.cur - modifiedStat, 10);
                        newCur = _.clamp(newCur, 1, charStat.curMax);

                        difference = newCur - charStat.cur;

                        console.log(`Removing Buff. Restoring (${statName}) from ${charStat.cur} -> ${newCur}    (diff: ${modifiedStat})`);
                    } else if (statBuff.type === CUR_ADD) {

                        newCur = parseInt(charStat.cur - modifiedStat, 10);
                        newCur = _.clamp(newCur, 1, charStat.curMax);

                        difference = newCur - charStat.cur;

                        console.log(`Removing Buff. Restoring (${statName}) from ${charStat.cur} -> ${newCur}    (diff: ${modifiedStat})`);
                    } else {
                        throw Err(`Unexpected statBuff type: ${statBuff.type}`);
                    }

                    const modification = {
                        difference: difference,
                        curMax: newMax,
                        cur: newCur
                    };

                    this.handleStatChange(character, statName, statBuff, modification);

                    _modified[statName] = modification;
                }

                return _modified;
            },

            tick(character, args, modified) {
                const newModified = this.activate(character, args);

                // Merge old modified stuff w/ newModified stuff
                _.each(newModified, (modification, stat) => {
                    if (!modified[stat]) {
                        modified[stat] = modification;
                    } else {
                        modified[stat].difference += modification.difference;
                        modified[stat].cur = modification.cur;
                        modified[stat].curMax = modification.curMax;
                    }
                });

                return modified;
            }
		};

		this.client = {

			activate(character, args, modified) {

                for (const statName in modified) {
                    const charStat = character.stats[statName],
                        modStat    = modified[statName];
                    charStat.curMax = modStat.curMax;
                    charStat.cur = modStat.cur;
                }
            },

            deactivate(character, args, modified) {

                for (const statName in modified) {
                    const charStat = character.stats[statName],
                        modStat    = modified[statName];
                    charStat.curMax = modStat.curMax;
                    charStat.cur = modStat.cur;
                }
            },

            tick(character, args, modified) {

            }
		};

        this.initialize(); // Setup from Base
	};

    StatBuff.prototype = Object.create(BuffBase.prototype);
    StatBuff.prototype.constructor = StatBuff;

	return StatBuff;
});
