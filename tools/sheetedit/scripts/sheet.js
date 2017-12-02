
var Sheet = function(canvas){

	var interface = {
			loadSheet: new Function(),
			clearSheet: new Function(),
			clearTilesheet: new Function(),
			adjustSheet: new Function(),
			setMode: new Function(),
			setDragDropMode: new Function(),
			gridMode: new Function(),
			onModified: new Function(),
			onSheetChanged: new Function(),
			modifyAnimation: new Function(),
			removeObject: new Function(),
			removeAnimation: new Function(),
			prepareSheet: new Function(),
            size: new Function()
	},  sheetData = {
			image: null,
			tilesize: 16,
			columns: 0,
			rows: 0,
			sheet_offset: { y:0, x:0 },
			data: {}
	},  ctx = canvas.getContext('2d'),
		showGrid = false,
		dragDropEnabled = false,
		ready = false,
		tilesheet = null,
		preparedSheetData = { },
		settings = {
			lineWidth: 2,
			gridLineWidth: 2,
			lineColour: '#CCCCCC',
			smoothing: false,
			redrawTime: 50,
			hoverAlpha: 0.4,
			gridAlpha: 0.2,
	},  redraw = function(){

			ctx.clearRect(0, 0, canvas.width, canvas.height);
			if (ready) {

				ctx.drawImage(tilesheet, 0, 0, tilesheet.width, tilesheet.height, 0, 0, tilesheet.width, tilesheet.height);

				// draw hover
				if (hover) {
					ctx.save();
					ctx.globalAlpha = settings.hoverAlpha;
					ctx.strokeRect(hover.x - (settings.lineWidth/2), hover.y - (settings.lineWidth/2), hover.w + (settings.lineWidth/2), hover.h + (settings.lineWidth/2));
					ctx.restore();
				}

			   // draw grid
			   if (showGrid) {
				   ctx.save();
				   for (var y=sheetData.sheet_offset.y; y<tilesheet.height; y+=sheetData.tilesize) {
					   for (var x=sheetData.sheet_offset.x; x<tilesheet.width; x+=sheetData.tilesize) {
						   ctx.globalAlpha = settings.gridAlpha;
						   ctx.strokeRect(x - (settings.gridLineWidth/2), y - (settings.gridLineWidth/2), sheetData.tilesize + (settings.gridLineWidth/2), sheetData.tilesize + (settings.gridLineWidth/2));
					   }
				   }
				   ctx.restore();
			   }

				// draw highlights
				for (var selectionType in selections) {

					var selection = selections[selectionType].selection,
						color     = selections[selectionType].color,
						alpha     = selections[selectionType].opacity;
					
					// draw highlighted animation
					if (selectionType == 'animations') {
						var tileSets = selections[selectionType].tileSets;
						for (var i=0; i<tileSets.length; ++i) {
							if (tileSets[i] != highlightedAnimation) {
								continue;
							}

							for (var j=0; j<tileSets[i].tiles.length; ++j) {
								var tile = tileSets[i].tiles[j];
								ctx.save();
								ctx.fillStyle = selections[selectionType].highlight.color;
								ctx.globalAlpha = selections[selectionType].highlight.opacity;
								ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
								ctx.restore();
							}
						}
					}

					for (var i=0; i<selection.tiles.length; ++i) {
						var tile = selection.tiles[i];
						ctx.save();
						ctx.fillStyle = color;
						ctx.globalAlpha = alpha;
						ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
						ctx.restore();
					}

				}

			}
			
			setTimeout(redraw, settings.redrawTime);
	},  selections = {},
		activeSelection = { type: null, selection: null },
		highlightedAnimation = null,
		hover = null;
			
	interface.adjustSheet = function(sheet){
		sheetData.tilesize = parseInt(sheet.tilesize);
		sheetData.sheet_offset.x = parseInt(sheet.sheet_offset.x);
		sheetData.sheet_offset.y = parseInt(sheet.sheet_offset.y);
	};

	interface.getSheetData = function(){
		return sheetData;
	};

	interface.clearTilesheet = function(){
		ready = false;
		tilesheet = null;
	};

	interface.clearSheet = function(shallowClean){

		if (shallowClean) {
			sheetData.image = null;
			sheetData.tilesize = 16;
			sheetData.columns = 0;
			sheetData.rows = 0;
			sheetData.sheet_offset.y = 0;
			sheetData.sheet_offset.x = 0;

			if (!selections.data) selections.data = {};
			if (sheetData.data.animations) sheetData.data.animations = {};
			if (selections.data.animations) sheet.data.animations.selections.tiles = [];

            if (sheetData.data.objects) sheetData.data.objects = {};
            if (selections.data.objects) sheet.data.objects.selections.tiles = [];
            for (var tileType in assetDetails.tileTypes) {
                if (tileType in sheetData.data) sheetData.data[tileType] = {};
                if (tileType in selections.data) sheet.data[tileType].selections.tiles = [];
            }

		} else {
			sheetData = {
				image: null,
				tilesize: 16,
				columns: 0,
				rows: 0,
				sheet_offset: { y:0, x:0 },
				data: {}
			};
			selections = {};
		}
		activeSelection = { type: null, selection: null };
		highlightedAnimation = null;
		hover = null;
	};

	interface.loadSheet = function(sheet, copy){
		interface.clearSheet();
		interface.setDragDropMode(true);
		tilesheet = new Image();
		var sheetDataSetup = function(){

            const tileSize = parseInt(sheetData.tilesize);
            if (sheet.data.objects) {

                selections.objects = {
                    selection: new TilesSelection(),
                    color: "#CCCC00",
                    opacity: 0.4,
                }

                for (var t in sheet.data.objects) {
                    var tx = parseInt(t % sheetData.columns),
                        ty = parseInt(t / sheetData.columns),
                        tile = new Tile( tx * tileSize, ty * tileSize, tileSize, tileSize );

                    selections.objects.selection.tiles.push( tile );
                }
            }

            for (var tileType in assetDetails.tileTypes) {

                if (tileType in sheet.data) {

                    selections[tileType] = {
                        selection: new TilesSelection(),
                        color: assetDetails.tileTypes[tileType].highlight,
                        opacity: assetDetails.tileTypes[tileType].opacity
                    }

                    for (var i=0; i<sheet.data[tileType].length; ++i) {
                        var t = sheet.data[tileType][i],
                            tx = parseInt(t % sheetData.columns),
                            ty = parseInt(t / sheetData.columns),
                            tile = new Tile( tx * tileSize, ty * tileSize, tileSize, tileSize );

                        selections[tileType].selection.tiles.push( tile );
                    }
                }
            }

			if (sheet.data.hasOwnProperty("avatar")) {
				selections.avatar = {
					selection: new TilesSelection(),
					color: '#CCAACC',
					opacity: 0.7,
				}

				var tx = parseInt(sheet.data.avatar % sheetData.columns),
					ty = parseInt(sheet.data.avatar / sheetData.columns),
                    tile = new Tile( tx * tileSize, ty * tileSize, tileSize, tileSize );

				selections.avatar.selection.tiles = [ tile ];
				selections.avatar.selection.addTile = function(tile) {
					this.tiles = [ tile ];
					sheet.data.avatar = tx + ty * sheetData.columns;
				};
			}

			if (sheet.data.animations) {
				selections.animations = {
					selection: new TilesSelection(),
					setAnimationTiles: new Function(),
					tileSets: [],
					color: '#CC00CC',
					opacity: 0.5,
					highlight: {
						color: '#CC0000',
						opacity: 0.8,
					}
				}

				for (var animationName in sheet.data.animations) {
                    const animation = sheet.data.animations[animationName],
                        x = parseInt(animation.x),
                        y = parseInt(animation.y),
                        w = parseInt(animation.w),
                        h = parseInt(animation.h),
                        l = parseInt(animation.l),
						tileSet = {
							name: animationName,
							tiles: []
						};

					selections.animations.tileSets.push( tileSet );

                    for (let i = 0; i < l; ++i) {
                        const tile = new Tile(x + i * w, y, w, h);
                        tile.tileSet = tileSet;
                        tileSet.tiles.push( tile );
                    }
				}

				selections.animations.setAnimationTiles = function(){

					selections.animations.selection.tiles = [];
					for (var i=0; i<selections.animations.tileSets.length; ++i) {

						var tileSet = selections.animations.tileSets[i];
						for (var j=0; j<tileSet.tiles.length; ++j) {
							var tile = tileSet.tiles[j];
							selections.animations.selection.addTile( tile, true );
						}
					}

				}

				selections.animations.setAnimationTiles();
			}

		};
		tilesheet.onload = function(){

			if (copy) {

                for (var tileType in assetDetails.tileTypes) {
                    if (tileType in sheet.data) sheetData.data[tileType] = sheet.data[tileType];
                }

                if (sheet.data.objects) sheetData.data.objects = sheet.data.objects;
				if (sheet.data.animations) sheetData.data.animations = sheet.data.animations;
				sheetData.tilesize = sheet.tilesize;
				sheetData.sheet_offset.x = sheet.sheet_offset.x;
				sheetData.sheet_offset.y = sheet.sheet_offset.y;
				sheetData.columns = sheet.columns;
				sheetData.rows = sheet.rows;

			} else {

				sheetData.data = sheet.data;
				sheetData.tilesize = parseInt(sheet.tilesize) || 16;
				sheetData.sheet_offset.x = parseInt(sheet.sheet_offset.x);
				sheetData.sheet_offset.y = parseInt(sheet.sheet_offset.y);
				sheetData.columns = parseInt( (tilesheet.width - parseInt(sheet.sheet_offset.x)) / sheet.tilesize );
				sheetData.rows = parseInt( (tilesheet.height - parseInt(sheet.sheet_offset.y)) / sheet.tilesize );

			}

			sheetDataSetup();

			canvas.style.width  = this.width;
			canvas.style.height = this.height;
			canvas.width        = this.width;
			canvas.height       = this.height;

			ready = true;
		};
		tilesheet.src = sheet.image;
		if (sheet.image == "") sheetDataSetup();
	};

	interface.setMode = function(selectionType, highlightAnimation){

        if (selectionType in assetDetails.tileTypes) {
            // Tile?
			activeSelection = { type: selectionType, selection: selections[selectionType].selection };
        } else if (selectionType == 'objects') {
			activeSelection = { type: selectionType, selection: selections.objects.selection };
		} else if (selectionType == 'animation') {
			activeSelection = { type: 'animation', selection: selections.animations.selection };
			if (highlightAnimation) {
				var tileSet = null;
				for (var i=0; i<selections.animations.tileSets.length; ++i) {
					var _tileSet = selections.animations.tileSets[i];
					if (_tileSet.name == highlightAnimation) {
						tileSet = _tileSet;
						break;
					}
				}


				if (!tileSet) {
					// animation not added to sheet yet
					var animation = sheetData.data.animations[highlightAnimation],
                        x = parseInt(animation.x),
                        y = parseInt(animation.y),
                        w = parseInt(animation.w),
                        h = parseInt(animation.h),
                        l = parseInt(animation.l),
						tileSet = {
							name: highlightAnimation,
							tiles: []
						};

					selections.animations.tileSets.push( tileSet );

					for (var i=0; i<l; ++i) {
						var tile = new Tile( x + w * i, y, w, h );
						tile.tilesSet = tileSet;
						tileSet.tiles.push( tile );
					}

					selections.animations.setAnimationTiles();
				}
				highlightedAnimation = tileSet;


				interface.modifyAnimation = function(data){
					highlightedAnimation.tiles = [];

					for (var i=0; i<data.l; ++i) {
						var tile = new Tile( data.x + i * data.w, data.y, data.w, data.h );
						tile.tilesSet = highlightedAnimation;
						highlightedAnimation.tiles.push( tile );
					}
					selections.animations.setAnimationTiles();
				};

			}
		} else if (selectionType == 'avatar') {
			activeSelection = { type: 'avatar', selection: selections.avatar.selection };
		} else {
			activeSelection = null;
		}
	};

	interface.gridMode = function(show){
		showGrid = show;
	};

	interface.setDragDropMode = function(allow){
		dragDropEnabled = allow;
	}

	interface.removeObject = function(coord){
		var tileSet = null;
		for (var i=0; i<selections.objects.selection.tiles.length; ++i) {
			var _tile = selections.objects.selection.tiles[i],
				tx    = _tile.x / _tile.w,
				ty    = _tile.y / _tile.h;
			if (parseInt(coord) == (ty*sheetData.columns + tx)) {
				selections.objects.selection.tiles.splice(i, 1);
				break;
			}
		}
	};

	interface.removeAnimation = function(animationName){
		var tileSet = null;
		for (var i=0; i<selections.animations.tileSets.length; ++i) {
			var _tileSet = selections.animations.tileSets[i];
			if (_tileSet.name == animationName) {
				selections.animations.tileSets.splice(i, 1);
				break;
			}
		}
		selections.animations.setAnimationTiles();
	};

	interface.prepareSheet = function(sheetType){
		if (sheetType == 'tilesheet') {
            for (var tileType in assetDetails.tileTypes) {
                preparedSheetData[tileType] = [];
            }
            preparedSheetData.objects = {};
		} else if (sheetType == 'spritesheet') {
			preparedSheetData = {
				animations: [],
			};
		} else {

		}
	};

    interface.size = function(){
        return {
            width: tilesheet.width,
            height: tilesheet.height
        };
    };


	// ========================================================== //
	// ================    Canvas Interaction    ================ //
	// ========================================================== //


	ctx.webkitImageSmoothingEnabled = settings.smoothing;
	ctx.strokeStyle = settings.lineColour;
	ctx.lineWidth = settings.lineWidth;

    // Tile has a real x, y coordinate, and a width/height
    // Since some sprites could have different sizes, and all be squeezed into the same tilesheet,
    // we need to be able to specify different widths/heights for tiles per tilesheet
	const Tile = function(x, y, w, h) {
		if (y < 0 || x < 0) throw new RangeError("Bad tile: ("+y+","+x+")");
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
	};

	// Selection 
	// 	 - Draw: currently selected, currently selecting
	// 	 - TODO: On drag: start a rectangle selection
	var TilesSelection = function() {
		this.tiles = [];
		this.addTile = function(tile, dontRemove) {
			for (var i = 0; i<this.tiles.length; ++i) {
                if
                (
                    this.tiles[i].x == tile.x &&
                    this.tiles[i].y == tile.y &&
                    this.tiles[i].w == tile.w &&
                    this.tiles[i].h == tile.h
                ) {

					// Already added
					if (!dontRemove) {
						// Remove tile..
						this.tiles.splice(i, 1);
					}
					return false;
				}
			}

			this.tiles.push(tile);
		};
	};

	canvas.addEventListener('mousemove', function(evt) {
		if (ready) {
            const tsW  = tilesheet.width,
                  tsH  = tilesheet.height,
                  cvsW = $(canvas).width(),
                  cvsH = $(canvas).height(),
                  rW   = tsW / cvsW,
                  rH   = tsH / cvsH,
                  y    = rH * (evt.pageY - this.offsetTop),
                  x    = rW * (evt.pageX - this.offsetLeft),
                  ts   = parseInt(sheetData.tilesize),
                  ty   = ts * Math.floor(y / ts),
                  tx   = ts * Math.floor(x / ts);

			hover = new Tile(tx, ty, ts, ts);
		}

		return false;
	});

	canvas.addEventListener('mousedown', function(evt) {
		evt.preventDefault();
		if (ready) {
			if (hover && activeSelection && activeSelection.selection) {
				activeSelection.selection.addTile(hover);
				interface.onModified(activeSelection);
			}
		}

		return false;
	});


	redraw();



	// ========================================================== //
	// ================     Canvas Drag/Drop     ================ //
	// ========================================================== //

	canvas.ondragover = function () { if (!dragDropEnabled){return false} this.className = 'hover'; return false; };
	canvas.ondragend  = function () { if (!dragDropEnabled){return false} this.className = ''; return false; };
	canvas.ondrop     = function(e) {
		this.className = '';
		e.preventDefault();

		if (!dragDropEnabled) return false;

		var file = e.dataTransfer.files[0],
			isTilesheet = (file.type.indexOf('image') >= 0),
			reader = new FileReader();
		reader.onload = function (event) {

			// event is an image OR a json file?
			if (isTilesheet) {
				interface.clearSheet(true);
				// tilesheet = new Image();
				var sheetName = "/sprites/" + file.name,
					sheet = {
					id:"New Tilesheet",
					image: sheetName,
					tilesize: 16,
					columns: 0,
					rows: 0,
					sheet_offset: {
						x: 0,
						y: 0
					},
					data: {}
				};

				if (sheetData && sheetData.data && !_.isEmpty(sheetData.data)) {
					sheet.data = sheetData;
				} else {
					sheet.data = preparedSheetData;
				}

				// FIXME: THIS is what's causing the error where we create a new spritesheet/tilesheet and
				// lose our reference to the outside sheet. Either we have to manually link afterwards, or
				// perform the loadSheet functionality here instead of calling loadSheet; or extend loadSheet?
				interface.loadSheet(sheet, false); // FIXME: this was set to true, why?



				interface.onSheetChanged( sheetName, sheet );
				/*
				tilesheet.onload = function() { 
					canvas.style.width  = tilesheet.width;
					canvas.style.height = tilesheet.height;
					canvas.width  = tilesheet.width;
					canvas.height = tilesheet.height;

					// if (tilesheet.width % 16 != 0 ||
					// 	tilesheet.height % 16 != 0) {
					// 	throw new RangeError("Tilesheet bad dimensions: ("+tilesheet.height+"x"+tilesheet.width+")");
					// }

					sheetData.image = "/sprites/" + file.name; // NOTE: this is the best we can do, ONLY to get the filename
					sheetData.rows = parseInt(tilesheet.height / sheetData.tilesize);
					sheetData.columns = parseInt(tilesheet.width / sheetData.tilesize);
					interface.onSheetChanged( sheetData.image );
					ready = true;

				}
				tilesheet.src = event.target.result;
				*/
			}
		};

		if (isTilesheet) {
			reader.readAsDataURL(file);
		}

		return false;
	};


	return interface;
};
