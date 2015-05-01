define(function(){

	var LoginHandler = function(http, db){

		var url = require('url');

		http.createServer(function(req, res){

			var request = url.parse(req.url, true).query; // request from user
			res.writeHead(200, {'Content-Type': 'text/json', 'Access-Control-Allow-Origin' : '*'});

			var reply = null;
			if (!request.hasOwnProperty('request')) {
				reply = {success:false, reason:'No request'};
			} else {
				if (request.request == REQ_REGISTER) {

					var username = request.username,
						password = request.password,
						email    = request.email;

					if (!_.isString(username) || !_.isString(password) || !_.isString(email)) {
						reply = {success:false, reason:'Bad username/password/email'};
					} else {
						db.registerUser(username, password, email).then(function(err, id){
							
							if (err) {
								reply = {success:false, reason: err};
							} else {
								reply = {success:true, id:id};
							}

						}, function(err){
							console.error(err);
						}).catch(Error, function(err){
							console.error(err);
						});
					}
				}
			}


			res.end(JSON.stringify(reply));
		}).listen(8124);

	};

	return LoginHandler;
});
