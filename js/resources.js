
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
			interactables: {},

			initialize: new Function(),
			findSheetFromFile: new Function(),
			loadScript: new Function(),

			loadItemScripts: new Function(),
			loadInteractableScripts: new Function()

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

								var result = initializeAssets(assets, loadingResources);
								if (_.isError(result)) {
									failed(result);
									return;
								}

								this.Log("Initialized resource assets");

								loaded(assets);
							}
						}.bind(this)), function(){
							console.log("Error loading resources");
						})
						.catch(Error, function(e){ errorInGame(e); })
						.error(function(e){ errorInGame(e); });
					}.bind(this)));

				}.bind(this)), failed)
				.catch(Error, function(e){ errorInGame(e); })
				.error(function(e){ errorInGame(e); });

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

		initializeAssets = (function(assets, orderOfInitialization){

			for (var i=0; i<orderOfInitialization.length; ++i) {
				var assetID = orderOfInitialization[i],
					asset   = assets[assetID],
					result  = null;
				Log("Loading: "+ assetID);
				try {
					result = initializeAsset(assetID, asset);
					if (_.isError(result)) {
						Log("Failed to load asset: "+ assetID, LOG_ERROR);
						return result;
					}
					Log("Loaded: "+ assetID);
				} catch(e) {
					Log(e, LOG_ERROR);
					return e;
				}
			}
		}.bind(interface)),

		initializeAsset = (function(assetID, asset){
			if (assetID == 'sheets') return initializeSheets(asset);
			else if (assetID == 'npcs') return initializeNPCs(asset);
			else if (assetID == 'items') return initializeItems(asset);
			else if (assetID == 'interactables') return initializeInteractables(asset);
			else if (assetID == 'scripts') return initializeScripts(asset);
			else if (assetID == 'world') return initializeWorld(asset);
			else return new Error("Unknown asset: "+ assetID);
		}),

		initializeSheets = (function(asset){

			var res = JSON.parse(asset);
			var makeSheet = function(_sheet){
				var sheet = {
					file: _sheet.image,
					offset: {
						x: parseInt(_sheet.sheet_offset.x),
						y: parseInt(_sheet.sheet_offset.y),
					},
					tileSize: {
						width: parseInt(_sheet.tilesize),
						height: parseInt(_sheet.tilesize),
					},
					image: (Env.isServer? null : (new Image())),
					tilesPerRow: parseInt(_sheet.columns),
					data: { },
					gid: {}
				};

				if (!Env.isServer) {
					sheet.image.src = location.origin + location.pathname + sheet.file;
				}
				return sheet;
			};
			var gid = 0;
			for (var i=0; i<res.tilesheets.list.length; ++i) {
				var _sheet = res.tilesheets.list[i],
					sheet  = makeSheet( _sheet );


				sheet.gid.first = gid;
				gid += parseInt(_sheet.rows) * parseInt(_sheet.columns) + 1;
				sheet.gid.last = gid - 1;
				if (_sheet.data.objects) {
					sheet.data.objects = {};
					for (var objCoord in _sheet.data.objects) {
						var id = _sheet.data.objects[objCoord];
						sheet.data.objects[ parseInt(objCoord) ] = id;
					}
				}

				if (_sheet.data.collisions) {
					sheet.data.collisions = [];
					for (var j=0; j<_sheet.data.collisions.length; ++j) {
						sheet.data.collisions.push( parseInt( _sheet.data.collisions[j] ) );
					}
				}

				if (_sheet.data.floating) {
					sheet.data.floating = [];
					for (var j=0; j<_sheet.data.floating.length; ++j) {
						sheet.data.floating.push( parseInt( _sheet.data.floating[j] ) );
					}
				}

				this.sheets[_sheet.id] = sheet;
			}

			if (Env.isServer) {

				for (var i=0; i<res.spritesheets.list.length; ++i) {
					var _sheet = res.spritesheets.list[i],
						sheet  = makeSheet( _sheet );

					sheet.data.animations = {};
					this.sprites[_sheet.id] = sheet;
				}

			} else {

				for (var i=0; i<res.spritesheets.list.length; ++i) {
					var _sheet = res.spritesheets.list[i],
						sheet  = makeSheet( _sheet );

					sheet.data.animations = {};

					var env = {
						animations: _sheet.data.animations,
						_sheet: _sheet,
						sheet: sheet
					};

					var NOFLIPX = 1<<0,
						FLIPX   = 1<<1;
					var prepareImage = (function(){

						var animations = this.animations,
							_sheet     = this._sheet,
							sheet      = this.sheet;


						// Figure out the dimensions of our spritesheet
						var canvas  = document.createElement('canvas'),
							ctx     = canvas.getContext('2d'),
							allRows = {},
							rows    = 0,
							cols    = 0,
							tWidth  = sheet.tileSize.width,
							tHeight = sheet.tileSize.height;
						for (var key in animations){
							var ani   = animations[key],
								row   = parseInt(ani.row),
								len   = parseInt(ani.length),
								flipX = (ani.hasOwnProperty('flipX') && ani.flipX == "true");
							if (!allRows[row]) {
								allRows[row] = { flipX: (ani.flipX?FLIPX:NOFLIPX) };
								++rows;
							} else if (!(allRows[row].flipX & (flipX?FLIPX:NOFLIPX))) {
								allRows[row].flipX |= (flipX?FLIPX:NOFLIPX);
								++rows;
							}

							if (len > cols) {
								cols = len;
							}
						}

						canvas.height = tHeight * rows;
						canvas.width  = tWidth  * cols;

						// Draw animations to sheet
						var iRow = 0;
						for(var key in animations){
							var ani = animations[key],
								row   = parseInt(ani.row),
								len   = parseInt(ani.length);
							if (ani.hasOwnProperty('flipX')) {


								try {
									// For Chrome
									ctx.save();
									ctx.scale(-1,1);
									for(var i=len-1, j=0; i>=0; --i, ++j) {
										ctx.drawImage(sheet.image, i*tWidth - sheet.offset.x, row*tHeight - sheet.offset.y, tWidth, tHeight, -i*tWidth, iRow*tHeight, -tWidth, tHeight);
									}
									ctx.restore();
								} catch(e) {
									// For Firefox
									// ctx.scale(-1,1);
									ctx.restore();
									ctx.save();
									ctx.scale(-1,1);
									for(var i=len-1, j=0; i>=0; --i, ++j) {
										ctx.drawImage(sheet.image, j*tWidth, row*tHeight, tWidth, tHeight, -(j+1)*tWidth, iRow*tHeight, tWidth, tHeight);
									}
									ctx.restore();
									// for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
									// 	ctx.drawImage(sheet.image, j*32, ani.row*32, 32, 32, j*32, 0, 32, 32);
									// }
									// ctx.transform(-1,0,0,1,0,0);  
								}

							} else {
								ctx.drawImage(sheet.image, -sheet.offset.x, row*tHeight - sheet.offset.y, tWidth*len, tHeight, 0, iRow*tHeight, tWidth*len, tHeight);
							}

							ani.row = (iRow++);
							ani.length = len;
							delete ani.flipX;
							sheet.data.animations[key] = ani;
						}

						sheet.image = new Image();
						sheet.image.src = canvas.toDataURL("image/png");

					}.bind(env));

					sheet.image.onload = prepareImage;
					if (sheet.image.complete) prepareImage(); // In case its already loaded

					this.sprites[_sheet.id] = sheet;
				}

			}

		}.bind(interface)),


		initializeNPCs = (function(asset){
			var res = JSON.parse(asset).npcs;
			for (var i=0; i<res.length; ++i) {
				var npc = res[i];
				this.npcs[npc.id]=npc;
			}
		}.bind(interface)),

		initializeItems = (function(asset){

			var ItemBase = function(itemBase){
				var item        = itemBase,
					environment = (Env.isServer ? 'server' : 'client');
				this.invoke = function(name, character, args){
					var new_item = new item(character, args);
					if (new_item.hasOwnProperty(environment)) {
						for (var itm_key in new_item[environment]) {
							new_item[itm_key] = new_item[environment][itm_key];
						}
						delete new_item.client;
						delete new_item.server;
					}

					if (new_item.hasOwnProperty('initialize')) {
						return new_item.initialize(name, character, args);
					}
				};
			};
			
			this.loadItemScripts = function(){
				return new Promise(function(loaded, failed){
					var itemsToLoad = 0;
					_.each(this.items.base, function(nothing, itemBase){
						var baseFile = 'scripts/items.'+itemBase;
						++itemsToLoad;
						requirejs([baseFile], function(baseScript){
							this.items.base[itemBase] = new ItemBase(baseScript);
							if (--itemsToLoad === 0) {
								loaded();
							}
						}.bind(this));
					}.bind(this));
				}.bind(this));
			};


			// Items
			var res = JSON.parse(asset).items;

			this.items.list = {};
			this.items.base = {};
			for (var i=0; i<res.length; ++i) {
				var item = res[i];
				this.items.list[item.id] = item;
				if (!this.items.base.hasOwnProperty(item.base)) {
					this.items.base[item.base] = null;
				}
				for (var sheetName in this.sheets) {
					var sheet = this.sheets[sheetName];
					if (!sheet.hasOwnProperty('data')) continue;
					if (!sheet.data.hasOwnProperty('objects')) continue;

					for (var sprite in sheet.data.objects) {
						if (sheet.data.objects[sprite] == item.id) {
							item.sprite = parseInt(sprite) + sheet.gid.first;
							break;
						}
					}
					if (item.hasOwnProperty('sprite')) break;
				}
			}
			this.items['items-not-loaded'] = true;
			// NOTE: save item base scripts (like scripts) loading/initialization until we've setup the
			// scripting environment
		}.bind(interface)),

		initializeInteractables = (function(asset){

			var InteractableBase = function(interactableBase){
				var interactable = interactableBase.base,
					environment  = (Env.isServer ? 'server' : 'client');
				this.invoke = function(name, character, args){
					var new_interactable = new interactable(name, character, args);
					if (new_interactable.hasOwnProperty(environment)) {
						for (var itm_key in new_interactable[environment]) {
							new_interactable[itm_key] = new_interactable[environment][itm_key];
						}
						delete new_interactable.client;
						delete new_interactable.server;
					}

					if (new_interactable.hasOwnProperty('initialize')) {
						return new_interactable.initialize(name, character, args);
					}
				};
				this.handledBy = interactableBase.handledBy;
			};

			this.loadInteractableScripts = function(){
				return new Promise(function(loaded, failed){
					var interactablesToLoad = 0;
					_.each(this.interactables.base, function(nothing, interactableBase){
						var baseFile = 'scripts/interactables.'+interactableBase;
						++interactablesToLoad;
						requirejs([baseFile], function(baseScript){
							this.interactables.base[interactableBase] = new InteractableBase(baseScript);
							if (--interactablesToLoad === 0) {
								loaded();
							}
						}.bind(this));
					}.bind(this));
				}.bind(this));
			};

			// Interactables
			var res = JSON.parse(asset).interactables;

			this.interactables.list = {};
			this.interactables.base = {};
			for (var i=0; i<res.length; ++i) {
				var interactable = res[i];
				this.interactables.list[interactable.id] = interactable;
				if (!this.interactables.base.hasOwnProperty(interactable.base)) {
					this.interactables.base[interactable.base] = null;
				}
			}
			this.interactables['interactables-not-loaded'] = true;
			// NOTE: save interactable base scripts (like scripts) loading/initialization until we've setup the
			// scripting environment
		}.bind(interface)),


		initializeScripts = (function(asset){
			var scripts = JSON.parse(asset);
			this._scriptRes = scripts;
			// NOTE: save script loading/initialization until we've setup the scripting environment
		}.bind(interface)),

		initializeWorld = (function(asset){
			// Intentionally blank (only handled by server)
		});

		interface.initialize = initialize;
		interface.findSheetFromFile = findSheetFromFile;
		interface.loadScripts = loadScripts;

		return interface;
	});

	return Resources;
});
