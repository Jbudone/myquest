var __scriptInject_definedVar = function(){
    var definedKeys = {};

    return function(key,registerKey){
        if (registerKey) {
            definedKeys[key] = true;
        } else {
            if (!definedKeys.hasOwnProperty(key)) {
                // Uh oh, we've added a new scripting key but forgot to declare it here
                throw new Error("We've added a new scripting variable ("+key+") but forgot to declare it in SCRIPT.INJECTION.js..");
            }
        }
    };
}();

if (Env.isServer) {
    var world; __scriptInject_definedVar('world', true);
    var redis; __scriptInject_definedVar('redis', true);
    var Rules; __scriptInject_definedVar('Rules', true);
    var Buffs; __scriptInject_definedVar('Buffs', true);
} else {
    var player; __scriptInject_definedVar('player', true);
    var UI;     __scriptInject_definedVar('UI', true);
    var user;   __scriptInject_definedVar('user', true);
    var server; __scriptInject_definedVar('server', true);
    var player; __scriptInject_definedVar('player', true);
    var area;   __scriptInject_definedVar('area', true);
    var Rules; __scriptInject_definedVar('Rules', true);
    var Buffs; __scriptInject_definedVar('Buffs', true);
}

eval(SCRIPTINJECT);
