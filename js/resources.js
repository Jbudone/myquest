define(['loggable', 'resourceProcessor'], function(Loggable, ResourceProcessor){


	// TODO: Cleanup resource loading to utilize Promises (Promise.all? Promise.join?)
	var Resources = (function(){

		Ext.extend(this,'resources');
		extendClass(this).with(Loggable);
		this.setLogGroup('Resources');
		this.setLogPrefix('Resources');

		var Log = this.Log.bind(this);

        var componentsAssets = null;

		var _interface = {

			sprites: {},
			sheets: {},
			areas: {},
			npcs: {},
			scripts: {},
			items: {},
            buffs: {},
			interactables: {},
            components: {},
            rules: {},
            fx: {},
            cache: {},

			initialize: function(){},
			findSheetFromFile: function(){},
			loadScripts: function(){},
            loadComponents: function(){},

			loadItemScripts: function(){},

            fetchImage: function(){},
            fetchSound: function(){},

		}, initialize = (function(loadingResources){

			return new Promise(function(loaded, failed){

                const resourcesPath = Env.connection.resources;

				this.read(resourcesPath).then((function(data){
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

                                var onFinished = function(){
                                    this.Log("Initialized resource assets");
                                    loaded(assets);
                                };

                                if (result instanceof Promise) {
                                    result.then(onFinished).catch(failed);
                                } else {
                                    onFinished();
                                }

							}
						}.bind(this)), function(){
							this.Log("Error loading resources", LOG_ERROR);
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
		}.bind(_interface)),

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
							

						var scriptFile = "dist/scripts/"+script.script;
						script.name = scriptName;
						Log("Loading script: "+scriptFile);
						++scriptsToLoad;
						require([scriptFile], function(script){
							--scriptsToLoad;

							_interface.scripts[this.name] = {
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
								require(["dist/scripts/"+componentFile], function(component){
									--scriptsToLoad;
									Log("Loaded script: "+this.name+"."+componentName+" waiting on "+scriptsToLoad+" more..");
									_interface.scripts[this.name].components[componentName] = component;
									if (scriptsToLoad==0 && ready) {
										succeeded();
									}
								}.bind(this));
								ready = true;
							}.bind(this));

							if (scriptsToLoad==0 && ready) {
								succeeded();
							}
						}.bind(script), function(err){ errorInGame(err); });

					} else {

						_interface.scripts[scriptName] = {};
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

						buildChildScripts(_interface.scripts[scriptName], script);
					}
				}
				ready = true;
				if (scriptsToLoad==0) {
					// Wow! That sure loaded fast..
					succeeded();
				}
			}.bind(this));
		}.bind(this)),

		initializeAssets = (function(assets, orderOfInitialization){

            let loadingAssets = [];
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

                    if (result instanceof Promise) {
                        Log("Waiting on: "+ assetID);
                        loadingAssets.push(result);
                    } else {
                        Log("Loaded: "+ assetID);
                    }
				} catch(e) {
					Log(e, LOG_ERROR);
					return e;
				}
			}

            if (loadingAssets.length > 0) {
                return new Promise((loaded, failed) => {
                    Promise.all(loadingAssets).then(loaded).catch(failed);
                });
            } else {
                return true;
            }
		}.bind(_interface)),

		initializeAsset = (function(assetID, asset){
			if (assetID == 'sheets') return initializeSheets(asset);
			else if (assetID == 'npcs') return initializeNPCs(asset);
			else if (assetID == 'rules') return initializeRules(asset);
            else if (assetID == 'fx') return initializeFX(asset);
			else if (assetID == 'items') return initializeItems(asset);
			else if (assetID == 'buffs') return initializeBuffs(asset);
			else if (assetID == 'interactables') return initializeInteractables(asset);
			else if (assetID == 'quests') return initializeQuests(asset);
			else if (assetID == 'interactions') return initializeInteractions(asset);
			else if (assetID == 'scripts') return initializeScripts(asset);
			else if (assetID == 'world') return initializeWorld(asset);
			else if (assetID == 'components') return initializeComponents(asset);
			else if (assetID == 'cache') return initializeCache(asset);
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
					image: ((Env.isServer||Env.isBot)? null : (new Image())),
					tilesPerRow: parseInt(_sheet.columns),
					data: { }
				};

				if (_sheet.hasOwnProperty('gid')) {
					sheet.gid = {
						first: parseInt(_sheet.gid.first),
						last: parseInt(_sheet.gid.last)
					}
				}

				return sheet;
			};
			var gid = 0;
            _.each(res.tilesheets.list, (_sheet) => {
				var sheet  = makeSheet( _sheet );


				// sheet.gid.first = gid;
				// gid += parseInt(_sheet.rows) * parseInt(_sheet.columns) + 1;
				// sheet.gid.last = gid - 1;
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

				if (_sheet.data.shootable) {
					sheet.data.shootable = [];
					for (var j=0; j<_sheet.data.shootable.length; ++j) {
						sheet.data.shootable.push( parseInt( _sheet.data.shootable[j] ) );
					}
				}

                if (!Env.isServer) {
                    ResourceProcessor.readImage(_sheet.id).then((bitmapImage) => {
                        sheet.image = bitmapImage;
                    }, (err) => {
                        throw Err(err);
                    });
                }

				this.sheets[_sheet.id] = sheet;
			});

			if (Env.isServer || Env.isBot) {

				for (var i=0; i<res.spritesheets.list.length; ++i) {
					var _sheet = res.spritesheets.list[i],
						sheet  = makeSheet( _sheet );

                    sheet.spriteSize = {
						w: parseInt(_sheet.sprite_size.w),
						h: parseInt(_sheet.sprite_size.h)
                    };

					sheet.data.animations = {};
					this.sprites[_sheet.id] = sheet;
				}

			} else {

                _.each(res.spritesheets.list, (_sheet) => {
                    var sheet  = makeSheet( _sheet );

                    sheet.spriteSize = {
						w: parseInt(_sheet.sprite_size.w),
						h: parseInt(_sheet.sprite_size.h)
                    };

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
                            totalHeight = 0,
                            totalWidth = 0,
                            magicNumber = 999999999,
                            spriteW = parseInt(_sheet.sprite_size.w),
                            spriteH = parseInt(_sheet.sprite_size.h);
						for (var key in animations){
							var ani   = animations[key],
                                x   = parseInt(ani.x),
                                y   = parseInt(ani.y),
                                w   = parseInt(ani.w),
                                h   = parseInt(ani.h),
                                l   = parseInt(ani.l),
                                sxy = parseInt(ani.y) * magicNumber + parseInt(ani.x),
                                height = h,
                                width = spriteW * l,
								flipX = (ani.hasOwnProperty('flipX') && ani.flipX == "true");

                            ani.x = x;
                            ani.y = y;
                            ani.w = w;
                            ani.h = h;
                            ani.l = l;

                            totalHeight += spriteH;
                            if (width > totalWidth) {
                                totalWidth = width;
							}
						}

						canvas.height = totalHeight;
						canvas.width  = totalWidth;

						// Draw animations to sheet
                        var iRow = 0,
                            curY = 0;
						for(var key in animations){
							var ani = animations[key];
                            var { x, y, w, h, l } = ani;
							if (ani.hasOwnProperty('flipX')) {


								try {
									// For Chrome
									ctx.save();
									ctx.scale(-1,1);
									for(var i=l-1, j=0; i>=0; --i, ++j) {
                                        ctx.drawImage(sheet.image, i*w + x - sheet.offset.x, y - sheet.offset.y, w, h, -i*spriteW, curY, -spriteW, spriteH);
									}
									ctx.restore();
								} catch(e) {
									// For Firefox
									// ctx.scale(-1,1);
									ctx.restore();
									ctx.save();
									ctx.scale(-1,1);
									for(var i=len-1, j=0; i>=0; --i, ++j) {
										ctx.drawImage(sheet.image, x + j*w - sheet.offset.x, y - sheet.offset.y, w, h, -(j+1)*spriteW, curY, spriteW, spriteH);
									}
									ctx.restore();
									// for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
									// 	ctx.drawImage(sheet.image, j*32, ani.row*32, 32, 32, j*32, 0, 32, 32);
									// }
									// ctx.transform(-1,0,0,1,0,0);  
								}

							} else {
								ctx.drawImage(sheet.image, x - sheet.offset.x, y - sheet.offset.y, l*w, h, 0, curY, spriteW*l, spriteH);
							}

							ani.row = (iRow++);
							ani.length = ani.l;
							delete ani.flipX;
                            sheet.data.animations[key] = {
                                x: 0,
                                y: curY,
                                w: spriteW,
                                h: spriteH,
                                l
                            };

                            curY += spriteH;
						}

                        // NOTE: To debug canvas just uncomment this
                        //document.body.appendChild(canvas);

						sheet.image = new Image();
						sheet.image.src = canvas.toDataURL("image/png");

					}.bind(env));

                    if (!Env.isServer) {
                        ResourceProcessor.readImage(_sheet.id).then((bitmapImage) => {
                            sheet.image = bitmapImage;
                            prepareImage();
                        }, (err) => {
                            throw Err(err);
                        });
                    }

                    this.sprites[_sheet.id] = sheet;
				});

			}

		}.bind(_interface)),


		initializeNPCs = (function(asset){
			var res = JSON.parse(asset).npcs;
			for (var i=0; i<res.length; ++i) {
				var npc = res[i];
				this.npcs[npc.id]=npc;
			}
		}.bind(_interface)),

		initializeBuffs = (function(asset){

            return new Promise((loaded, failed) => {
                var res = JSON.parse(asset).buffs,
                    loading = 0;
                res.forEach((buff) => {

                    var buffBaseRes = buff.base,
                        baseFile = "scripts/buffs."+buffBaseRes;
                    ++loading;
                    this.buffs[buff.id]=buff;
                    requirejs([baseFile], function(baseScript) {
                        buff.base = baseScript;

                        --loading;
                        if (loading === 0) {
                            loaded();
                        }
                    });
                });
            });
		}.bind(_interface)),

		initializeRules = (function(asset){
			var res = JSON.parse(asset);
            this.rules = res;
		}.bind(_interface)),

        initializeFX = (function(asset){
			var res = JSON.parse(asset);
            this.fx = res;
        }.bind(_interface)),

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
                            this.items.loading[itemBase].finished();
                            delete this.items.loading[itemBase];
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
			this.items.loading = {};
			for (var i=0; i<res.length; ++i) {
				var item = res[i];
				this.items.list[item.id] = item;
				if (!this.items.base.hasOwnProperty(item.base)) {
					this.items.base[item.base] = null;

                    // Since some scripts may attempt to invoke an item before their scripts have been loaded, need to
                    // setup this object for queued invocation.
                    // TODO: Clean this up and potentially extend for other things (eg. interaction)
                    this.items.loading[item.base] = {
                        onLoadedList: [],
                        finished: function() {
                            for (let i = 0; i < this.onLoadedList.length; ++i) {
                                this.onLoadedList[i]();
                            }
                        },
                        then: function(fn) {
                            this.onLoadedList.push(fn);
                        }
                    };
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


                // Load item types
                let itm_type = 0;
                for (let i = 0; i < item.types.length; ++i) {
                    let typeStr = 'ITM_' + item.types[i],
                        type    = global[typeStr];
                    itm_type |= type;
                }
                item.type = itm_type;
			}
			this.items['items-not-loaded'] = true;
			// NOTE: save item base scripts (like scripts) loading/initialization until we've setup the
			// scripting environment
		}.bind(_interface)),

		initializeInteractables = (function(asset){

			// Interactables
			var res = JSON.parse(asset).interactables;

			this.interactables.list = {};
			for (var i=0; i<res.length; ++i) {
				var interactable = res[i];
				this.interactables.list[interactable.id] = interactable;
			}
		}.bind(_interface)),

		initializeQuests = (function(asset){
			var res = JSON.parse(asset);
            this.quests = res;
		}.bind(_interface)),

		initializeInteractions = (function(asset){
			var res = JSON.parse(asset);
            this.interactions = res;
		}.bind(_interface)),

		initializeScripts = (function(asset){
			var scripts = JSON.parse(asset);
			this._scriptRes = scripts;
			// NOTE: save script loading/initialization until we've setup the scripting environment
		}.bind(_interface)),

		initializeWorld = (function(asset){
			// Intentionally blank (only handled by server)
		}),

        initializeComponents = (function(asset){

			var res = JSON.parse(asset);
            componentsAssets = res;
        }.bind(_interface)),

        initializeCache = (function(asset){

			var res = JSON.parse(asset);
            this.cache = res;
        }.bind(_interface)),

        loadComponents = (function(){

            return new Promise(function(loaded, failed){
                let numLoading = 0;
                _.each(componentsAssets, function(componentFilename, componentName){
                    let componentFile = 'scripts/'+componentFilename;
                    ++numLoading;
                    requirejs([componentFile], function(component){
                        this.components[componentName] = component;

                        // FIXME: Should confirm component object
                        if (!component.name) throw Err(`Component [${componentName}] did not have a name!`)
                        if (!component.initialState) throw Err(`Component [${componentName}] did not have an initialState!`)
                        if (!component.newInstance) throw Err(`Component [${componentName}] did not have a newInstance!`)
                        
                        if (--numLoading === 0) {
                            loaded();
                        }
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        }.bind(_interface));

        _interface.fetchImage = (function(imageRes){

            return new Promise(function(succeeded, failed){

                const imgEl = $('<img/>');

                // Find image from imageRes
                // Set image to imgEl
                // Set background position + width/height for image
                const img = new Image();
                img.onload = function() {
                    succeeded(this);
                };

                const cacheNode = this.cache.cacheList.find((el) => el.name === imageRes);
                assert(cacheNode, `Could not find cache for ${imageRes}`);
                const url = cacheNode.asset;
                img.src = url;

                // FIXME: Cache asset, then just return that cached image; we only need 1 instance of each image, but
                // jquery should clone image to multiple elements
                // FIXME: If we pack images, then need to cache the packed image, find this particular image and create
                // a copy of an image out of that, then cache that
            }.bind(this));
        }.bind(_interface));

        _interface.fetchSound = (function(soundRes){

            return new Promise(function(success, fail){

                const cacheNode = this.cache.cacheList.find((el) => el.name === soundRes);
                assert(cacheNode, `Could not find cache for ${soundRes}`);
                const src = cacheNode.asset;

                const request = new XMLHttpRequest();
                request.open('GET', src, true);
                request.responseType = 'arraybuffer';

                // Decode asynchronously
                request.onload = function() {
                    if (request.status === 404) {
                        assert(!Env.assertion.requiresResources, `Could not find resource: {soundRes}`);
                        fail(null);
                    } else {
                        success(request.response);
                    }
                }
                request.send();
            }.bind(this));
        }.bind(_interface));

		_interface.initialize = initialize;
		_interface.findSheetFromFile = findSheetFromFile;
		_interface.loadScripts = loadScripts;
        _interface.loadComponents = loadComponents;

		return _interface;
	});

	return Resources;
});
