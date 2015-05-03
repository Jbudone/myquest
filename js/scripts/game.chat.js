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
					player.registerHandler(EVT_CHAT, 'chat');
					player.handler(EVT_CHAT).set(function(evt, data){
						var time = now();
						if (time - player.timeSinceLastMessage < Env.chat.serverTimeBetweenMessages) {
							console.log("Ignoring user message.. too soon");
							return;
						}
						player.timeSinceLastMessage = now();
						console.log("WE HEARD A MESSAGE?!");
						console.log(data.message);
						var success = true;
						player.respond(evt.id, success, {
							message: data.message
						});

						if (success) {
							// Broadcast to pages
							player.movable.page.broadcast(EVT_CHAT, {
								player: player.id,
								message: entity.name+" says: "+data.message
							});
						}
					});
					player.timeSinceLastMessage = now();
				});

				game.hook('removedplayer', this).after(function(entity){
					
					var player = entity.player;
					player.handler(EVT_CHAT).unset();
				});
			},

			unload: function(){
				if (!_.isUndefined(game)) game.unhook(this);
			}
		};
		this.client = {
			initialize: function(){
				console.log("Chatter is for Client");
				UI.hook('inputSubmit', _self).before(function(msg){
					console.log("Chatter[pre]: "+msg);
					var time = now();
					if (time - _self.timeSinceLastMessage < Env.chat.clientTimeBetweenMessages) {
						console.log("Ignoring user message.. too soon");
						return false;
					}
					_self.timeSinceLastMessage = now();
					return true;
				}).after(function(msg){
					console.log("Chatter[post]: "+msg);
					server.request(EVT_CHAT, {
						message: msg
					}).then(function(){
						console.log("Success in sending message! "+msg);
					}, function(){
						console.error("Fail in message! "+msg);
					})
					.catch(Error, function(e){ errorInGame(e); })
					.error(function(e){ errorInGame(e); });
				});

				server.registerHandler(EVT_CHAT, 'chat');
				server.handler(EVT_CHAT).set(function(evt, data){
					UI.postMessage(data.message, MESSAGE_INFO);
				});

				_self.timeSinceLastMessage = now();
			},

			unload: function(){
				if (!_.isUndefined(UI)) UI.unhook(_self);
				if (!_.isUndefined(server)) server.handler(EVT_CHAT).unset();
			}
		};
	};

	return Chatter;
});
