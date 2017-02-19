define(['loggable'], function(Loggable){

    const BuffBase = function() {

		extendClass(this).with(Loggable);
		this.setLogGroup('Buff');
		this.setLogPrefix('(Buff) ');

        this.initialize = function() {
            const localPart = (Env.isServer ? this.server : this.client);
            let newInit = false;
            if (localPart) {
                if (typeof localPart === 'object') {
                    for (const key in localPart) {
                        if (key === 'initialize') newInit = true;
                        if (key === 'initialize' && this.hasOwnProperty(key)) {
                            const _preInitialize = this[key],
                                _postInitialize  = localPart[key];
                            this[key] = (function(){
                                _preInitialize.apply(this, arguments);
                                _postInitialize.apply(this, arguments);

                            });
                        } else {
                            this[key] = localPart[key];
                        }
                    }
                }
            }
            delete this.server;
            delete this.client;

            if (newInit) this.initialize();
        };
    };

    return BuffBase;
});
