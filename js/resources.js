
define(['jquery', 'loggable'], function($, Loggable){


	var Resources = (function(){

		Ext.extend(this,'resources');
		extendClass(this).with(Loggable);
		this.setLogGroup('Resources');
		this.setLogPrefix('(Resources) ');

		var interface = {

			sprites: {},
			sheets: {},
			maps: {},
			npcs: {},
			scripts: {},
			items: {},

			initialize: new Function(),
			findSheetFromFile: new Function(),
			loadScript: new Function(),

		}, initialize = (function(loadingResources){

			return new Promise(function(loaded, failed){

				this.read('data/resources.new.json').then((function(data){
					var resources = JSON.parse(data),
						assets    = { },
						loading   = loadingResources.length;


					_.each(loadingResources, (function(resourceID){
						if (!resources[resourceID]) {
							this.Log("Resource ("+resourceID+") not found", LOG_ERROR);
							failed();
						}

						this.Log("Loading resource: " + resourceID + "("+resources[resourceID]+")");
						this.read('data/' + resources[resourceID]).then((function(data){
							assets[resourceID] = data;
							if (--loading == 0) {
								this.Log("Loaded resource assets");
								loaded(assets);
							}
						}.bind(this)), function(){
							console.log("Error loading resources");
						})
						.catch(Error, function(e){ gameError(e); })
						.error(function(e){ gameError(e); });
					}.bind(this)));

				}.bind(this)), failed)
				.catch(Error, function(e){ gameError(e); })
				.error(function(e){ gameError(e); });

			}.bind(this));
		}.bind(this)),

		findSheetFromFile = (function(image){
			var img = image.split('/').pop();
			for (var sheet in this.sheets) {
				var file = this.sheets[sheet].file.split('/').pop();
				if (file == img) {
					return this.sheets[sheet];
				}
			}
			return false;
		}.bind(interface)),

		loadScripts = (function(scripts){
			return new Promise(function(succeeded, failed){
				this.Log("Loading scripts..");
				var scriptsToLoad = 0,
					ready = false,
					Log = this.Log.bind(this);
				for (var scriptName in scripts) {


					// Is this a script which should be loaded immediately? If not then it is a container for
					// some scripts
					var script = scripts[scriptName];
					if (script.script) {
							

						var scriptFile = "js/scripts/"+script.script;
						script.name = scriptName;
						Log("Loading script: "+scriptFile);
						++scriptsToLoad;
						require([scriptFile], function(script){
							--scriptsToLoad;

							interface.scripts[this.name] = {
								script: script,
								components: {}
							};
							Log("Loaded script: "+this.name);

							// Load components
							var components = {};
							if (Env.isServer && this.server) {
								components = this.server.components;
							} else if (!Env.isServer && this.client) {
								components = this.client.components;
							}
							ready = false;
							if (isObjectEmpty(components)) ready = true;
							_.each(components, function(componentFile, componentName){
								++scriptsToLoad;
								Log("Loading script: "+componentFile);
								require(["js/scripts/"+componentFile], function(component){
									--scriptsToLoad;
									Log("Loaded script: "+this.name+"."+componentName+" waiting on "+scriptsToLoad+" more..");
									interface.scripts[this.name].components[componentName] = component;
									if (scriptsToLoad==0 && ready) {
										succeeded();
									}
								}.bind(this));
								ready = true;
							}.bind(this));

							if (scriptsToLoad==0 && ready) {
								succeeded();
							}
						}.bind(script));

					} else {

						interface.scripts[scriptName] = {};
						var buildChildScripts = function(container, list){

							for (var scriptPart in list) {
								var script = list[scriptPart];
								if (typeof script == 'string') {
									// load this script as container[scriptPart]
									++scriptsToLoad;
									var env = {
										container: container,
										file: script,
										name: scriptPart
									};
									Log("Loading script: "+script);
									require(["scripts/"+script], function(component){
										--scriptsToLoad;
										Log("Loaded script: "+this.file+" waiting on "+scriptsToLoad+" more..");
										this.container[this.name] = component;

										if (scriptsToLoad==0 && ready) {
											succeeded();
										}
									}.bind(env));
									ready = true;
								} else {
									if ((scriptPart == "server" && Env.isServer) ||
										(scriptPart == "client" && !Env.isServer)) {
										// load child scripts under same container
										buildChildScripts(container, script);
									} else {
										// load child scripts
										container[scriptPart] = {};
										buildChildScripts(container[scriptPart], script);
									}
								}
							}
						};

						buildChildScripts(interface.scripts[scriptName], script);
					}
				}
				ready = true;
				if (scriptsToLoad==0) {
					// Wow! That sure loaded fast..
					succeeded();
				}
			}.bind(this));
		}.bind(this));


		interface.initialize = initialize;
		interface.findSheetFromFile = findSheetFromFile;
		interface.loadScripts = loadScripts;

		return interface;
	});

	return Resources;
});
