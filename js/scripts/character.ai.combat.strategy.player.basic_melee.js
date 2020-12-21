define(
    [
        'SCRIPTINJECT',
        'scripts/character.ai.combat.strategy', 'scripts/character.ai.combat.strategy.basic_melee'
    ],
    (
        SCRIPTINJECT, Strategy, Basic_Melee
    ) => {

        /* SCRIPTINJECT */

        // Player Combat strategy
        // 
        // Player strategy is handled through the server in order to avoid repeated requests, resending/retrying attacks
        // when server side needs to catch up to player position, etc. Client will be responsible for setting the
        // target, and will accept broadcasted movements/attacks


        // Basic Melee
        //
        // The most simple combat strategy used for npcs. Simply chase/attack the current target
        const Player_Basic_Melee = function(combat, _character) {

            assert(false); // Ensure we don't use player melee FSM anymore

            Basic_Melee.call(this, combat, _character);

            if (!Env.isServer) {

                const ClientHaveTarget = this.AddState('ClientHaveTarget', () => {
                    // We're the client player with a target. Since the player combat FSM is handled on the server,
                    // simply do nothing here until we lose our target
                });

                const Idle = this.states['Idle'];

                ClientHaveTarget.on(INPUT_TARGET_LOST).go(Idle)
                                .on(INPUT_TARGET_MOVED).doNothing();

                Idle.on(INPUT_TARGET).go(ClientHaveTarget);
            }


            return this.interface;
        };

        Player_Basic_Melee.prototype = Object.create(Basic_Melee.prototype);
        Player_Basic_Melee.prototype.constructor = Player_Basic_Melee;

        return Basic_Melee;
});
