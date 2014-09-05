
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
			offset: { y:0, x:0 },
			data: {}
	},  ctx = canvas.getContext('2d'),
		showGrid = false,
		dragDropEnabled = false,
		ready = false,
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

				ctx.drawImage(sheetData.image, 0, 0, sheetData.image.width, sheetData.image.height, 0, 0, sheetData.image.width, sheetData.image.height);

				// draw hover
				if (hover) {
					ctx.save();
					ctx.globalAlpha = settings.hoverAlpha;
					ctx.strokeRect(sheetData.data.tilesize*hover.x - (settings.lineWidth/2), sheetData.data.tilesize*hover.y - (settings.lineWidth/2), sheetData.data.tilesize + (settings.lineWidth/2), sheetData.data.tilesize + (settings.lineWidth/2));
					ctx.restore();
				}

			   // draw grid
			   if (showGrid) {
				   ctx.save();
				   for (var y=sheetData.data.offset.y; y<sheetData.image.height; y+=sheetData.data.tilesize) {
					   for (var x=sheetData.data.offset.x; x<sheetData.image.width; x+=sheetData.data.tilesize) {
						   ctx.globalAlpha = settings.gridAlpha;
						   ctx.strokeRect(x - (settings.gridLineWidth/2), y - (settings.gridLineWidth/2), sheetData.data.tilesize + (settings.gridLineWidth/2), sheetData.data.tilesize + (settings.gridLineWidth/2));
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
			

	interface.loadSheet = function(sheet){
		sheetData.image = new Image();
		sheetData.image.onload = function(){
			sheetData.data = sheet.data;
			sheetData.data.tilesize = parseInt(sheet.data.tilesize);
			sheetData.data.columns = parseInt( (sheetData.image.width - parseInt(sheet.data.offset.x)) / sheet.data.tilesize );
			sheetData.data.rows = parseInt( (sheetData.image.height - parseInt(sheet.data.offset.y)) / sheet.data.tilesize );
			// sheetData.data.offset.y = parseInt(sheet.data.offset.y);
			// sheetData.data.offset.x = parseInt(sheet.data.offset.x);

			if (sheet.data.floating) {
				selections.floating = {
					selection: new TilesSelection(),
					color: '#00CC00',
					opacity: 0.6
				}

				for (var i=0; i<sheet.data.floating.length; ++i) {
					var _floating = sheet.data.floating[i],
						tx = parseInt(_floating % sheetData.data.columns),
						ty = parseInt(_floating / sheetData.data.columns),
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
						tx = parseInt(_collision % sheetData.data.columns),
						ty = parseInt(_collision / sheetData.data.columns),
						tile = new Tile( ty, tx );

					selections.collisions.selection.tiles.push( tile );
				}
			}

			canvas.style.width  = this.width;
			canvas.style.height = this.height;
			canvas.width        = this.width;
			canvas.height       = this.height;

			ready = true;
		};
		sheetData.image.src = sheet.image;
	};

	interface.setMode = function(selectionType){
		if (selectionType == 'floating') {
			activeSelection = { type: 'floating', selection: selections.floating.selection };
		} else if (selectionType == 'collision') {
			activeSelection = { type: 'collision', selection: selections.collision.selection };
		} else if (selectionType == 'animation') {
			activeSelection = { type: 'animation', selection: selections.animation.selection };
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
		if (y >= sheetData.data.rows || x >= sheetData.data.columns) throw new RangeError("Bad tile: ("+y+","+x+")");
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
				ty = Math.floor(y/sheetData.data.tilesize),
				tx = Math.floor(x/sheetData.data.tilesize);

			hover = new Tile(ty, tx);
		}

		return false;
	});

	canvas.addEventListener('mousedown', function(evt) {
		evt.preventDefault();
		if (ready) {
			if (hover && activeSelection) {
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
				tilesheet = new Image();
				sheetName = file.name;
				tilesheet.src = event.target.result;
				// tilesheet.onload = function() { 
					canvas.style.width  = tilesheet.width;
					canvas.style.height = tilesheet.height;
					canvas.width  = tilesheet.width;
					canvas.height = tilesheet.height;

					// if (tilesheet.width % 16 != 0 ||
					// 	tilesheet.height % 16 != 0) {
					// 	throw new RangeError("Tilesheet bad dimensions: ("+tilesheet.height+"x"+tilesheet.width+")");
					// }

					sheetData.image = tilesheet;
					sheetData.data.rows = parseInt(tilesheet.height / 16);
					sheetData.data.columns = parseInt(tilesheet.width / 16);
					ready = true;

				// }
			}
		};

		if (isTilesheet) {
			reader.readAsDataURL(file);
		}

		return false;
	};


	return interface;
};
