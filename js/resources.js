
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
				file:data.image||data.file
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
			}, sheet = sheets[data.sheet];

			if (!Env.isServer) {
				sheet.image.onload=function(){

				for(var key in animation.animations){
					var ani = animation.animations[key];
					if (ani.flipX || ani.flipY) {

						// canvas.width = 32*ani.length;
						// canvas.height = 32;
						var env = { key:key, ani:ani };

						// sheet.image.onload=function(){
							var ani = env.ani,
							key = env.key;

							var canvas = document.createElement('canvas');
							var width = 32*ani.length;
							canvas.width = width;
							canvas.height = 32;
							ctx = canvas.getContext('2d');

							try {
								// For Chrome
								ctx.scale(-1,1);
								for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
									ctx.drawImage(sheet.image, i*32, ani.row*32, 32, 32, -i*32, 0, -32, 32);
								}
							} catch(e) {
								// For Firefox
								ctx.scale(-1,1);
								for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
									ctx.drawImage(sheet.image, j*32, ani.row*32, 32, 32, -(j+1)*32, 0, 32, 32);
								}
								// for(var i=ani.length-1, j=0; i>=0; --i, ++j) {
								// 	ctx.drawImage(sheet.image, j*32, ani.row*32, 32, 32, j*32, 0, 32, 32);
								// }
								ctx.transform(-1,0,0,1,0,0);  
							}

							var img = new Image();
							img.src = canvas.toDataURL("image/png");

							if (!animation.sheet.subsheets) animation.sheet.subsheets={};
							animation.sheet.subsheets[key] = { file:sheet.file, image:img };
							ani.sheet = animation.sheet.subsheets[key];
							ani.row = 0;
						}

						delete canvas;
					// }
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
