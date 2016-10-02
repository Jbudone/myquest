define(['SCRIPTINJECT', 'loggable', 'scripts/character'], (SCRIPTINJECT, Loggable, Character) => {

    /* SCRIPTINJECT */

    const Lookat = function() {
        extendClass(this).with(Loggable);
        this.setLogGroup('Interactable');
        this.setLogPrefix('Interactable');

        this.name           = "interactable";
        this.static         = false;
        const _interactable = this;
        let _script         = null;

        this.client = {

            initialize(name, character, args) {
                _script = this;
                return _interactable.interact(name, character, args);
            },

            interact: (name, character, args) => {
                if (character.entity.id === The.player.id) {
                    UI.postMessage(`You ponder at (${name}): ${args.description}`);
                } else {
                    UI.postMessage(`He ponders at (${name}): ${args.description}`);
                }
            }
        };
    };

    return {
        handledBy: CLIENT_ONLY,
        dynamic: false,
        base: Lookat
    };
});
