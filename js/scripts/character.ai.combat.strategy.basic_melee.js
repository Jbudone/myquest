define(['SCRIPTINJECT', 'scripts/character.ai.combat.strategy'], (SCRIPTINJECT, Strategy) => {

    /* SCRIPTINJECT */

    // Basic Melee strategy
    //

    addKey('INPUT_TARGET_MOVED');
    addKey('INPUT_TARGET_OUTOFRANGE');
    addKey('INPUT_TARGET_INRANGE');
    addKey('INPUT_BORED');
    addKey('INPUT_STARTATTACK');
    addKey('INPUT_FINISHEDATTACK');


    // Basic Melee
    //
    // The most simple combat strategy used for npcs. Simply chase/attack the current target
    const Basic_Melee = function(combat, _character) {

        Strategy.call(this, combat, _character);

        let isChasing = false; // TODO: Still need this? Now that activeMovement has been added

        let timeSinceLastAttack = now(); // NOTE: Do NOT reset this since we could potentially repeatedly go
        //         in/out of this strategy because of chasing after target
        //         and being much faster than target
        let timeSince = now();

        const attackInfo  = _character.entity.npc.attackInfo,
            chaseDistance = attackInfo.chaseDistance,
            attackTime    = attackInfo.attackTime,
            range         = attackInfo.range;
            rangeWidth    = attackInfo.rangeWidth;


        assert(chaseDistance <= range);


        if (!attackInfo) throw Err(`No attack info found for NPC`, arguments, _character.entity.npc);
        if (!attackInfo.ability) throw Err("No attack ability found for npc");

        const melee = combat.ability(attackInfo.ability),
            movement = combat.require('movement');

        let activeMovement = null; // Our current movement object
        let activeCombatEvtNode = null;
        let activeCombatDir = null; // Since we begin hitting before creating the evtNode

        const BusyAttacking = this.AddState('BusyAttacking', function () {}, () => {


            // NOTE: We're now throwing a melee attack; we can't stop now
            // No need to check if you're in range or not, if you're out of range then you essentially dodged our attack
            const _now = now();

            this.Log(`BusyAttacking (${_character.entity.id}) ? ${_now - timeSince} > 100`);
            if (activeCombatEvtNode) {
                // Attacking: this is the cooldown phase
                if (activeCombatEvtNode.destroyed && _now - timeSince > attackInfo.endSwingTime) {
                    activeCombatEvtNode = null;
                    this.Log("Finished swing", LOG_DEBUG);
                    this.input(INPUT_FINISHEDATTACK);
                }
            } else {
                if (_now - timeSince > attackInfo.startSwingTime) {

                    //melee.attackTarget(this.target);

                    const eventnode = {
                        id: 'melee',
                        direction: activeCombatDir,
                        character: _character,
                        range, rangeWidth,
                        melee
                    };

                    const evtNode = _character.entity.page.area.evtNodeMgr.addNode(eventnode, _character.entity.page, true);
                    activeCombatEvtNode = evtNode;
                    timeSinceLastAttack = _now; // Finished attack

                    this.Log("Attempting to attack you..", LOG_DEBUG);
                }
            }
        });

        const ChaseTarget = this.AddState('ChaseTarget', () => {
            // init
            this.Log("Attempting to chase you..", LOG_DEBUG);

            // NOTE: We do NOT want to stop the current movement, otherwise if we keep getting ChaseTarget inputs then
            // we'll never actually get a chance to move. Better to keep the current movement and stomp over it with the
            // new path when it comes in, it will likely be in the same direciton anyways
            // NOTE: We do however need to clear the callback from the previous movement in case we run into a situation
            // where the new movement doesn't get set, then we continue w/ the old movement (okay) but don't want the
            // old cb anymore
            if(activeMovement){
                activeMovement.clearCb();
            }

            const options = { range: range, rangeWidth: rangeWidth, shootThrough: melee.canAttackThroughShootable };
            //options.filterFunc = melee.inRangeFilterFunc;
            if (movement.inRangeOf(this.target, options)) {
                this.Log("You're already in range -- attacking", LOG_DEBUG);

                // Stop chasing in case we were previously chasing the target
                if(isChasing || activeMovement){
                    isChasing = false;
                    this.Log("Cancelling chase first", LOG_DEBUG);
                    // movement.stopChasing(target);

                    activeMovement.stop(false);
                    activeMovement = null;
                }

                this.input(INPUT_TARGET_INRANGE, this.target);
                return;
            }

            if (!_character.canMove()) {
                return;
            }

            const fromTile = _character.entity.position.tile,
                toTile     = this.target.entity.position.tile,
                fromReal   = _character.entity.position.global,
                toReal     = this.target.entity.position.global;
            this.Log(` ChaseTarget: (${fromTile.x}, ${fromTile.y}) ==> (${toTile.x}, ${toTile.y})`, LOG_DEBUG);
            this.Log(`      (Real): (${fromReal.x}, ${fromReal.y}) ==> (${toReal.x}, ${toReal.y})`, LOG_DEBUG);

            // Begin chasing
            // NOTE: If we're already in range then chase will succeed immediately. Do not check if we're in range
            // without attempting to chase since the target may be in range (while we're moving) and halt our current
            // path before we get to the center of the tile
            isChasing = true;
            const maxWalk = chaseDistance * (1000 / _character.entity.moveSpeed); // FIXME: Env this.. should be based off seconds to reach target and laziness factor of npc
            activeMovement = movement.chase(this.target, options, maxWalk).then(() => {
                this.Log("Caught up to you!", LOG_DEBUG);

                isChasing = false;
                activeMovement = null;
                this.input(INPUT_TARGET_INRANGE, this.target);
            }, (e) => {

                // NOTE: We may have cancelled this chase/path in order to start a new one (eg. target has moved and we
                // need to chase again)
                // The path may have also failed right off the bat (eg. path exceeded maxWalk)
                if (isChasing) {
                    this.Log("Fuck it", LOG_DEBUG);
                    activeMovement = null;
                    isChasing = false;
                } else {
                    this.Log("error in chase", LOG_DEBUG);
                    activeMovement = null; // TODO: Need to do this in both places? Or can we just unset these after the input
                    isChasing = false;
                }

                // If we've added a new path somewhere else, then this path will be replaced (cancelled) with that new
                // one. That's perfectly fine
                if (e === EVT_NEW_PATH) {
                    // Intentionally blank
                } else {
                    // If we couldn't find a path to the target or its simply too far then forget the target
                    if (!e || e === PATH_TOO_FAR) {
                        this.Log(`e == ${e}`, LOG_DEBUG);
                        this.Log(`Do we have a target? ${this.target ? 'yes' : 'no'}`, LOG_DEBUG);
                        this.Log(`Does our target have a character? ${this.target.character ? 'yes' : 'no'}`, LOG_DEBUG);
                        combat.forgetTarget(this.target);
                    }
                }
            });
        }, () => {
            // Can't move, can we move now?
            if (_character.canMove()) {
                this.input(INPUT_TARGET_OUTOFRANGE);
            }
        });

        const AttackTarget = this.AddState('AttackTarget', function() {}, () => {
            // step

            const _now = now();
            this.Log(`AttackTarget (${_character.entity.id}) ? ${_now - timeSinceLastAttack} > ${attackTime}`);
            if (_now - timeSinceLastAttack > attackTime) {
                const options = { range: range, rangeWidth: rangeWidth, shootThrough: melee.canAttackThroughShootable };
                options.filterFunc = melee.inRangeFilterFunc;
                if (movement.inRangeOf(this.target, options)){


                    // Attack towards target
                    const myPosition = _character.entity.position.global,
                        yourPosition = this.target.entity.position.global;

                    activeCombatDir = directionFromOffset(yourPosition.x - myPosition.x, yourPosition.y - myPosition.y);

                    timeSince = _now;
                    this.input(INPUT_STARTATTACK);
                } else {
                    timeSinceLastAttack = _now;

                    const xDistance = this.target.entity.position.tile.x - _character.entity.position.tile.x,
                        yDistance   = this.target.entity.position.tile.y - _character.entity.position.tile.y;
                    this.Log("Wtf you're too far?! I can't hit you. Dist: " + xDistance + ", " + yDistance + ", range: " + options.range, LOG_DEBUG);
                    this.input(INPUT_TARGET_OUTOFRANGE);
                }
            }

        });

        const HaveTarget = this.AddState('HaveTarget', () => {
            // init

            const options = { range: range, rangeWidth: rangeWidth, shootThrough: melee.canAttackThroughShootable };
            options.filterFunc = melee.inRangeFilterFunc;
            if (movement.inRangeOf(this.target, options)) {
                this.Log("I'm in range of you!", LOG_DEBUG);
                this.input(INPUT_TARGET_INRANGE);
            } else {
                this.Log("I'm OUT OF range of you!", LOG_DEBUG);
                this.input(INPUT_TARGET_OUTOFRANGE);
            }

        });

        const LostTarget = this.AddState('LostTarget', () => {

            // TODO: Wait around until bored?
            // Exit all active events (movement)
            this.Log("LostTarget!", LOG_DEBUG);
            if (activeMovement) {
                this.Log("Stopping active movement", LOG_DEBUG);
                activeMovement.stop();
                activeMovement = null;
                isChasing = false;
            }

            this.target = null;
            this.input(INPUT_BORED);
        });

        const Idle = this.states['Idle'];

        // Only NPCs have combat FSM for now
        if (!_character.isPlayer) {

            ChaseTarget.on(INPUT_TARGET_MOVED).go(ChaseTarget)
                       .on(INPUT_TARGET_INRANGE).go(AttackTarget)
                       .on(INPUT_TARGET_OUTOFRANGE).go(ChaseTarget)
                       .on(INPUT_TARGET_LOST).go(LostTarget)
                       .on(INPUT_MOVED).go(ChaseTarget);

            AttackTarget.on(INPUT_TARGET_OUTOFRANGE).go(ChaseTarget)
                        .on(INPUT_TARGET_MOVED).go(ChaseTarget)
                        .on(INPUT_TARGET_LOST).go(LostTarget)
                        .on(INPUT_STARTATTACK).go(BusyAttacking)
                        .on(INPUT_MOVED).go(ChaseTarget);

            BusyAttacking.on(INPUT_FINISHEDATTACK).go(HaveTarget)
                         .on(INPUT_TARGET_MOVED).go(BusyAttacking)
                         .on(INPUT_TARGET_INRANGE).go(BusyAttacking)
                         .on(INPUT_TARGET_LOST).go(BusyAttacking)
                         .on(INPUT_TARGET_OUTOFRANGE).go(BusyAttacking)
                         .on(INPUT_MOVED).go(BusyAttacking);

            HaveTarget.on(INPUT_TARGET_OUTOFRANGE).go(ChaseTarget)
                      .on(INPUT_TARGET_INRANGE).go(AttackTarget)
                      .on(INPUT_TARGET_LOST).go(LostTarget)
                      .on(INPUT_MOVED).go(HaveTarget);

            LostTarget.on(INPUT_BORED).go(Idle)
                      .on(INPUT_MOVED).go(Idle);

            Idle.on(INPUT_TARGET).go(HaveTarget)
                .on(INPUT_TARGET_LOST).go(LostTarget)
                .on(INPUT_MOVED).go(Idle);
        }

        this.Idle   = Idle;
        this.state  = Idle;

        const targetMoved = () => {

            if (this.target) {
                // Check range
                // var inRange = movement.inRangeOf(this.target, 1);
                // if (inRange) {
                //  Input(INPUT_TARGET_INRANGE);
                // } else {
                //  Input(INPUT_TARGET_OUTOFRANGE);
                // }
                this.input(INPUT_TARGET_MOVED);
            }
        };

        const getCallbacks = () => {

            const callbacks = {};
            callbacks[EVT_MOVED_TO_NEW_TILE] = targetMoved;
            callbacks[EVT_FINISHED_PATH]     = targetMoved;

            return callbacks;
        };


        const reset = () => {
            this.reset();

            if (activeMovement) {
                this.Log("Resetting");
                activeMovement.stop();
                activeMovement = null;
                isChasing = false;
            }

            if (activeCombatEvtNode) {
                activeCombatEvtNode = null;
            }
        };

        // Extend interface with Basic Melee specific stuff
        const _interface = _.defaults(this.interface, {
            reset
        });

        // Subscribe to each callback
        // NOTE: This should be set upon initialization. The combat system will store these subscriptions and
        // apply/clear them from the target when they're added/removed
        const callbacks = getCallbacks();
        for (const evt in callbacks) {
            this.registerCallback(evt, callbacks[evt]);
        }

        return _interface;
    };

    Basic_Melee.prototype = Object.create(Strategy.prototype);
    Basic_Melee.prototype.constructor = Basic_Melee;

    return Basic_Melee;
});
