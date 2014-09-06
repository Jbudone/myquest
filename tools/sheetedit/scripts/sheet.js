
var Sheet = function(canvas){

	var interface = {
			loadSheet: new Function(),
			clearSheet: new Function(),
			adjustSheet: new Function(),
			setMode: new Function(),
			setDragDropMode: new Function(),
			gridMode: new Function(),
			onModified: new Function(),
			onSheetChanged: new Function()
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
					for (var i=0; i<selection.tiles.length; ++i) {
						var tile = selection.tiles[i];
						ctx.save();
						ctx.fillStyle = color;
						ctx.globalAlpha = alpha;
						ctx.fillRect(16*tile.x, 16*tile.y, 16, 16);
						ctx.restore();
					}

				}

			}
			
			setTimeout(redraw, settings.redrawTime);
	},  selections = {},
		activeSelection = { type: null, selection: null },
		hover = null;
			
	interface.adjustSheet = function(sheet){
		sheetData.tilesize = parseInt(sheet.tilesize);
		sheetData.sheet_offset.x = parseInt(sheet.sheet_offset.x);
		sheetData.sheet_offset.y = parseInt(sheet.sheet_offset.y);
	};

	interface.clearSheet = function(){
		sheetData = {
			image: null,
			tilesize: 16,
			columns: 0,
			rows: 0,
			sheet_offset: { y:0, x:0 },
			data: {}
		};
		selections = {};
		activeSelection = { type: null, selection: null };
		hover = null;
	};

	interface.loadSheet = function(sheet, copy){
		interface.clearSheet();
		interface.setDragDropMode(true);
		tilesheet = new Image();
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

			if (sheet.data.animations) {
				selections.animations = {
					selection: new TilesSelection(),
					color: '#CC00CC',
					opacity: 0.6
				}

				for (var i=0; i<sheet.data.animations.length; ++i) {
					var _animation = sheet.data.animations[i],
						tx = parseInt(_animation % sheetData.columns),
						ty = parseInt(_animation / sheetData.columns),
						tile = new Tile( ty, tx );

					selections.animations.selection.tiles.push( tile );
				}
			}

			canvas.style.width  = this.width;
			canvas.style.height = this.height;
			canvas.width        = this.width;
			canvas.height       = this.height;

			ready = true;
		};
		tilesheet.src = sheet.image;
	};

	interface.setMode = function(selectionType){
		if (selectionType == 'floating') {
			activeSelection = { type: 'floating', selection: selections.floating.selection };
		} else if (selectionType == 'collision') {
			activeSelection = { type: 'collision', selection: selections.collisions.selection };
		} else if (selectionType == 'animation') {
			activeSelection = { type: 'animation', selection: selections.animations.selection };
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
				// interface.clearSheet();
				// tilesheet = new Image();
				var sheetName = "/sprites/" + file.name;
				interface.loadSheet({
					id:"New Tilesheet",
					image: sheetName,
					tilesize: 16,
					columns: 0,
					rows: 0,
					sheet_offset: {
						x: 0,
						y: 0
					},
					data: {
						collisions: [],
						floating: []
					}
				}, true);
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
