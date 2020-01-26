define(() => {

    const PseudoFXMgr = (function(){

        this.event = function(){};
        this.initialize = function(){
            return new Promise((success) => {
                success();
            });
        };

        this.step = function(){};
    });

    return PseudoFXMgr;
});
