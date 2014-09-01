define(['loggable'],function(Loggable){

	var ServerHandler = function(){

		extendClass(this).with(Loggable);
		this.setLogGroup('Connection');
		this.setLogPrefix('(Connection) ');

		this.websocket = null;

		this.requestBuffer     = new EventsArchive(),
		this.requestsId        = 0,
		this.requests          = [], // Requests sent to server

		this.connect = function(link){
			var server = this;
			this.requestBuffer.pushArchive();
			return new Promise(function(connected, failed){
				server.websocket = new WebSocket(link);
				server.Log("Connecting to: "+link);

				server.websocket.onopen = function(evt){
					server.Log("Connected to server");
					connected(evt);
				};

				server.websocket.onerror = function(evt){
					server.Log("Error connecting to server", LOG_CRITICAL);
					failed(evt);
				};

				server.websocket.onclose = function(evt){
					server.Log("Disconnected from server..");
					server.onDisconnect();
				};

				server.websocket.onmessage = function(evt){
					server.Log("Message received", LOG_DEBUG);

					evt = JSON.parse(evt.data);
					if (typeof evt != "object") {
						server.Log("Bad message received from server", LOG_ERROR);
					}

					// TODO: form server as an FSM, since we can expect newCharacter or login first; and then
					// map initialization responses next, and then map related events. Move from one state of
					// responses to the next
					       if (evt.newCharacter) {
						if (evt.success) server.onLogin( evt.newCharacter );
						else             server.onLoginFailed();
					} else if (evt.login) {
						if (evt.success) server.onLogin( evt.player );
						else             server.onLoginFailed();
					} else if (evt.initialization) {
						server.onInitialization( evt );
					} else if (evt.events) {
						var page   = evt.page,
							buffer = JSON.parse(evt.events),
							events = buffer.events;
						for (var i=0; i<events.length; ++i) {
							var event   = JSON.parse(events[i]),
								evtType = event.evtType;

							     if (evtType == EVT_ADDED_ENTITY) server.onEntityAdded( page, event.entity );
							else if (evtType == EVT_REMOVED_ENTITY) server.onEntityRemoved( page, event.entity );
							else if (evtType == EVT_PREPARING_WALK) server.onEntityWalking( page, event.data );
							else if (evtType == EVT_ATTACKED) server.onEntityHurt( page, event.data.entity, event.data.target );
							else if (evtType == EVT_ATTACKED_ENTITY) server.onEntityAttackedEntity( page, event.data.entity, event.data.target );
							else if (evtType == EVT_NEW_TARGET) server.onEntityNewTarget( page, event.data.entity, event.data.target );
							else if (evtType == EVT_REMOVED_TARGET) server.onEntityRemovedTarget( page, event.data.entity, event.data.target );
							else if (evtType == EVT_DEAD) server.onEntityDied( page, event.data.entity );
							else {
								server.Log("Unknown event received from server", LOG_ERROR);
								server.Log(evt, LOG_ERROR);
							}
						}
					} else if (evt.zone) {
						server.onZone( evt.pages );
					} else if (evt.zoneMap) {
						server.onLoadedMap( evt.map );
					} else {
						server.Log("Unknown event received from server", LOG_ERROR);
						server.Log(evt, LOG_ERROR);
					}
				};
			});
		};

		this.onDisconnect = new Function();
		this.onLogin = new Function();
		this.onLoginFailed = new Function();
		this.onInitialization = new Function();
		this.onLoadedMap = new Function();
		this.onZone = new Function();
		this.onEntityAdded = new Function();
		this.onEntityRemoved = new Function();
		this.onEntityWalking = new Function();
		this.onEntityHurt = new Function();
		this.onEntityAttackedEntity = new Function();
		this.onEntityNewTarget = new Function();
		this.onEntityRemovedTarget = new Function();
		this.onEntityDied = new Function();



		this.login = function(playerID){
			this.Log("Logging in..");
			
			var event;
			if (playerID) event = new Event((++this.requestsId), EVT_LOGIN, { playerID: playerID }, null);
			else    event = new Event((++this.requestsId), EVT_NEW_CHARACTER, {}, null);
			this.request(event).then( this.onLogin, this.onLoginFailed );
		};

		this.request = function(event){
			var server = this;
			return new Promise(function(allow, disallow){
				event.callback = function(response){
					if (response) {
						if (response.success) {
							allow(response);
						} else {
							disallow(response);
						}
					} else {
						server.Log("No response from request", LOG_ERROR);
						server.Log(event, LOG_ERROR);
					}
				};

				server.websocket.send(event.serialize());
				server.requestBuffer.addEvent(event);

			});
		};
	};

	return ServerHandler;

});
