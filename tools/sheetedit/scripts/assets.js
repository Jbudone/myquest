
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
                    objects: {}
                }
        };

        for (var tileType in assetDetails.tileTypes) {
            asset.data[tileType] = [];
        }

        var assetEl = addAsset( 'tilesheets', asset );
		assetEl.addClass('modified');

		assets.tilesheets.list.push( asset );
		interface.onAddTilesheet( asset, assetEl );

		return false;
	});

	$('#addSpritesheet').click(function(){
		var asset = {
				id:"New Spritesheet",
				image: "",
				sheet_offset: {
					x: 0,
					y: 0
				},
				sprite_offset: {
					x: 0,
					y: 0
				},
                sprite_size: {
                    w: 16,
                    h: 16
                },
				data: {
					animations: {},
					avatar: {
                        x: 0,
                        y: 0,
                        w: 64,
                        h: 64
                    }
				}
			}, assetEl = addAsset( 'spritesheets', asset );
		assetEl.addClass('modified');

		assets.spritesheets.list.push( asset );
		interface.onAddSpritesheet( asset, assetEl );

		return false;
	});

	$('#assetsSave').data('assets', assets).click(function(){

		var confirmDimensions = function(){

			return new Promise(function(finished){

                let gid = 0;
                const waitingOn = [];
				for (var i=0; i<assets.tilesheets.list.length; ++i) {

					var env = {
						asset: assets.tilesheets.list[i],
						img: new Image(),
						width: null,
						height: null,
						tileSize: asset.tileSize
					};

                    let imgPromise = new Promise(function(success, fail){

                        env.img.onload = () => {
                            this.asset.columns= Math.ceil((this.img.width - parseInt(this.asset.sheet_offset.x)) / parseInt(this.asset.tilesize));
                            this.asset.rows = Math.ceil((this.img.height - parseInt(this.asset.sheet_offset.y)) / parseInt(this.asset.tilesize));

                            let totalItems = this.asset.rows * this.asset.columns - 1;
                            this.asset.gid = {
                                first: gid,
                                last: gid + totalItems
                            };
                            gid += totalItems + 1;

                            success();
                        };

                        env.img.src = env.asset.image;
					}.bind(env));

                    waitingOn.push(imgPromise);
				}

                Promise.all(waitingOn).then(finished);
			});
		};

		var saveSheets = function(){

			confirmDimensions().then(function(){

				var sheetsFile = files.sheets;
				$.post('assets.php', { request: "sheets", assets: JSON.stringify(assets), file: sheetsFile }, function(data){
					var json = JSON.parse(data),
						success = !!json.success;
					console.log('saved sheets: '+(success?'true':'false'));

					if (success) {
						finishedSaving();
					}
				});

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
