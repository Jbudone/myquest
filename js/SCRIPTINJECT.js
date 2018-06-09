define(function(){

    if (!(The.scripting instanceof Object) || Object.keys(The.scripting).length === 0) {
        throw Err("SCRIPTINJECT was included before The.scripting had been properly built. This is intended to be used for scripts");
    }

    var toEval = "";
    for (var scriptKey in The.scripting) {
        toEval += scriptKey+" = The.scripting['"+scriptKey+"']; __scriptInject_definedVar('"+scriptKey+"'); ";
    }

    return toEval;

    //var injection = new Function(toEval);
    //return injection;
});
