
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
						});
					}.bind(this)));

				}.bind(this)), failed);

			}.bind(this));
		}.bind(this)),

		findSheetFromFile = (function(image){
			for (var sheet in this.sheets) {
				var file = this.sheets[sheet].file.split('/').pop();
				if (file == image) {
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
					++scriptsToLoad;
					var script = scripts[scriptName],
						scriptFile = "js/scripts/"+script.script;
					script.name = scriptName;
					require([scriptFile], function(script){
						--scriptsToLoad;

						interface.scripts[this.name] = new script();
						Log("Loaded "+this.name);

						// Load components
						var components = [];
						if (Env.isServer && this.server) {
							components = this.server.components;
						} else if (!Env.isServer && this.client) {
							components = this.client.components;
						}
						for (var i=0; i<components.length; ++i) {
							++scriptsToLoad;
							var component = components[i];
							require(["js/scripts/ready/"+component], function(component){
								--scriptsToLoad;
								Log("Loaded "+this.name+"."+component.name);
								interface.scripts[this.name].components[component.name] = component;

								if (scriptsToLoad==0 && ready) {
									succeeded();
								}
							}.bind(this));
						}

						if (scriptsToLoad==0 && ready) {
							succeeded();
						}
					}.bind(script));
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
