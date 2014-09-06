
var AssetsManager = function(assets, container){

	var interface = {
		onClickTilesheet: new Function(),
		onClickSpritesheet: new Function(),
		onClickNPC: new Function(),

		onAddTilesheet: new Function(),
		onAddSpritesheet: new Function(),
		onAddNPC: new Function()
	},  _el = null,
		assets = assets,
		containers = {},
		modifiedList = [],
		addAsset = null;

	// Setup html
	_el = $('<div/>').addClass('assets');

	addAsset = function(assetType, asset){
		var assetEl = $('<a/>')
						.attr('href', true)
						.addClass('asset')
						.data( 'type', assetType )
						.data( 'asset', asset )
						.text( asset.id );

		containers[assetType].element.append( assetEl );
		containers[assetType].list.push({
			element: assetEl,
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
					floating: []
				}
			}, assetEl = addAsset( 'tilesheets', asset );
		assetEl.addClass('modified');

		assets.tilesheets.list.push( asset );
		interface.onAddTilesheet( asset, assetEl );

		return false;
	});

	$('#assetsSave').data('assets', assets).click(function(){

		$.post('assets.php', { assets: assets }, function(data){
			var json = JSON.parse(data),
				success = !!json.success;
			console.log('success: '+(success?'true':'false'));

			if (success) {
				for (var i=0; i<modifiedList.length; ++i) {
					modifiedList[i].removeClass('modified');
				}
				modifiedList = [];
				$('#assetsArea').removeClass('modified');
				$('#assetsSave').removeClass('modified');
				// TODO: effects to show that save was successful
			}
		});

		return false;
	});

	return interface;
};
