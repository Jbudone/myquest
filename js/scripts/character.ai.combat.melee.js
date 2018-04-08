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

                calculateDamage: (attackInfo, defensiveInfo, target) => {

                    let wpnDamage = attackInfo.wpnDmg,
                        wpnLevel  = attackInfo.wpnLvl,
                        AC        = defensiveInfo.AC;


                    let strContribution = 0.4;
                    let str = character.stats.str.cur;
                    let maxCrit = 1.6, minCrit = 0.6;
                    let dex = character.stats.dex.cur;
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
                    let hit = damage * (damage) / (AC + damage);
                    console.log(`Damage (${damage}), AC (${AC}), hit (${hit})`);

                    hit = Math.round(hit);
                    return hit;
                },

                attackTarget: (target) => {
                    assert(target instanceof Character, "Target is not a character..");

                    if (!target.isAttackable()) {
                        return false;
                    }

                    const damageData = {},
                        attackInfo   = {
                            wpnDmg: 1,
                            wpnLvl: 1
                        },
                        defensiveInfo = {
                            AC: 0
                        };

                    if (character.inventory) {

                        const weapons = character.inventory.getEquipped('WIELD_LEFTHAND');
                        if (weapons.length > 0) {
                            const weapon = weapons[0];

                            attackInfo.wpnDmg = weapon.args.dmg;
                            attackInfo.wpnLvl = weapon.args.lvl;

                            if (weapon.args.effects) {
                                damageData.effects = weapon.args.effects;
                            }
                        }
                    } else {

                        // Default attackInfo on npc?
                        if (character.entity.npc.attackInfo) {
                            attackInfo.wpnDmg = _.defaultTo(character.entity.npc.attackInfo.wpnDmg, attackInfo.wpnDmg);
                            attackInfo.wpnLvl = _.defaultTo(character.entity.npc.attackInfo.wpnLvl, attackInfo.wpnDmg);
                        }
                    }

                    if (target.inventory) {

                        const armors = target.inventory.getEquipped('ARMOR');
                        for (let i = 0; i < armors.length; ++i) {
                            const armor = armors[i];
                            attackInfo.AC += armor.args.ac;
                        }
                    } else {

                        // Default attackInfo on npc?
                        if (target.entity.npc.attackInfo) {
                            defensiveInfo.AC = _.defaultTo(target.entity.npc.attackInfo.AC, defensiveInfo.AC);
                        }
                    }

                        
                    // FIXME: Abstract damage
                    const damage = this.calculateDamage(attackInfo, defensiveInfo, target);
                    this.Log(` I TOTALLY SCRATCHED YOU FOR ${damage}`, LOG_DEBUG);

                    target.damage(damage, character, damageData);

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
