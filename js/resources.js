
define(['jquery'], function($){

	var sprites={},
		animations={},
		sheets={},
		maps={},
		npcs={},
		addMap=function(data){
			maps[data.Map.id]={
				data:data.Map,
				properties:data.properties
			};
		}, addSprite=function(data){
			var sprite={
				states:data.states,
				sheet:sheets[data.sheet]
			};
			sprites[data.id]=sprite;
		}, addSheet=function(data){
			var sheet={
				file:data.image||data.file,
				offset:{x:(data.offset_x||0),y:(data.offset_y||0)},
				tileSize:{width:(data.width||32),height:(data.height|32)}
			};
			if (!Env.isServer) {
				sheet.image=(new Image());
				sheet.image.src=sheet.file;
			}
			if (data.collisions) sheet.collisions=data.collisions;
			if (data.floating) sheet.floating=data.floating;
			if (data.tilesPerRow) sheet.tilesPerRow=data.tilesPerRow;
			sheets[data.id]=sheet;
		}, addAnimation=function(data){
			var animation={
				sheet:sheets[data.sheet],
				animations:data.animations,
			}, sheet = sheets[data.sheet],
				offset_x = sheet.offset.x,
				offset_y = sheet.offset.y,
				tWidth   = sheet.tileSize.width,
				tHeight  = sheet.tileSize.height;

			if (!Env.isServer) {
				sheet.image.onload=function(){

				var redrawSpritesheet = false;
				if (offset_x !== 0 || offset_y !== 0 || tWidth !== 32 || tHeight !== 32) {
					redrawSpritesheet = {
						canvas: document.createElement('canvas'),
						ctx: null,
						rows: 0,
						cols: 0
					};
					redrawSpritesheet.ctx = redrawSpritesheet.canvas.getContext('2d');
					for (var key in animation.animations){
						var ani = animation.animations[key];
						if (!ani.flipX && !ani.flipY) {
							++redrawSpritesheet.rows;
							if (ani.length > redrawSpritesheet.cols) {
								redrawSpritesheet.cols = ani.length;
							}
						}
					}
					redrawSpritesheet.canvas.height = tHeight * redrawSpritesheet.rows;
					redrawSpritesheet.canvas.width = tWidth * redrawSpritesheet.cols;
					redrawSpritesheet.rows = 0;
					offset_x = 0;
					offset_y = 0;
				}
				for(var key in animation.animations){
					var ani = animation.animations[key];
					if (ani.flipX || ani.flipY) {

						// canvas.width = 32*ani.length;
						// canvas.height = 32;
						var env = { key:key, ani:ani };

							var ani = env.ani,
							key = env.key;

							var canvas = document.createElement('canvas');
							var width = tWidth*ani.length;
							canvas.width = width;
							canvas.height = tHeight;
							ctx = canvas.getContext('2d');

							try {
								// For Chrome
								ctx.scale(-1,1);
								for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
									ctx.drawImage(sheet.image, i*tWidth - offset_x, ani.row*tHeight - offset_y, tWidth, tHeight, -i*tWidth, 0, -tWidth, tHeight);
								}
							} catch(e) {
								// For Firefox
								// ctx.scale(-1,1);
								for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
									ctx.drawImage(sheet.image, j*tWidth, ani.row*tHeight, tWidth, tHeight, -(j+1)*tWidth, 0, tWidth, tHeight);
								}
								// for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
								// 	ctx.drawImage(sheet.image, j*32, ani.row*32, 32, 32, j*32, 0, 32, 32);
								// }
								// ctx.transform(-1,0,0,1,0,0);  
							}

							var img = new Image();
							img.src = canvas.toDataURL("image/png");

							if (!animation.sheet.subsheets) animation.sheet.subsheets={};
							animation.sheet.subsheets[key] = { file:sheet.file, image:img };
							ani.sheet = animation.sheet.subsheets[key];
							ani.row = 0;

							delete canvas;
						} else if (redrawSpritesheet) {
							++redrawSpritesheet.rows;
							redrawSpritesheet.ctx.drawImage(sheet.image, -offset_x, ani.row*tHeight - offset_y, tWidth*ani.length, tHeight, 0, (redrawSpritesheet.rows-1)*tHeight, tWidth*ani.length, tHeight);
							ani.row = redrawSpritesheet.rows-1;
						}

					}

					if (redrawSpritesheet) {
						var img = new Image();
						img.src = redrawSpritesheet.canvas.toDataURL("image/png");

						sheet.image = img;
						sheet.file = sheet.image;

						delete redrawSpritesheet.canvas;
					}
				}
			}
			animations[data.id]=animation;
		}, findSheetFromFile=function(image){
			for (var sheet in sheets) {
				if (sheets[sheet].file == image) {
					return sheets[sheet];
				}
			}
			return false;
		}, addNPC=function(npc){
			npcs[npc.id]=npc;
		};
	return {
		addMap:addMap,
		addSprite:addSprite,
		addSheet:addSheet,
		addAnimation:addAnimation,
		addNPC:addNPC,
		maps:maps,
		sheets:sheets,
		sprites:sprites,
		animations:animations,
		npcs:npcs,
		findSheetFromFile:findSheetFromFile
	};
});
