
var AssetsManager = function(assets, container, files){

	var interface = {
		onClickTilesheet: new Function(),
		onClickSpritesheet: new Function(),
		onClickNPC: new Function(),
		onRemovedItem: new Function(),

		onAddTilesheet: new Function(),
		onAddSpritesheet: new Function(),
		onAddNPC: new Function()
	},  _el = null,
		avatars = assets.avatars,
		assets = assets.sheets, // TODO: change 'assets' to 'sheets'
		containers = {},
		modifiedList = [],
		addAsset = null;

	// Setup html
	_el = $('<div/>').addClass('assets');

	addAsset = function(assetType, asset){
		var assetContainer = $('<div/>').addClass('asset-container'),
			assetEl = $('<a/>')
						.attr('href', true)
						.addClass('asset')
						.data( 'type', assetType )
						.data( 'asset', asset )
						.text( asset.id ),
			assetRemove = $('<a/>')
							.attr('href', true)
							.addClass('asset-remove')
							.data( 'type', assetType )
							.data( 'asset', asset )
							.text( "X" );

		assetContainer.append( assetRemove ).append( assetEl );

		containers[assetType].element.append( assetContainer );
		containers[assetType].list.push({
			element: assetContainer,
			asset: asset
		});

		assetEl.click(function(){
			var assetType = $(this).data('type'),
				asset     = $(this).data('asset');
			if (assetType == 'tilesheets') interface.onClickTilesheet( asset, $(this) );
			else if (assetType == 'spritesheets') interface.onClickSpritesheet( asset, $(this) );
			else interface.onClickNPC( asset, $(this) );

			return false;
		});

		assetEl.data('modify', function(me){
			for (var i=0; i<modifiedList.length; ++i) {
				if (me == modifiedList[i]) return;
			}
			modifiedList.push( me );
			me.addClass('modified');
			$('#assetsArea').addClass('modified');
			$('#assetsSave').addClass('modified');
		});

		assetRemove.click(function(){

			// Remove Asset from assets list
			/////////////////////////
			var indexOfAsset = -1,
				assetType    = $(this).data('type'),
				asset        = $(this).data('asset'),
				assetList    = assets[ assetType ].list;
			for (var i=0; i<assetList.length; ++i) {
				if (assetList[i] == asset) {
					indexOfAsset = i;
					break;
				}
			}

			if (indexOfAsset == -1) {
				console.error("Could not find asset in asset list?!");
				return false;
			}

			assetList.splice( indexOfAsset, 1 );



			// Remove Asset from container
			/////////////////////////
			indexOfAsset = -1;
			assetList = containers[assetType].list;
			for (var i=0; i<assetList.length; ++i) {
				if (assetList[i].asset == asset) {
					indexOfAsset = i;
					break;
				}
			}

			if (indexOfAsset == -1) {
				console.error("Could not find asset in asset-container list?!");
				return false;
			}

			assetList.splice( indexOfAsset, 1 );

			$(this).parent().remove();
			interface.onRemovedItem(asset);
			$('#assetsArea').addClass('modified');
			$('#assetsSave').addClass('modified');
			return false;
		});


		return assetEl;
	};

	for (var assetType in assets) {
		var assetHead = assets[assetType],
			assetContainer = $('<div/>')
								.addClass('assetContainer')
								.append( $('<span/>').addClass('assetTitle').text( assetHead.title ) );
			assetList = assetHead.list;

		containers[assetType] = {
			element: assetContainer,
			list: []
		};
		for (var i=0; i<assetList.length; ++i) {
			var asset = assetList[i],
				assetEl = addAsset( assetType, asset );
		}

		_el.append( assetContainer );
	}

	$(container).append( _el );

	$('#addTilesheet').click(function(){
		var asset = {
				id:"New Tilesheet",
				image: "",
				tilesize: 16,
				columns: 0,
				rows: 0,
				sheet_offset: {
					x: 0,
					y: 0
				},
				data: {
					collisions: [],
					floating: [],
					objects: {}
				}
			}, assetEl = addAsset( 'tilesheets', asset );
		assetEl.addClass('modified');

		assets.tilesheets.list.push( asset );
		interface.onAddTilesheet( asset, assetEl );

		return false;
	});

	$('#addSpritesheet').click(function(){
		var asset = {
				id:"New Spritesheet",
				image: "",
				tilesize: 16,
				columns: 0,
				rows: 0,
				sheet_offset: {
					x: 0,
					y: 0
				},
				sprite_offset: {
					x: 0,
					y: 0
				},
				data: {
					animations: {},
					avatar: 0
				}
			}, assetEl = addAsset( 'spritesheets', asset );
		assetEl.addClass('modified');

		assets.spritesheets.list.push( asset );
		interface.onAddSpritesheet( asset, assetEl );

		return false;
	});

	$('#assetsSave').data('assets', assets).click(function(){


		var saveSheets = function(){

			var sheetsFile = files.sheets;
			$.post('assets.php', { request: "sheets", assets: assets, file: sheetsFile }, function(data){
				var json = JSON.parse(data),
					success = !!json.success;
				console.log('saved sheets: '+(success?'true':'false'));

				if (success) {
					saveAvatars();
				}
			});

		}, saveAvatars = function(){

			/*
{
"image": {
	"file": "avatars.png",
	"size": 16
}, "avatars": {
	"firefox": 0,
	"goblin": 1
}
}
*/

			var imageDetails = avatars.image,
				canvas = document.createElement('canvas'),
				ctx = canvas.getContext('2d'),
				tilesize = parseInt(imageDetails.size),
				columns = parseInt(imageDetails.columns),
				rows = parseInt( assets.spritesheets.list.length / columns ) + 1;

			// setup our canvas
			canvas.width = columns * tilesize;
			canvas.height = rows * tilesize;


			// make avatars list
			avatars.avatars = [];
			var waitingOn = assets.spritesheets.list.length,
				toDraw = { },
				checkReadyToDraw = function(){
					if (waitingOn != 0) return;
					for (var i=0; i<assets.spritesheets.list.length; ++i) {
						var sprite = assets.spritesheets.list[i],
							details = toDraw[sprite.id],
							source = {
								tilesize: parseInt(sprite.tilesize),
								columns: parseInt(details.image.width / sprite.tilesize),
								rows: parseInt(details.image.height / sprite.tilesize),
							},
							dx = (i % columns) * tilesize,
							dy = parseInt(i / columns) * tilesize;
							source.sx = (details.avatar % source.columns) * source.tilesize;
							source.sy = parseInt(details.avatar / source.columns) * source.tilesize;
							
						avatars.avatars[ i ] = sprite.id;
						ctx.drawImage( details.image,
									  source.sx, source.sy, source.tilesize, source.tilesize,
									  dx, dy, tilesize, tilesize );
					}



					// Save image + data
					var avatarsFile = files.avatars,
						avatarsImageFile = imageDetails.file;
					$.post('assets.php', { request: "avatars", avatars: avatars, image: canvas.toDataURL('image/png'), file: avatarsFile, file_image: avatarsImageFile }, function(data){
						var json = JSON.parse(data),
							success = !!json.success;
						console.log('saved avatars: '+(success?'true':'false'));

						if (success) {
							finishedSaving();
						}
					});


				};

			_.each(assets.spritesheets.list, function(sprite, i){
				var sheet = new Image();
				sheet.onload = function(){
					toDraw[ sprite.id ] = {
						image: sheet,
						sprite: sprite,
						avatar: parseInt(sprite.data.avatar)
					};
					--waitingOn;
					checkReadyToDraw();
				};
				sheet.src = sprite.image;
			});

		}, finishedSaving = function(){

			for (var i=0; i<modifiedList.length; ++i) {
				modifiedList[i].removeClass('modified');
			}
			modifiedList = [];
			$('#assetsArea').removeClass('modified');
			$('#assetsSave').removeClass('modified');
			// TODO: effects to show that save was successful

		};

		saveSheets();

		return false;
	});


	return interface;
};
