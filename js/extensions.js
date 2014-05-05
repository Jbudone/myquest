
define(function(){

	var SERVER=1,
		CLIENT=2,
		status={loaded:false},
		extensions={
			entity:(CLIENT|SERVER),
			map:(CLIENT|SERVER),
			page:(CLIENT|SERVER)
		}, ready=function(environment){
			return new Promise(function(loaded, failed) {
				var envPath = (environment==CLIENT?'client/':'server/'),
					loading = 0,
					waiting = false;
				_.each(extensions, function(env, extension, extensions){
					if (extensions[extension] & environment) {
						var module = envPath + extension;
						++loading;
						console.log("Loading extension: "+module);
						var loadExtension = function(mod) {

							extensions[extension] = mod;

							// TODO: When using (for .. in) there were problems with require matching the wrong extensions callbacks.. Look into why
							if (extension == 'map' && mod.draw) {
								console.log(module);
								console.log("WOW ERROR!!!");
							}
							--loading;
							if (waiting && !loading) {
								loaded();
							}
						};
						require([module], function(mod) {
							loadExtension(mod);
						});
					}

				});
				// for (var extension in extensions) {
				// }
				waiting = true;
				if (!loading) {
					loaded();
				}
			});
		};



	return {
		SERVER:SERVER,
		CLIENT:CLIENT,
		ready:ready,
		extensions:extensions,
		extend:function(module,modulename){
			modulename = modulename.toLowerCase();
			if (extensions[modulename]) {
				extendClass(module).with(extensions[modulename]);
				if (module.hasOwnProperty('_init')) {
					module._init();
				}
				// _.extend(module,extensions[modulename]);
				/*
				if (Env.isServer && (extensions[modulename] & SERVER)) {
					require(['server/'+modulename], function(BaseNode){
						_.extend(module,BaseNode);
					});
				} else if (!Env.isServer && (extensions[modulename] & CLIENT)) {
					require(['client/'+modulename], function(BaseNode){
						_.extend(module,BaseNode);
					});
				}
				*/
			}
		}
	};

});
