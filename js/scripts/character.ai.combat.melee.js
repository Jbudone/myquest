define(
    [
        'SCRIPTINJECT', 'scripts/character', 'scripts/character.ai.ability', 'loggable'
    ],
    (
        SCRIPTINJECT, Character, Ability, Loggable
    ) => {

        /* SCRIPTINJECT */

        const Melee = function(game, combat, character) {

            Ability.call(this);

            extendClass(this).with(Loggable);
            this.setLogGroup('Combat');

            // TODO: How to handle range? (check if in range on attackTarget? What about polearms? Just trust the
            // request?)
            // TODO: How to handle attackBusy?

            let _script  = null;

            this.server = {

                initialize() {
                    _script = this;
                },

                calculateDamage: (target) => {

                    let wpnDamage = 1; // FIXME: Check actual weapon; otherwise default is hand-to-hand for 1?
                    let strContribution = 0.4;
                    let str = character.stats.str.cur;
                    let maxCrit = 1.6, minCrit = 0.6;
                    let dex = character.stats.dex.cur;
                    let wpnLevel = 1; // FIXME: Check actual weapon; otherwise default is 1?
                    let maxDex = 2.0 * wpnLevel,
                        minDex = 0.5 * wpnLevel,
                        dexScore = (dex - minDex) / (maxDex - minDex);
                    let critScore = Math.min(1.0, Math.max(0.0, dexScore)); // [0,1], 1 if dex = 2*wpnLevel, 0 if dex = 0.5*wpnLevel
                    minCrit += critScore * 0.4; // Shift where our crit is based off of critScore
                    maxCrit += critScore * 0.4;
                    let rng = Math.random();
                    let crit = minCrit + (maxCrit - minCrit) * rng;
                    let damage = wpnDamage * (1.0 + strContribution * str) * crit;


                    // Resist
                    let AC = 2.0; // FIXME: Fetch from character armour
                    let hit = damage * (damage) / (AC + damage);

                    hit = Math.round(hit);
                    return hit;
                },

                attackTarget: (target) => {
                    assert(target instanceof Character, "Target is not a character..");

                    if (!target.isAttackable()) {
                        return false;
                    }

                    // FIXME: Abstract damage
                    const damage = this.calculateDamage(target);
                    this.Log(` I TOTALLY SCRATCHED YOU FOR ${damage}`, LOG_DEBUG);

                    target.damage(damage, character, {});

                    return true;
                }
            };

            this.client = {
                initialize() {
                    _script = this;
                },

                attackTarget: (target) => {
                    assert(target instanceof Character, "Target is not a character..");

                    if (!target.isAttackable()) {
                        return false;
                    }

                    return true;
                }
            };
        };

        Melee.prototype = Object.create(Ability.prototype);
        Melee.prototype.constructor = Melee;

        return Melee;
    });
