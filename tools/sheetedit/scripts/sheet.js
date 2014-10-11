
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
			removeAnimation: new Function(),
			prepareSheet: new Function()
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
					ctx.strokeRect(sheetData.tilesize*hover.x - (settings.lineWidth/2), sheetData.tilesize*hover.y - (settings.lineWidth/2), sheetData.tilesize + (settings.lineWidth/2), sheetData.tilesize + (settings.lineWidth/2));
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
								ctx.fillRect(sheetData.tilesize*tile.x, sheetData.tilesize*tile.y, sheetData.tilesize, sheetData.tilesize);
								ctx.restore();
							}
						}
					}

					for (var i=0; i<selection.tiles.length; ++i) {
						var tile = selection.tiles[i];
						ctx.save();
						ctx.fillStyle = color;
						ctx.globalAlpha = alpha;
						ctx.fillRect(sheetData.tilesize*tile.x, sheetData.tilesize*tile.y, sheetData.tilesize, sheetData.tilesize);
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

			if (sheetData.data.animations) sheetData.data.animations = {};
			if (sheetData.data.floating) sheetData.data.floating = {};
			if (sheetData.data.collisions) sheetData.data.collisions = {};

			if (!selections.data) selections.data = {};
			if (selections.data.floating) sheet.data.floating.selections.tiles = [];
			if (selections.data.collisions) sheet.data.collisions.selections.tiles = [];
			if (selections.data.animations) sheet.data.animations.selections.tiles = [];
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

			if (sheet.data.floating) {
				selections.floating = {
					selection: new TilesSelection(),
					color: '#00CC00',
					opacity: 0.6
				}

				for (var i=0; i<sheet.data.floating.length; ++i) {
					var _floating = sheet.data.floating[i],
						tx = parseInt(_floating % sheetData.columns),
						ty = parseInt(_floating / sheetData.columns),
						tile = new Tile( ty, tx );

					selections.floating.selection.tiles.push( tile );
				}
			}

			if (sheet.data.collisions) {
				selections.collisions = {
					selection: new TilesSelection(),
					color: '#CC0000',
					opacity: 0.6
				}

				for (var i=0; i<sheet.data.collisions.length; ++i) {
					var _collision = sheet.data.collisions[i],
						tx = parseInt(_collision % sheetData.columns),
						ty = parseInt(_collision / sheetData.columns),
						tile = new Tile( ty, tx );

					selections.collisions.selection.tiles.push( tile );
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
					tile = new Tile( ty, tx );

				selections.avatar.selection.tiles = [ tile ];
				selections.avatar.selection.addTile = function(tile) {
					this.tiles = [ tile ];
					sheet.data.avatar = tile.x + tile.y * sheetData.columns;
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
					var animation = sheet.data.animations[animationName],
						row = parseInt(animation.row),
						length = parseInt(animation.length),
						tileSet = {
							name: animationName,
							tiles: []
						};

					selections.animations.tileSets.push( tileSet );

					for (var i=0; i<length; ++i) {
						var tile = new Tile( row, i );
						tile.tilesSet = tileSet;
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

				if (sheet.data.floating) sheetData.data.floating = sheet.data.floating;
				if (sheet.data.collisions) sheetData.data.collisions = sheet.data.collisions;
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
		if (selectionType == 'floating') {
			activeSelection = { type: 'floating', selection: selections.floating.selection };
		} else if (selectionType == 'collision') {
			activeSelection = { type: 'collision', selection: selections.collisions.selection };
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
						row = parseInt(animation.row),
						length = parseInt(animation.length),
						tileSet = {
							name: highlightAnimation,
							tiles: []
						};

					selections.animations.tileSets.push( tileSet );

					for (var i=0; i<length; ++i) {
						var tile = new Tile( row, i );
						tile.tilesSet = tileSet;
						tileSet.tiles.push( tile );
					}

					selections.animations.setAnimationTiles();
				}
				highlightedAnimation = tileSet;


				interface.modifyAnimation = function(data){
					highlightedAnimation.tiles = [];

					for (var i=0; i<data.length; ++i) {
						var tile = new Tile( data.row, i );
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
			preparedSheetData = {
				floating: [],
				collisions: []
			};
		} else if (sheetType == 'spritesheet') {
			preparedSheetData = {
				animations: [],
			};
		} else {

		}
	};


	// ========================================================== //
	// ================    Canvas Interaction    ================ //
	// ========================================================== //


	ctx.webkitImageSmoothingEnabled = settings.smoothing;
	ctx.strokeStyle = settings.lineColour;
	ctx.lineWidth = settings.lineWidth;

	var Tile = function(y,x) {
		if (y < 0 || x < 0) throw new RangeError("Bad tile: ("+y+","+x+")");
		if (y >= sheetData.rows || x >= sheetData.columns) throw new RangeError("Bad tile: ("+y+","+x+")");
		this.y = y;
		this.x = x;
	};

	// Selection 
	// 	 - Draw: currently selected, currently selecting
	// 	 - TODO: On drag: start a rectangle selection
	var TilesSelection = function() {
		this.tiles = [];
		this.addTile = function(tile, dontRemove) {
			for (var i = 0; i<this.tiles.length; ++i) {
				if (this.tiles[i].y == tile.y &&
					this.tiles[i].x == tile.x) {

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
			var y  = evt.pageY - this.offsetTop,
				x  = evt.pageX - this.offsetLeft,
				ty = Math.floor(y/sheetData.tilesize),
				tx = Math.floor(x/sheetData.tilesize);

			hover = new Tile(ty, tx);
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
				interface.loadSheet(sheet, true);
				interface.onSheetChanged( sheetName );
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
