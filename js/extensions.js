
define(function(){

	var SERVER=1<<0,
		CLIENT=1<<1,
        TEST=1<<2,
        CLIENT_TEST=1<<3,
        SERVER_TEST=1<<4,
        TEST_USESERVER=1<<5,
		status={loaded:false},
        environments={
            client: { env: CLIENT, path: 'client/' },
            server: { env: SERVER, path: 'server/' },
            test: { env: TEST, path: 'test/' },
            client_test: { env: CLIENT_TEST, path: 'client/test/' },
            server_test: { env: SERVER_TEST, path: 'server/test/' },
            test_useserver: { env: TEST_USESERVER, path: 'server/' },
        },
		extensions={
			movable:(CLIENT|SERVER),
			area:(CLIENT|SERVER),
			page:(CLIENT|SERVER),
            resources:(CLIENT|SERVER),
            game:(CLIENT_TEST),
            server:(SERVER_TEST),
            errorReporter:(CLIENT|SERVER|TEST),
            webworker:(CLIENT|SERVER|TEST_USESERVER),
		}, ready=function(environment){
			return new Promise(function(loaded) {
                const envPaths = [];

                // TEST environment. Find all extensions that have TEST_USESERVER and remove CLIENT to override to
                // SERVER env
                if (environment & TEST) {

                    _.each(extensions, function(env, extension, extensions){
                        if (extensions[extension] & TEST_USESERVER) {
                            extensions[extension] &= ~CLIENT;
                        }
                    });

                    environment |= TEST_USESERVER;
                    envPaths.push(environments.test_useserver);
                }

                if (environment & CLIENT) envPaths.push(environments.client);
                if (environment & SERVER) envPaths.push(environments.server);
                if (environment & TEST) envPaths.push(environments.test);
                if (environment & CLIENT_TEST) envPaths.push(environments.client_test);
                if (environment & SERVER_TEST) envPaths.push(environments.server_test);

				var loading = 0,
					waiting = false;

                envPaths.forEach((envPath) => {
                    _.each(extensions, function(env, extension, extensions){
                        if (extensions[extension] & envPath.env) {
                            var module = envPath.path + extension;
                            ++loading;
                            var loadExtension = function(mod) {

                                extensions[extension] = mod;

                                --loading;
                                if (waiting && !loading) {
                                    cleanup();
                                }
                            };
                            require([module], function(mod) {
                                loadExtension(mod);
                            });
                        }

                    });
                });


                // Clear up any extensions that don't exist in this environment
                var cleanup = () => {

                    for (let key in extensions) {
                        if (!(typeof extensions[key] === 'object')) delete extensions[key];
                    }

                    loaded();
                };

				waiting = true;
				if (!loading) {
                    cleanup();
				}
			});
		};



	return {
		SERVER:SERVER,
		CLIENT:CLIENT,
        TEST:TEST,
        CLIENT_TEST:CLIENT_TEST,
        SERVER_TEST:SERVER_TEST,
		ready:ready,
		extensions:extensions,
		extend:function(module,modulename){
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
