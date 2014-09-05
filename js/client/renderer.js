				// 		- client/renderer.js: init (pass canvases, camera, map/page, player, spritesheets; set canvas settings); render (render each individual thing); set tileHover, tilePathHighlight
define(['loggable'], function(Loggable){


	var Renderer = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Renderer');
		this.setLogPrefix('(Renderer) ');


		this.canvasEntities = null;
		this.canvasBackground = null;
		this.ctxEntities = null;
		this.ctxBackground = null;

		this.camera    = null;
		this.ui        = null;
		this.map       = null;
		this.tilesheet = null;
		
		this.settings  = {
			lineWidth: 3,
			smoothing: false,
			strokeStyle: '#CCCCCC'
		};

		this.setMap = function(map){
			this.map       = map;
			this.tilesheet = map.sheet;
		};

		this.initialize = function(options){

			options             = options || {};
			options.strokeStyle = options.strokeStyle || this.settings.strokeStyle;
			options.smoothing   = options.smoothing || this.settings.smoothing;
			options.lineWidth   = options.lineWidth || this.settings.lineWidth;

			for (var option in options) {
				this.settings[option] = options[option];
			}

			this.ctxEntities   = this.canvasEntities.getContext('2d');
			this.ctxBackground = this.canvasBackground.getContext('2d');

			var canvasWidth  = (Env.pageWidth+2*Env.pageBorder)*Env.tileSize*Env.tileScale,
				canvasHeight = (Env.pageHeight+2*Env.pageBorder)*Env.tileSize*Env.tileScale;

			this.canvasEntities.width    = canvasWidth;
			this.canvasEntities.height   = canvasHeight;
			this.canvasBackground.width  = canvasWidth;
			this.canvasBackground.height = canvasHeight;

			this.ctxEntities.mozImageSmoothingEnabled      = options.smoothing;
			this.ctxEntities.webkitImageSmoothingEnabled   = options.smoothing;
			this.ctxEntities.strokeStyle                   = options.strokeStyle;
			this.ctxEntities.lineWidth                     = options.lineWidth;
			this.ctxBackground.mozImageSmoothingEnabled    = options.smoothing;
			this.ctxBackground.webkitImageSmoothingEnabled = options.smoothing;
			this.ctxBackground.strokeStyle                 = options.strokeStyle;
			this.ctxBackground.lineWidth                   = options.lineWidth;
		};

		this.render = function(){

			// Redraw the entities every frame
			this.ctxEntities.clearRect(0, 0, this.canvasEntities.width, this.canvasEntities.height);
			var sheetData = this.tilesheet;
				sheet     = sheetData.image;

			// Only redraw the background if the camera has moved
			if (this.camera.updated) {
				this.ctxBackground.clearRect(0, 0, this.canvasBackground.width, this.canvasBackground.height);

				// cache some of the variables we'll be using
				// TODO: will this actually improve performance? or is the chainline not traversed in the
				// hot cache?
				var tileSize    = Env.tileSize,
					pageWidth   = Env.pageWidth,
					pageHeight  = Env.pageHeight,
					tilesPerRow = sheetData.tilesPerRow,
					offsetY     = The.camera.offsetY,
					offsetX     = The.camera.offsetX;


				// Draw Current Page
				// 	startY:
				// 		require  pt + size < page
				// 		starts @ max(floor(ipt) - 1, 0)
				this.renderPage( this.map.curPage, 0, 0, pageWidth, pageHeight, 0, 0 );


				// Draw border
				//	Camera width/height and offset (offset by -border)
				//	Draw ALL neighbours using this algorithm
				//	If no neighbour to left/top then leave offset as 0?
				var neighbours=[];
				for(var neighbourKey in this.map.curPage.neighbours) {
					var neighbour = this.map.curPage.neighbours[neighbourKey];
					if (!neighbour) continue;

					var neighbourInfo = {};
					neighbourInfo.neighbour = neighbour;
					neighbourInfo.name = neighbourKey;

					if (neighbourKey.indexOf('south')!=-1) {
						neighbourInfo.offsetY = pageHeight*Env.tileSize;
					} else if (neighbourKey.indexOf('north')!=-1) {
						neighbourInfo.offsetY = -pageHeight*Env.tileSize;
					} else {
						neighbourInfo.offsetY = 0;
					}

					if (neighbourKey.indexOf('west')!=-1) {
						neighbourInfo.offsetX = -pageWidth*Env.tileSize;
					} else if (neighbourKey.indexOf('east')!=-1) {
						neighbourInfo.offsetX = pageWidth*Env.tileSize;
					} else {
						neighbourInfo.offsetX = 0;
					}

					neighbours.push(neighbourInfo);
				}
				for(var neighbourKey in neighbours) {
					var neighbourInfo = neighbours[neighbourKey],
						neighbour = neighbourInfo.neighbour,
						offX = neighbourInfo.offsetX,
						offY = neighbourInfo.offsetY;


					this.renderPage( neighbour, 0, 0, pageWidth, pageHeight, offX, offY );
				}

				this.camera.updated = false;
			}


			// Draw tile highlights
			if (this.ui.tileHover) {

				var scale = Env.tileScale,
					tileSize = Env.tileSize;
				this.ctxEntities.save();
				this.ctxEntities.globalAlpha = 0.4;
				this.ctxEntities.strokeRect(scale*tileSize*this.ui.tileHover.x, scale*tileSize*this.ui.tileHover.y, scale*tileSize-(this.settings.lineWidth/2), scale*tileSize-(this.settings.lineWidth/2));
				this.ctxEntities.restore();

			}

			if (this.ui.tilePathHighlight) {

				if (!this.ui.tilePathHighlight.hasOwnProperty('step')) this.ui.tilePathHighlight.step=0;

				var scale = Env.tileScale,
					tileSize = Env.tileSize,
					y = (this.ui.tilePathHighlight.y - this.map.curPage.y) * scale * tileSize + this.camera.offsetY * scale,
					x = (this.ui.tilePathHighlight.x - this.map.curPage.x) * scale * tileSize - this.camera.offsetX * scale,
					width = scale*tileSize-(this.settings.lineWidth/2),
					height = scale*tileSize-(this.settings.lineWidth/2),
					step = ++this.ui.tilePathHighlight.step,
					color = (step<5?'#88FF88':'#22DD22');

				if (step%10==0) {
					this.ui.tilePathHighlight.step = 0;
				}
					

				this.ctxEntities.save();
				this.ctxEntities.strokeStyle='#669966';
				this.ctxEntities.globalAlpha = 0.4;
				this.ctxEntities.strokeRect(x, y, width, height);

				this.ctxEntities.globalAlpha = 0.8;
				this.ctxEntities.strokeStyle=color;
				this.ctxEntities.setLineDash([4*scale]);
				this.ctxEntities.strokeRect(x, y, width, height);
				this.ctxEntities.restore();

			}



			var floatingSprites = [];


			// Draw sprites
			var page = this.map.curPage;
			for (var coord in page.sprites) {
				var spriteObj=page.sprites[coord],
					sprite=(spriteObj?spriteObj.sprite-1:-1),
					tilesPerRow=sheetData.tilesPerRow,
					scale=Env.tileScale,
					iy = Math.floor(coord / Env.pageWidth),
					ix = coord % Env.pageWidth,
					sy=Math.max(-1,parseInt(sprite/tilesPerRow)),
					sx=Math.max(-1,sprite%tilesPerRow),
					tileSize = Env.tileSize,
					py=(iy*tileSize+this.camera.offsetY)*scale,
					px=(ix*tileSize-this.camera.offsetX)*scale;
				try {
					if (sy!=-1 && sx!=-1 && sprite && !spriteObj.hasOwnProperty('static')) {
						if (sheetData.floating !== 'undefined' &&
							sheetData.floating.indexOf(sprite) >= 0) {
							floatingSprites.push({
								sprite: sprite,
								sx: sx,
								sy: sy,
								px: px,
								py: py
							});
						} else {
							this.ctxEntities.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
						}
					}
				} catch(e) {
					this.Log("Error!");
				}
			}

			// Draw border
			//	Camera width/height and offset (offset by -border)
			//	Draw ALL neighbours using this algorithm
			//	If no neighbour to left/top then leave offset as 0?
			var neighbours=[],
				tileSize=Env.tileSize,
				pageWidth=Env.pageWidth,
				pageHeight=Env.pageHeight,
				tilesPerRow=sheetData.tilesPerRow,
				offsetY=this.camera.offsetY,
				offsetX=this.camera.offsetX;
			for(var neighbourKey in this.map.curPage.neighbours) {
				var neighbour = this.map.curPage.neighbours[neighbourKey];
				if (!neighbour) continue;

				var neighbourInfo = {};
				neighbourInfo.neighbour = neighbour;
				neighbourInfo.name = neighbourKey;

				if (neighbourKey.indexOf('south')!=-1) {
					neighbourInfo.offsetY = pageHeight*Env.tileSize;
				} else if (neighbourKey.indexOf('north')!=-1) {
					neighbourInfo.offsetY = -pageHeight*Env.tileSize;
				} else {
					neighbourInfo.offsetY = 0;
				}

				if (neighbourKey.indexOf('west')!=-1) {
					neighbourInfo.offsetX = -pageWidth*Env.tileSize;
				} else if (neighbourKey.indexOf('east')!=-1) {
					neighbourInfo.offsetX = pageWidth*Env.tileSize;
				} else {
					neighbourInfo.offsetX = 0;
				}

				neighbours.push(neighbourInfo);
			}


			// Draw sprites
			for(var i=0; i<neighbours.length; ++i) {
				var neighbourInfo = neighbours[i],
					neighbour = neighbourInfo.neighbour,
					offX = neighbourInfo.offsetX,
					offY = neighbourInfo.offsetY;

				for (var coord in neighbour.sprites) {
					var spriteObj=neighbour.sprites[coord],
						sprite=(spriteObj?spriteObj.sprite-1:-1),
						tilesPerRow=20, // TODO: find this: Spritesheet tiles per row
						scale=Env.tileScale,
						iy = Math.floor(coord / Env.pageWidth),
						ix = coord % Env.pageWidth,
						sy=Math.max(-1,parseInt(sprite/tilesPerRow)),
						sx=Math.max(-1,sprite%tilesPerRow),
						tileSize = Env.tileSize,
						py=(iy*tileSize+this.camera.offsetY+offY)*scale,
						px=(ix*tileSize-this.camera.offsetX+offX)*scale;

					try {
						if (sy!=-1 && sx!=-1 && sprite && !spriteObj.hasOwnProperty('static')) {
							if (sheetData.floating !== 'undefined' &&
								sheetData.floating.indexOf(sprite) >= 0) {

								floatingSprites.push({
									sprite: sprite,
									sx: sx,
									sy: sy,
									px: px,
									py: py
								});
							} else {
								this.ctxEntities.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
							}
						}
					} catch(e) {
						this.Log("Error!");
					}
				}

			}

			// Draw Movables
			{
				for (var id in page.movables) {
					var movable = page.movables[id],
						tileSize = movable.sprite.tileSize,
						movableSheet = movable.sprite.sheet.image,
						customSheet = false,
						scale=Env.tileScale,
						offsetY = this.camera.offsetY,
						offsetX = this.camera.offsetX,
						// TODO: fix sprite centering with sheet offset
						movableOffX = movable.sprite.tileSize/4,// - movable.sprite.offset_x, //movable.sprite.tileSize/4, // Center the entity
						movableOffY = movable.sprite.tileSize/2;// - movable.sprite.offset_y; //movable.sprite.tileSize/2;
					if (movable.sprite.state.sheet) {
						customSheet = true;
						movableSheet = movable.sprite.state.sheet.image; // Specific state/animation may require a separate sheet
					}

					this.ctxEntities.drawImage(
							movableSheet, movable.sprite.state.x, movable.sprite.state.y, movable.sprite.tileSize, movable.sprite.tileSize, scale*(movable.posX-offsetX-movableOffX), scale*(movable.posY+offsetY-movableOffY), scale*movable.sprite.tileSize, scale*movable.sprite.tileSize);
				}
			}


			// draw floating sprites
			for (var i=0; i<floatingSprites.length; ++i) {
				var floatingSprite = floatingSprites[i],
					tileSize = Env.tileSize,
					scale = Env.tileScale,
					sx = floatingSprite.sx,
					sy = floatingSprite.sy,
					px = floatingSprite.px,
					py = floatingSprite.py;
				this.ctxEntities.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
			}

		};

		this.renderPage = function(page, startX, startY, endX, endY, offX, offY){

			// TODO: for the most bizarre reason, settings variables within these functions SetVarsA, SetVarsB
			// and DrawingImage, somehow speeds up the rendering process significantly. Figure out why
			var renderer = this;
			var scale       = null,
				tileSize    = null,
				sheet       = null,
				pageWidth   = null,
				pageHeight  = null,
				tilesPerRow = null,
				sheet       = null,
				offsetY     = null,
				offsetX     = null;
			(function SetVarsA(){
				scale       = Env.tileScale,
				tileSize    = Env.tileSize,
				sheet       = renderer.tilesheet.image;
				pageWidth   = Env.pageWidth,
				pageHeight  = Env.pageHeight,
				tilesPerRow = renderer.tilesheet.tilesPerRow,
				sheet       = renderer.tilesheet.image,
				offsetY     = The.camera.offsetY+offY,
				offsetX     = The.camera.offsetX-offX;
			}());
			for(var iy=startY; iy<endY; ++iy) {
				for(var ix=startX; ix<endX; ++ix) {
					// TODO: abstract ty/tx and sy/sx fetch; use on all renders
					var tile      = null,
						spriteObj = null,
						sprite    = null,
						ty        = null,
						tx        = null,
						sy        = null,
						sx        = null,
						py        = null,
						px        = null;
					(function SetVarsB(){
						tile      = page.tiles[iy*pageWidth+ix]-1,
						spriteObj = page.sprites[iy*pageWidth+ix],
						sprite    = (spriteObj?spriteObj.sprite-1:-1),
						ty        = Math.max(-1,parseInt(tile/tilesPerRow)),
						tx        = Math.max(-1,tile%tilesPerRow),
						sy        = Math.max(-1,parseInt(sprite/tilesPerRow)),
						sx        = Math.max(-1,sprite%tilesPerRow),
						py        = (iy*tileSize+offsetY)*scale,
						px        = (ix*tileSize-offsetX)*scale;
					}());

					// TODO: only render tile if it will display on screen (figure this out from page
					// dimensions/coordinates; not here)
					// if (py+tileSize<=0 || py>=pageHeight*tileSize) {
					// 	this.Log("Bad spot!");
					// }

					(function Drawing(){
						if (ty!=-1 && tx!=-1)
							renderer.ctxBackground.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
						// Draw sprite ONLY if its static
						if (sy!=-1 && sx!=-1 && sprite && spriteObj.hasOwnProperty('static'))
							renderer.ctxBackground.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
					}());
				}
			}
		};
	};


	return Renderer;

});
