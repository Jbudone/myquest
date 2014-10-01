
$(document).ready(function(){

	var assetsMgr = null,
		editor    = null,
		sheet     = null;

	$.getJSON('../../data/assets.json', function(data){

		if (data) {

			var assets = data,
				viewingAsset = null;
			assetsMgr = new AssetsManager( assets, $('#assets') );

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
