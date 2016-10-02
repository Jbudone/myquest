define(['SCRIPTINJECT'], function(SCRIPTINJECT){

    /* SCRIPTINJECT */

	var ZoningMgr = function(){
		var _self = this;

		this.name = "zoning";
		this.keys = [];
		this.initialize = function(){
			_self.heMoved(-2);
		};
		this.heMoved = function(id){ };
		this.client = {
			initialize: function(){
				// _self.heMoved(-1);
				// this.listenTo(player, EVT_MOVED_TO_NEW_TILE).after(function(theGuyWhoMoved){
				// 	_self.heMoved(id);
				// });
			},

			heMoved: function(id){
			}
		};
	};

	return ZoningMgr;
});
