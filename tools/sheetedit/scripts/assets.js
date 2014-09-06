
var AssetsManager = function(assets, container){

	var interface = {
		onClickTilesheet: new Function(),
		onClickSpritesheet: new Function(),
		onClickNPC: new Function()
	},  _el = null,
		assets = assets,
		modifiedList = [];

	// Setup html
	_el = $('<div/>').addClass('assets');

	for (var assetType in assets) {
		var assetHead = assets[assetType],
			assetContainer = $('<div/>')
								.addClass('assetContainer')
								.append( $('<span/>').addClass('assetTitle').text( assetHead.title ) );
			assetList = assetHead.list;

		for (var i=0; i<assetList.length; ++i) {
			var asset = assetList[i],
				assetEl = $('<a/>')
								.attr('href', true)
								.addClass('asset')
								.data( 'type', assetType )
								.data( 'asset', asset )
								.text( asset.id );

			assetContainer.append( assetEl );

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
		}

		_el.append( assetContainer );
	}

	$(container).append( _el );


	$('#assetsSave').data('assets', assets).click(function(){

		$.post('assets.php', { assets: assets }, function(data){
			var json = JSON.parse(data);
			console.log('success: '+(!!json.success?'true':'false'));

			for (var i=0; i<modifiedList.length; ++i) {
				modifiedList[i].removeClass('modified');
			}
			modifiedList = [];
			$('#assetsArea').removeClass('modified');
			$('#assetsSave').removeClass('modified');
			// TODO: effects to show that save was successful
		});

		return false;
	});

	return interface;
};
