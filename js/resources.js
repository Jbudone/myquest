
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

			initialize: new Function(),
			findSheetFromFile: new Function(),

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
		}.bind(interface));


		interface.initialize = initialize;
		interface.findSheetFromFile = findSheetFromFile;

		return interface;
	});

	return Resources;
});
