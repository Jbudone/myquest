define(
    [
        'SCRIPTINJECT', 'scripts/character', 'scripts/character.ai.instinct',
        'eventful', 'hookable', 'dynamic', 'loggable'
    ],
    (
        SCRIPTINJECT, Character, Instinct, Eventful, Hookable, Dynamic, Loggable
    ) => {

        /* SCRIPTINJECT */

        const Bored = function(game, brain) {

            Instinct.call(this);

            extendClass(this).with(Eventful);
            extendClass(this).with(Hookable);
            extendClass(this).with(Dynamic);
            extendClass(this).with(Loggable);

            this.setLogGroup('Instinct');
            this.setLogPrefix(`Bored:${brain.character.entity.id}`);

            this.name = "bored";

            const _bored   = this,
                _character = brain.character;
            let _script    = null;

            this.isBored     = true;
            this.timeEntered = now();
            this.boredTime   = 0;
            this.backAtSpawn = false;

            this.onEnter = (instinct, data) => {
                this.beginBoredom();
            };

            this.onLeave = () => {

                game.hook('longStep', this).remove();
            };

            this.globalUnload = () => {

            };

            this.server = {

                initialize() {
                    _script = this;
                    _bored.boredInit();
                },

                beginBoredom: () => {

                    this.isBored = false;
                    this.boredTime = 0;
                    game.hook('longStep', this).after(() => {
                        this.boredTime += 1000;
                        if (this.boredTime > 2000) {
                            this.isBored = true;
                            this.Log("IM BORED!!!!", LOG_DEBUG);

                            // TODO: walk to spawn spot
                            this.goBackToSpawn();
                            game.hook('longStep', this).remove();
                        }
                    });

                    _character.standGuard();

                    // TODO: listen to onStateChanged to remove boredom

                    this.timeEntered = now();
                },

                goBackToSpawn: () => {
                    const respawn = _character.respawnPoint,
                        page      = _character.entity.page.area.pages[respawn.page],
                        tile      = new Tile(respawn.tile.x, respawn.tile.y);

                    brain.instincts.movement.goToTile(tile, 0).then(() => {
                        this.beginBoredom();
                    });
                },

                update: function(){},
                inform: () => {
                    // News of some other important thing has occured.. don't worry about what the news is, just accept
                    // to leave the boredom state
                    return {
                        accept: true
                    };
                },

                boredInit: () => {

                    if (!_character.isPlayer) {
                        brain.onStateless = () => {
                            brain.enterState('boredom');
                        };
                    }

                },

                unload: () => {
                    game.hook('longStep', this).remove();
                    this.globalUnload();
                }
            };

        };

        Bored.prototype = Object.create(Instinct.prototype);
        Bored.prototype.constructor = Bored;

        return Bored;
    });
