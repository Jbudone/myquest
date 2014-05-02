
var fs=require('fs'),
	_ = require('underscore');

fs.readFile('../data/world.json', function(err, data) {
	if (err) {
		console.log(err);
		return;
	}

	var world = JSON.parse(data);
	_.each(world.maps, function(mapFile, mapName) {
		var mapID = mapName;
		var filename = '../data/' + world.maps[mapID] + '.json',
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
			 * TODO:
			 * 	> auto convert .tmx to .json
			 * 	> make use of areas
			 * 	> doors & triggers layers
			 *******************************************************/

			var mapJSON = { MapFile: { Map: {'id':mapID}, properties: {pageWidth:null, pageHeight:null, width:null, height:null, tileset:null} } },
				map = mapJSON.MapFile.Map,
				layers = json.layers,
				tilesets = json.tilesets,
				pageWidth = 50,
				pageHeight = 30,
				tileSize = 16,
				baseLayer = null,
				spritesLayer = null,
				spawnLayer = null,
				zoningLayer = null;

			mapJSON.MapFile.properties.pageWidth  = pageWidth;
			mapJSON.MapFile.properties.pageHeight = pageHeight;

			for(var i=0; i<layers.length; ++i) {
				if (layers[i].name=='base') baseLayer = layers[i];
				else if (layers[i].name=='sprites') spritesLayer = layers[i];
				else if (layers[i].name=='zoning') zoningLayer = layers[i].objects;
				else if (layers[i].name=='spawns') spawnLayer = layers[i].objects;
			}

			var base = { height: parseInt(baseLayer.height), width: parseInt(baseLayer.width) },
				sprites = { height: parseInt(spritesLayer.height), width: parseInt(spritesLayer.width), length: spritesLayer.data.length },
				spawns = {},
				zones = { out:[], in:[] };

			map.zones = zones;
			map.spawns = spawns;
			mapJSON.MapFile.properties.width      = base.width;
			mapJSON.MapFile.properties.height     = base.height;

			// NOTE: base layer determines width/height of map; any sprites outside of this range are ignored
			for(var y=0; y<base.height; y+=pageHeight) {
				map[y]={};
				for(var x=0; x<base.width; x+=pageWidth) {
					map[y][x]={
						tiles:[],
						sprites:[],
						base:null
					};

					// go through tiles and apply
					for(var iy=0; iy<pageHeight; ++iy) {
						for(var ix=0; ix<pageWidth; ++ix) {
							map[y][x].tiles.push(baseLayer.data[(iy+y)*base.width+(ix+x)]);

							var sprite=undefined;
							if ( y+iy<sprites.height && x+ix<sprites.width &&
								 (iy+y)*sprites.width+(ix+x)<sprites.length) {
								sprite=spritesLayer.data[(iy+y)*sprites.width+(ix+x)];
							}
							map[y][x].sprites.push(sprite); // TODO: Push blank if undefined
						}
					}
				}
			}

			// Zoning Layer
			///////////////////
			for (var i=0; i<zoningLayer.length; ++i) {

				// find tile 
				var zone   = zoningLayer[i],
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
							zones.in.push(tile);
						} else {
							zones.out.push(tile);
						}
						if (zoneIn) break;
					}
					if (zoneIn) break;
				}

			}

			// Spawn Layer
			///////////////////
			if (spawnLayer) {

				for (var i=0; i<spawnLayer.length; ++i) {

					// find tile
					var spawn = spawnLayer[i],
						tx    = parseInt(spawn.x / tileSize),
						ty    = parseInt(spawn.y / tileSize),
						spawnObj = {
							id:spawn.type
						};

					spawns[ty*base.width+tx] = spawnObj;
				}

			}


			if (tilesets.length != 1) {
				console.log(tilesets);
				throw new Error("Too many tilesets!? ("+tilesets.length+")");
			}

			var tileset = tilesets[0].image;
			if (tileset.indexOf('../')==0) tileset = tileset.substr(3);
			mapJSON.MapFile.properties.tileset = tileset;
			

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
