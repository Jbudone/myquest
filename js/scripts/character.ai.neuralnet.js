define(['SCRIPTINJECT'], (SCRIPTINJECT) => {

    /* SCRIPTINJECT */

    // Neural Network
    //
    // The neural network acts as a way to keep track of other entities in the area, and associate which ones
    // are good or bad; eg. if a player is attacking you, and another player is healing him, then both players
    // are connected and considered to be your enemies. This works by treating every character as a neuron.
    // Each neuron is essentially a node with some properties that define how we percieve him (eg. is he our
    // friend or foe? how strong is he? is he a healer or fighter?).
    //
    // Neurons are initially separated, but will form a connection over time if they affect each other enough.
    // Essentially if one neuron (your enemy) is healed by another player, then that player is added as a
    // neuron and has a relationship with the the enemy. The more that player heals your enemy, the more the
    // relationship grows, and after that relationship surpasses a given threshold the two neurons will be
    // connected. This threshold level can vary between npcs, and can be associated to their personality:
    //
    //      Social: easier to consider a neuron your friend when they help you
    //      Angry:  quicker to form a connection between 2 neurons, when one of them is helping one that you
    //              already dislike
    //      Sympathetic: will form a friendship with an npc whose being attacked by a neuron that you dislike
    //

    const Neuron = function(character) {

        this.connections  = {}; // Other neurons which I'm connected to
        this.relationship = {}; // Other neurons which I've formed some sort of relationship with
        this.character    = character;
    };

    const NeuralNetwork = function(brain) {

        // TODO: form perceptions; callback to add/update neurons
        // TODO: update brain on self-updated (combat mode?)

        this.has = (id) => {
            if (this.neurons[id]) return this.neurons[id];
            return false;
        };

        this.get = this.has;
        this.find = this.has;

        this.add = (character) => {
            const neuron = new Neuron(character);
            this.neurons[character.entity.id] = neuron;

            return neuron;
        };

        this.remove = (id) => {
            delete this.neurons[id];
        };

        this.reset = () => {
            this.neurons = {};
        };

        this.neurons = {};

        this.debugInfo = () => {

            let debugInfo = "";
            debugInfo += `      Entity [${brain.character.entity.id}]  NeuralNet Memory\n`;
            debugInfo += " --------------------------------\n";

            for(const id in this.neurons) {
                const neuron = this.neurons[id];
                let json = {};

                for(const d in neuron) {
                    if (d === 'connections' || d === 'relationship' || d === 'character') continue; // FIXME: You know how to fix this
                    json[d] = neuron[d];
                }

                json = JSON.stringify(json);

                debugInfo += `   ${id}: ${json}\n`;
            }

            return debugInfo;
        };
    };

    return NeuralNetwork;
});
