define(() => {

    addKey('INPUT_HANDLED');

    const State = function(name, init, step) {

        this.name = name;
        this.init = init || (() => {});
        this.step = step || (() => {});

        const inputs  = {},
            callbacks = {};

        this.input = (ipt) => {
            let action = null;

            if (callbacks[ipt]){
                callbacks[ipt]();
                action = INPUT_HANDLED;
            }

            if (inputs[ipt]) {
                action = inputs[ipt];
            }

            return action;
        };

        this.on = (ipt) => {
            return {
                go: (action) => {
                    inputs[ipt] = action;
                    return _interface;
                },
                doNothing: () => {
                    callbacks[ipt] = () => {};
                    return _interface;
                }
            };
        };


        const _interface = {

            name: this.name,
            init: this.init,
            step: this.step,
            input: this.input,
            on: this.on,

            // FIXME: Return debug str and have the caller Log it properly
            debug: function() {
                console.log(`State (${this.name}) inputs`);
                console.log("==============");
                for(const ipt in inputs){
                    console.log(`   Input[${keyStrings[ipt]}]: `);
                    console.log(inputs[ipt]);
                }
                console.log("==============");
            }
        };

        return _interface;
    };

    return State;
});
