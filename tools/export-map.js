

var fs=require('fs'),
	_ = require('underscore'),
	Promise = require('promise');

fs.readFile('../data/world.json', function(err, data) {
	if (err) {
		console.log(err);
		return;
	}

	var avatars = null,
		getIDFromAvatar = new Function();

	// TODO: fetch resources and determine avatars file from that
	(new Promise(function(succeeded, failed){
		fs.readFile('../data/avatars.new.json', function(err,data){
			avatars = JSON.parse(data);
			if (avatars && avatars.avatars) {
				avatars = avatars.avatars;
				succeeded();
			} else {
				console.error("Error loading avatars..");
				failed();
			}
		});
	})).then(function(){

		var world = JSON.parse(data);

		_.each(world.maps, function(mapFile, mapName){
			var mapID = mapName,
				filename = '../data/' + world.maps[mapID] + '.json',
				mapFile  = '../data/' + world.maps[mapID];


			console.log("Processing map: "+mapID);
			fs.readFile(filename, function(err,data){
				if (err) {
					console.log(err);
					return;
				}
				var json = JSON.parse(data);


				/* Map
				 *
				 * MapFile:
				 * 	Map: {
				 * 	 [0]: {
				 * 	 	[0]: {
				 * 	 		tiles: [,,,,,,,50,,23,2,,38,83,,,,,,], // Sparse list of tiles
				 * 	 		base: 84,
				 *		},
				 *		[50]: {
				 *			...
				 *		},
				 *	},
				 *	...
				 *}
				 *
				 * JSON.tilesets:
				 * 			The array of tilesets used in this map. Every tile has a gid which references its
				 * 			position in the tilesheet, as well as which tilesheet. Each tilesheet has a
				 * 			starting gid, and the position of the tile is
				 * 				TilesheetPosition(tile.gid - tilesheet.firstgid)
				 * 				tilesheet: { name: "", firstgid: 0,
				 * 							image: "", imageheight: 1024, imagewidth: 1024,
				 * 							tilewidth: 16, tileheight: 16 }
				 *
				 *
				 * 	Each Map gets converted into a Mapfile JSON object, and placed into a file (mapFile).
				 * 	MapFile: {
				 *		properties: { height, width, pageWidth, pageHeight },
				 *
				 * 	}
				 *
				 * TODO:
				 * 	> auto convert .tmx to .json
				 * 	> make use of areas
				 * 	> doors & triggers layers
				 *******************************************************/

				var mapJSON = { MapFile: { Map: {'id':mapID, pages:{}, spawns:{}}, properties: {pageWidth:null, pageHeight:null, width:null, height:null, tilesets:[]} } },
					map = mapJSON.MapFile.Map,
					tilesets = json.tilesets,
					pageWidth = 50,
					pageHeight = 30,
					tileSize = 16,
					layers = {
						base: null,
						sprites: null,
						zoning: null,
						spawns: null,
						items: null, // TODO
						areas: null // TODO
					};

	
				mapJSON.MapFile.properties.width      = null;
				mapJSON.MapFile.properties.height     = null;
				mapJSON.MapFile.properties.pageWidth  = pageWidth;
				mapJSON.MapFile.properties.pageHeight = pageHeight;


				// ==================================================================================
				// Layers
				//
				// Prepare various layers for map
				// NOTE: the width/height of the layer must be listed here, so that we don't attempt to fetch
				// 		elements out of range in that layer
				for(var i=0; i<json.layers.length; ++i) {
					var layer = json.layers[i];
					if (!layers.hasOwnProperty(layer.name)) throw new Error("Unexpected layer ("+ layer.name +")");
					layers[layer.name] = {
						data: layer,
						width: layer.width,
						height: layer.height
					};
				}

				if (!_.isObject(layers['base'])) throw new Error("No base tiles found");
				if (!_.isObject(layers['zoning'])) throw new Error("No zoning spots found");


				// base layer must be loaded into an array of tiles. This is because the pages in here are
				// different than the pages in the game. When the server loads the map, it will rebuild the
				// pages into its own environment pages. The server will take advantage of default or commonly
				// used base tiles; it will strip out the common tile(s) and leave a sparse list of base tiles
				layers['base'].data  = layers['base'].data.data;
				layers['base'].tiles = [];


				// Zones layer separates the out (zone points that zone you into another map), and in (points
				// to which you zone in)
				layers['zoning'].data = layers['zoning'].data.objects;
				map.zones = { in: [], out: [] };
				layers['zoning'].out = map.zones.out;
				layers['zoning'].in = map.zones.in;


				layers['sprites'].data  = layers['sprites'].data.data;
				if (layers['spawns'] !== null) layers['spawns'].data = layers['spawns'].data.objects;


				mapJSON.MapFile.properties.height = layers.base.height;
				mapJSON.MapFile.properties.width  = layers.base.width;
				// ==================================================================================



/*
				var base = { height: parseInt(baseLayer.height), width: parseInt(baseLayer.width) },
					sprites = { height: parseInt(spritesLayer.height), width: parseInt(spritesLayer.width), length: spritesLayer.data.length },
					spawns = {},
					zones = { out:[], in:[] };

				map.zones = zones;
				map.spawns = spawns;
				mapJSON.MapFile.properties.width      = base.width;
				mapJSON.MapFile.properties.height     = base.height;
*/

				// Setup all tilesheets
				for (var i=0; i<tilesets.length; ++i) {
					var tileset = tilesets[i];

					mapJSON.MapFile.properties.tilesets.push({
						image: tileset.image,
						name: tileset.name,
						gid: {
							first: tileset.firstgid - 1,
							last: (tileset.imageheight / tileset.tileheight) *
								  (tileset.imagewidth /  tileset.tilewidth) +
								  tileset.firstgid - 2 // NOTE: 2 because firstgid had -1
						},
						tileWidth: tileset.tilewidth,
						tileHeight: tileset.tileHeight,
						rows: (tileset.imageheight / tileset.tileheight),
						columns: (tileset.imagewidth / tileset.tilewidth),
						height: tileset.imageheight,
						width: tileset.imagewidth
					});
				}

/*
				var spawnTileset = null;
				for (var i=0; i<mapJSON.MapFile.properties.tilesets.length; ++i) {
					if (mapJSON.MapFile.properties.tilesets[i].name == "npc") {
						spawnTileset = mapJSON.MapFile.properties.tilesets[i];
					}
				}
*/

				// Build base tiles & sprites
				//
				// The width and height of the map is determined by the base tiles. Any other items from other
				// layers which are listed outside of that range are ignored
				//
				for(var y=0; y<layers.base.height; y+=pageHeight) {
					map.pages[y]={};
					for(var x=0; x<layers.base.width; x+=pageWidth) {
						var page = {
							tiles: [],
							sprites: {}
						};
						map.pages[y][x] = page;

						// go through tiles and apply
						for(var iy=0; iy<pageHeight; ++iy) {
							for(var ix=0; ix<pageWidth; ++ix) {
								page.tiles.push(layers.base.data[(iy+y)*layers.base.width+(ix+x)]);

								// Check if there's a sprite at this spot
								if ( y+iy<layers.sprites.height && x+ix<layers.sprites.width && // Within sprite layer range?
									 (iy+y)*layers.sprites.width+(ix+x)<layers.sprites.data.length) {
									var sprite = layers.sprites.data[(iy+y)*layers.sprites.width+(ix+x)];
									if (sprite != 0) {
										page.sprites[iy*pageWidth + ix] = sprite;
									}
								}
							}
						}
					}
				}


				// Zoning Layer
				///////////////////
				for (var i=0; i<layers.zoning.data.length; ++i) {

					// find tile 
					var zone   = layers.zoning.data[i],
						tx     = (zone.x / tileSize),
						ty     = (zone.y / tileSize),
						txE    = (zone.x+zone.width) / tileSize,
						tyE    = (zone.y+zone.height) / tileSize,
						tiles  = [],
						zoneIn = zone.properties.hasOwnProperty('spot');
					if (zone.x % tileSize !== 0 || zone.y % tileSize !== 0) {
						console.log("Bad zone tile: ("+zone.y+","+zone.x+") for map ["+mapID+"]");
						continue;
					}

					if ((zone.x+zone.width) % tileSize !== 0 || (zone.y+zone.height) % tileSize !== 0) {
						console.log("Bad zone tile end: ("+(zone.y+zone.height)+","+(zone.x+zone.width)+") for map ["+mapID+"]");
						continue;
					}
						
					// create rect array of tiles from tileStart to tileEnd (if zoning is a spot, only use start tile)
					for (var iy=0; iy<(tyE-ty); ++iy) {
						for (var ix=0; ix<(txE-tx); ++ix) {
							var tile = { y: (ty+iy), x: (tx+ix) };
							for (var prop in zone.properties) {
								tile[prop] = zone.properties[prop];
							}
							tiles.push(tile);
							if (zoneIn) {
								layers.zoning.in.push(tile);
							} else {
								layers.zoning.out.push(tile);
							}
							if (zoneIn) break;
						}
						if (zoneIn) break;
					}

				}

				// Spawn Layer
				///////////////////
				if (layers.spawns) {

					var spawnStartGID = 0;
					for (var i=0; i<tilesets.length; ++i) {
						if (tilesets[i].name == "npcs") { // TODO: abstract this
							spawnStartGID = tilesets[i].firstgid;
						}
					}

					for (var i=0; i<layers.spawns.data.length; ++i) {

						// find tile
						var spawn = layers.spawns.data[i],
							tx    = parseInt(spawn.x / tileSize),
							ty    = parseInt(spawn.y / tileSize),
							spawnObj = {
								id: avatars[spawn.gid - spawnStartGID]
							};

						map.spawns[ty*layers.base.width+tx] = spawnObj;
					}
				}


				// if (tilesets.length != 1) {
				// 	console.log(tilesets);
				// 	throw new Error("Too many tilesets!? ("+tilesets.length+")");
				// }

				//var tileset = tilesets[0].image;
				//if (tileset.indexOf('../')==0) tileset = tileset.substr(3);
				//mapJSON.MapFile.properties.tileset = tileset;
				

				fs.writeFile(mapFile, JSON.stringify(mapJSON), function(err){
					if (err) {
						console.log(err);
						return;
					}
					console.log("Successfully exported map: "+mapFile);
				});
			});
		});

	});

});
