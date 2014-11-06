define(function(){

	var Chatter = function(){
		var _self = this;

		this.name = "chatter";
		this.keys = [];
		this.initialize = function(){
			console.log("Loaded chatter");
		};
		this.client = {
			initialize: function(){
				console.log("Chatter is for Client");
				UI.hook('input').first(function(msg){
					console.log("Chatter[pre]: "+msg);
					if (msg == "1234") return false;
					return true;
				}).then(function(msg){
					console.log("Chatter[post]: "+msg);
				});
			},
		};
	};

	return Chatter;
});
