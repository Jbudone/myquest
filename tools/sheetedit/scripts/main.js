
var assetDetails = {
    tileTypes: {
        collisions: {
            title: "Collision",
            highlight: "#CC0000",
            opacity: 0.6
        },
        floating: {
            title: "Floating",
            highlight: "#00CC00",
            opacity: 0.6
        },
        //visible: {

        //},
        shootable: {
            title: "Shootable",
            highlight: "#0000CC",
            opacity: 0.6
        },

        // TODO: Would be really really nice to add Objects to this list, however objects is an {} in assets.js, and
        // editor.js handles objects very differently
        // objects: {
        //     title: "Objects",
        //     highlight: "#CCCC00",
        //     opacity: 0.4
        // }
    }
};

window.assetDetails = assetDetails;


$(document).ready(function(){

    for (var tileType in assetDetails.tileTypes) {
        $('<button/>')
            .attr('id', 'ctrl-'+tileType)
            .attr('type', 'button')
            .addClass('btn')
            .addClass('btn-default')
            .text(assetDetails.tileTypes[tileType].title)
            .appendTo($('#buttons_tilesheets'));
    }

	var assetsMgr = null,
		editor    = null,
		sheet     = null,
		resources = null;

	var dataDir = '../../data/';
	$.getJSON(dataDir + 'resources.new.json', function(data){

		// Data is the list of resources
		resources = data;

		var assets = { },
			viewingAsset = null;


		var loading = 0,
			checkLoaded = function(){
				if (loading == 0) {
					loadedAssets();
				}
			};
		
		// Load sheets
		++loading;
		$.getJSON(dataDir + resources.sheets, function(data){
			if (data) {
				assets.sheets = data;
				--loading;
				checkLoaded();
			} else {
				console.error("Could not load resource..");
			}
		});
		
		// Load avatars
		++loading;
		$.getJSON(dataDir + resources.avatars, function(data){
			if (data) {
				assets.avatars = data;
				--loading;
				checkLoaded();
			} else {
				console.error("Could not load resource..");
			}
		});

		var loadedAssets = function(){

				var files = {
					
					sheets: dataDir + resources.sheets,
					avatars: dataDir + resources.avatars,
				};
				assetsMgr = new AssetsManager( assets, $('#assets'), files );

				assetsMgr.onClickTilesheet = function(data, linkEl){
					console.log('Tilesheet');
					console.log(data);
					viewingAsset = data;
					editor.loadView('tilesheet', data, linkEl);
				};

				assetsMgr.onClickSpritesheet = function(data, linkEl){
					console.log('Spritesheet');
					console.log(data);
					viewingAsset = data;
					editor.loadView('spritesheet', data, linkEl);
				};

				assetsMgr.onClickNPC = function(data, linkEl){
					console.log('NPC');
					console.log(data);
					viewingAsset = data;
					editor.loadView('npc', data, linkEl);
				};

				assetsMgr.onAddTilesheet = function(data, linkEl){
					console.log('Tilesheet');
					console.log(data);
					viewingAsset = data;
					editor.loadView('tilesheet', data, linkEl);
				};

				assetsMgr.onAddSpritesheet = function(data, linkEl){ 
					console.log('Spritesheet');
					console.log(data);
					viewingAsset = data;
					editor.loadView('spritesheet', data, linkEl);

					// FIXME: quickfix that might work if finished
					// The bug is initiated by:  New Spritesheet -> *drop image* -> New Animation
					// var _changed = sheet.onSheetChanged;
					// sheet.onSheetChanged = function(sheetName, _sheet){
					// 	_changed(_sheet);
					// 	sheet.onSheetChanged = _changed;

					// 	var linkEl = this.linkEl;
					// 	debugger;
					// 	setTimeout(function(){linkEl.click()}, 100);
					// }.bind({linkEl:linkEl});
				};

				assetsMgr.onRemovedItem = function(asset){

					// In case asset currently loaded, clear view
					if (viewingAsset == asset) {
						editor.loadView('none');
					}

					// TODO: show SAVE as modified
				};
		}


	});

	sheet  = new Sheet( document.getElementById('sheet') );
	editor = new Editor( $('#editArea'), sheet );

});
