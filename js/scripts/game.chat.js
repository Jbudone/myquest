define(['SCRIPTENV'], function(SCRIPTENV){

	eval(SCRIPTENV);

	var Chatter = function(){
		var _self = this;

		this.name = "chatter";
		this.keys = [];
		this.initialize = function(){
			console.log("Loaded chatter");
		};
		this.server = {
			initialize: function(){
				console.log("Chatter is for Server");

				var game = this._script;
				game.hook('addedplayer', this).after(function(entity){
					console.log("Chatter would like to listen to ["+entity.id+"] for messages..");
					
					var player = entity.player;
					player.registerHandler(EVT_TESTJB, 'chat');
					player.handler(EVT_TESTJB).set(function(evt, data){
						console.log("WE HEARD A MESSAGE?!");
						console.log(data.message);
						var success = true;
						if (data.message == "123") success = false;
						player.respond(evt.id, success, {
							message: data.message
						});

						if (success) {
							// Broadcast to pages
							player.movable.page.broadcast(EVT_TESTJB, {
								player: player.id,
								message: "Player "+player.id+": "+data.message
							});
						}
					});
				});

				// FIXME: keep track of players & remove when necessary
			},

			unload: function(){
				if (!_.isUndefined(game)) game.unhook(this);
			}
		};
		this.client = {
			initialize: function(){
				console.log("Chatter is for Client");
				UI.hook('input', this).before(function(msg){
					console.log("Chatter[pre]: "+msg);
					if (msg == "1234") return false;
					return true;
				}).after(function(msg){
					console.log("Chatter[post]: "+msg);
					server.request(EVT_TESTJB, {
						message: msg
					}).then(function(){
						console.log("Success in sending message! "+msg);
					}, function(){
						console.error("Fail in message! "+msg);
					})
					.catch(Error, function(e){ gameError(e); })
					.error(function(e){ gameError(e); });
				});

				server.registerHandler(EVT_TESTJB, 'chat');
				server.handler(EVT_TESTJB).set(function(evt, data){
					UI.postMessage(data.message, MESSAGE_INFO);
				});
			},

			unload: function(){
				if (!_.isUndefined(UI)) UI.unhook(this);
				if (!_.isUndefined(server)) server.handler(EVT_TESTJB).unset();
			}
		};
	};

	return Chatter;
});
