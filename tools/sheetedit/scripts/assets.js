
var AssetsManager = function(assets, container){

	var interface = {
		onClickTilesheet: new Function(),
		onClickSpritesheet: new Function(),
		onClickNPC: new Function()
	},  _el = null;

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
				if (assetType == 'tilesheets') interface.onClickTilesheet( asset );
				else if (assetType == 'spritesheets') interface.onClickSpritesheet( asset );
				else interface.onClickNPC( asset );

				return false;
			});
			// assetEl.click((function(){
			// 	var clickType = null; 
			// 	if (assetType == 'tilesheets') clickType = interface.onClickTilesheet;
			// 	else if (assetType == 'spritesheets') clickType == interface.onClickSpritesheet;
			// 	else clickType == interface.onClickNPC;

			// 	return function(){ clickType(asset); return false; };
			// }()));
			// TODO: event handling (select, deselect, hover, unhover)
			// TODO: ajax loading, ajax saving, promises
		}

		_el.append( assetContainer );
	}

	$(container).append( _el );

	return interface;
};
