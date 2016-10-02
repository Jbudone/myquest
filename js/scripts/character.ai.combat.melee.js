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

                attackTarget: (target) => {
                    assert(target instanceof Character, "Target is not a character..");

                    if (!target.isAttackable()) {
                        return false;
                    }

                    // FIXME: Abstract damage
                    const DAMAGE = 10;
                    this.Log(` I TOTALLY SCRATCHED YOU FOR ${DAMAGE}`, LOG_DEBUG);

                    target.hurt(DAMAGE, character);

                    // Broadcast attack
                    // TODO: Where to get _character? This.Log? Is this already fetched from Ability? It should be..
                    character.entity.page.broadcast(EVT_ATTACKED, {
                        entity: { page: target.entity.page.index, id: target.entity.id },
                        target: { page: character.entity.page.index, id: character.entity.id },
                        amount: DAMAGE,
                        health: target.health
                    });

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


                    if (!this.attackBusy) {
                        this.attackBusy = true;

                        // Server request to attack
                        server.request(EVT_ATTACK, {
                            target: target.entity.id
                        }).then(() => {
                            this.Log("Success in attacking target..", LOG_DEBUG);
                            this.attackBusy = false;
                        }, () => {
                            this.Log("FAILED TO ATTACK TARGET..", LOG_ERROR); // TODO: get error msg from server response
                            this.attackBusy = false;
                        })
                        .catch(errorInGame);
                    }

                    return true;
                }
            };
        };

        Melee.prototype = Object.create(Ability.prototype);
        Melee.prototype.constructor = Melee;

        return Melee;
    });
