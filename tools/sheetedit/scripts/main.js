
$(document).ready(function(){

	var assetsMgr = null,
		editor    = null,
		sheet     = null;

	$.getJSON('../../data/assets.json', function(data){

		if (data) {

			var assets = data;
			assetsMgr = new AssetsManager( assets, $('#assets') );

			assetsMgr.onClickTilesheet = function(data, linkEl){
				console.log('Tilesheet');
				console.log(data);
				editor.loadView('tilesheet', data, linkEl);
			};

			assetsMgr.onClickSpritesheet = function(data, linkEl){
				console.log('Spritesheet');
				console.log(data);
				editor.loadView('spritesheet', data, linkEl);
			};

			assetsMgr.onClickNPC = function(data, linkEl){
				console.log('NPC');
				console.log(data);
				editor.loadView('npc', data, linkEl);
			};

			assetsMgr.onAddTilesheet = function(data, linkEl){
				console.log('Tilesheet');
				console.log(data);
				editor.loadView('tilesheet', data, linkEl);
			};
		}
	});

	sheet  = new Sheet( document.getElementById('sheet') );
	editor = new Editor( $('#editArea'), sheet );

});
