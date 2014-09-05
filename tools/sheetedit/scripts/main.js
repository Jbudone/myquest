
$(document).ready(function(){

	var assetsMgr = null,
		editor    = null,
		sheet     = null;

	$.getJSON('../../data/assets.json', function(data){

		if (data) {

			var assets = data;
			assetsMgr = new AssetsManager( assets, $('#assets') );

			assetsMgr.onClickTilesheet = function(data){
				console.log('Tilesheet');
				console.log(data);
				editor.loadView('tilesheet', data);
			};

			assetsMgr.onClickSpritesheet = function(data){
				console.log('Spritesheet');
				console.log(data);
				editor.loadView('spritesheet', data);
			};

			assetsMgr.onClickNPC = function(data){
				console.log('NPC');
				console.log(data);
				editor.loadView('npc', data);
			};
		}
	});

	sheet  = new Sheet( document.getElementById('sheet') );
	editor = new Editor( $('#editArea'), sheet );




	// =======================================================================
	// Crap below




	/*
	
	var canvas         = document.getElementById('sheet'),
		ctx            = canvas.getContext('2d'),
		tilesheet      = null,
		sheetRows      = null,
		sheetCols      = null,
		sheetName      = "",
		tilesheetReady = false,
		data           = null,
		dataSheet      = null,
		dataCollisions = null,
		dataFloating   = null;

	var lineWidth   = 2,
		lineColour  = "#CCCCCC";

	var dataFromJSON = function(json) {

		if (!tilesheetReady) {
			if (json) data = json;
			return;
		}

		if (json) data = json;

		if (data) {
			if (!data.hasOwnProperty('sheets')) {
				data.sheets = [{
					"id":"tiles",
					"image":sheetName,
					"collisions":[],
					"floating":[],
					"tilesPerRow":null,
				}]; // Sheets: []

				dataSheet = data.sheets[0];
				dataCollisions = dataSheet.collisions;
			} else {
				if (data.sheets instanceof Array) {
					for (var i=0; i<data.sheets.length; ++i) {
						var sheet = data.sheets[i];
						if (typeof sheet !== "object") {
							console.log(sheet);
							throw new Error("Sheet is not an object..");
						}

						if (sheet.hasOwnProperty('image') && sheet.image == sheetName) {
							dataSheet = sheet;
							break;
						}
					}

					if (!dataSheet) {
						data.sheets.push({
							"id":"tiles",
							"image":sheetName,
							"collisions":[],
							"floating":[],
							"tilesPerRow":null,
						});
					}
				} else {
					console.log(data);
					throw new Error("Data.sheets expected to be an array!!");
				}
			}

			// Collisions
			if (!dataSheet.hasOwnProperty('collisions')) dataSheet.collisions = [];
			dataCollisions = dataSheet.collisions;
			if (dataCollisions instanceof Array) {
				// set selection from collisions
				for (var i=0; i<dataCollisions.length; ++i) {
					var collision = dataCollisions[i],
						ty = null,
						tx = null;
					if (isNaN(collision)) {
						console.log(collision);
						throw new Error("Collision expected to be a sprite index!");
					}

					ty = Math.floor(collision/sheetCols);
					tx = Math.floor(collision%sheetCols);

					selectionCollision.addTile(new Tile(ty, tx));
				}
			} else {
				console.log(dataCollisions);
				throw new Error("Sheet.collisions expected to be an array!!");
			}

			// Floaters
			if (!dataSheet.hasOwnProperty('floating')) dataSheet.floating = [];
			dataFloating = dataSheet.floating;
			if (dataFloating instanceof Array) {
				// set selection from floaters
				for (var i=0; i<dataFloating.length; ++i) {
					var floating = dataFloating[i],
						ty = null,
						tx = null;
					if (isNaN(floating)) {
						console.log(floating);
						throw new Error("Floater expected to be a sprite index!");
					}

					ty = Math.floor(floating/sheetCols);
					tx = Math.floor(floating%sheetCols);

					selectionFloating.addTile(new Tile(ty, tx));
				}
			} else {
				console.log(dataFloating);
				throw new Error("Sheet.collisions expected to be an array!!");
			}


		} else {
			data = {
				sheets:[{
					"id":"tiles",
					"image":sheetName,
					"collisions":[],
					"floating":[],
					"tilesPerRow":null,
				}]
			};
			dataSheet = data.sheets[0];
			dataCollisions = dataSheet.collisions;
		}
	};


	var saveDataToJSON = function() {

		// Collision
		dataCollisions = [];
		for (var i=0; i<selectionCollision.tiles.length; ++i) {
			var tile = selectionCollision.tiles[i],
				sprite = tile.y * sheetCols + tile.x;
			dataCollisions.push(sprite);
		}
		dataSheet.collisions = dataCollisions;

		// Floating
		dataFloating = [];
		for (var i=0; i<selectionFloating.tiles.length; ++i) {
			var tile = selectionFloating.tiles[i],
				sprite = tile.y * sheetCols + tile.x;
			dataFloating.push(sprite);
		}
		dataSheet.floating = dataFloating;

		dataSheet.tilesPerRow = sheetCols;

		var json = JSON.stringify(data, undefined, 2);
			blob = new Blob([json], {type: 'text/json'}),
			url  = URL.createObjectURL(blob);
		window.open(url);
	};

	$('#save').click(function(){
		if (data) {
			saveDataToJSON();
		}
		return false;
	});












	canvas.ondragover = function () { this.className = 'hover'; return false; };
	canvas.ondragend  = function () { this.className = ''; return false; };
	canvas.ondrop     = function(e) {
		this.className = '';
		e.preventDefault();

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

					if (tilesheet.width % 16 != 0 ||
						tilesheet.height % 16 != 0) {
						throw new RangeError("Tilesheet bad dimensions: ("+tilesheet.height+"x"+tilesheet.width+")");
					}

					sheetRows = tilesheet.height / 16;
					sheetCols = tilesheet.width / 16;
					tilesheetReady = true;

					dataFromJSON();
				// }
			} else {
				// Assume JSON file
				var dataText = event.target.result,
					json = JSON.parse(dataText);

				if (json) {
					dataFromJSON(json);
				} else {
					throw new Error("Bad file.. "+file.name);
				}
			}
		};
		console.log(file);

		if (isTilesheet) {
			reader.readAsDataURL(file);
		} else {
			reader.readAsText(file);
		}

		return false;
	};


















	ctx.webkitImageSmoothingEnabled=false;
	ctx.strokeStyle=lineColour;
	ctx.lineWidth=lineWidth;

	var Tile = function(y,x) {
		if (y < 0 || x < 0) throw new RangeError("Bad tile: ("+y+","+x+")");
		if (y >= sheetRows || x >= sheetCols) throw new RangeError("Bad tile: ("+y+","+x+")");
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

	var redrawTime = 50,
		hover = null,
		selectionCollision = new TilesSelection(),
		selectionFloating = new TilesSelection(),
		selectionAnimation = new TilesSelection(),
		selections = [
		{
			selection: selectionCollision,
			color: '#CC0000',
			opacity: 0.6
		}, {
			selection: selectionFloating,
			color: '#00CC00',
			opacity: 0.6
		}, {
			selection: selectionAnimation,
			color: '#0000CC',
			opacity: 0.6
		} ],
		activeSelection = selectionCollision;
		redraw = function() {

			if (tilesheetReady) {

				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(tilesheet, 0, 0, tilesheet.width, tilesheet.height, 0, 0, tilesheet.width, tilesheet.height);

				// draw hover
				if (hover) {
					ctx.save();
					ctx.globalAlpha = 0.4;
					ctx.strokeRect(16*hover.x - (lineWidth/2), 16*hover.y - (lineWidth/2), 16 + (lineWidth/2), 16 + (lineWidth/2));
				    ctx.restore();
				}

				// draw highlights (collisions)
				for (var k=0; k<selections.length; ++k) {

					var selection = selections[k].selection,
						color     = selections[k].color,
						alpha     = selections[k].opacity;
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
			
			setTimeout(redraw, redrawTime);
	};

	canvas.addEventListener('mousemove', function(evt) {
		if (tilesheetReady) {
			var y  = evt.pageY - this.offsetTop,
				x  = evt.pageX - this.offsetLeft,
				ty = Math.floor(y/16),
				tx = Math.floor(x/16);

			hover = new Tile(ty, tx);
		}

		return false;
	});

	canvas.addEventListener('mousedown', function(evt) {
		evt.preventDefault();
		if (tilesheetReady) {
			if (hover) {
				activeSelection.addTile(hover);
			}
		}

		return false;
	});

	$('#ctrl-collision').click(function(){
		activeSelection = selectionCollision;
		return false;
	}).click();

	$('#ctrl-floating').click(function(){
		activeSelection = selectionFloating;
		return false;
	});

	redraw();
	*/

});
