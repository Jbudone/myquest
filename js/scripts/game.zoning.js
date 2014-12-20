define(['SCRIPTENV'], function(SCRIPTENV){

	eval(SCRIPTENV);

	var ZoningMgr = function(){
		var _self = this;

		this.name = "zoning";
		this.keys = [];
		this.initialize = function(){
			_self.heMoved(-2);
			console.log("Loaded zoning mgr.. but you're a client aren't ya? :)");
		};
		this.heMoved = function(id){
			console.log("YOU TOTALLY MOVED, DIDN'T YOU ["+id+"] !?");
		};
		this.client = {
			initialize: function(){
				//console.log("Loading zoning mgr");
				_self.heMoved(-1);
				this.listenTo(player, EVT_MOVED_TO_NEW_TILE).then(function(theGuyWhoMoved){
					_self.heMoved(id);
				});
			},

			heMoved: function(id){
				//console.log("Cliently moved ["+id+"]");
			}
		};
	};

	return ZoningMgr;
});
