$(document).ready(function(){

	var fitDCToScreen = function(){
		var game = $('#game');
		$('#dcScreen').width(game.width()).height(game.height);
	};

	var Disconnected = function(reason1, reason2, reason3){
		fitDCToScreen();
		$('#dcScreen').show();

		$('#dcMessage1').text(reason1 || "");
		$('#dcMessage2').text(reason2 || "");
		$('#dcMessage3').text(reason3 || "");
	};

	var hideDisconnected = function(){
		$('#dcScreen').hide();
	};

	window['Disconnected'] = Disconnected;

	var initializeLogin = function(){
		var fitLoginScreen = function(){
			var game = $('#game');
			$('#loginScreen').width(game.width()).height(game.height);
		};
		$(window).resize(function(){
			fitLoginScreen();
		});

		fitLoginScreen();


		$('#registerToLogin').click(function(){
			$('#register').animate({left: '-800px'}, 800, function(){
				$(this).css('left', '600px');
			});

			$('#login').animate({left: '20px'}, 800, function(){ });

			return false;
		});


		$('#loginToRegister').click(function(){
			$('#login').animate({left: '-800px'}, 800, function(){
				$(this).css('left', '600px');
			});

			$('#register').animate({left: '20px'}, 800, function(){ });

			return false;
		});


		$('#registerButton').click(function(){

			var username     = $('#registerUsername').val(),
				password     = $('#registerPassword').val(),
				passwordConf = $('#registerPasswordConfirm').val(),
				email        = $('#registerEmail').val();

			// Validation
			var filteredUsername = Env.login.filterUsername.exec(username);
			$('#registerUsername').removeClass('error');
			$('#registerUsernameMessage').text("");
			if (!_.isString(username) || !_.isArray(filteredUsername) || filteredUsername.length != 1 || filteredUsername[0] != username) {
				$('#registerUsername').addClass('error');
				$('#registerUsernameMessage').text("Invalid username. Expects alphanumeric string between {2,10} characters");
				return false;
			}

			var filteredPassword = Env.login.filterPassword.exec(password);
			$('#registerPassword').removeClass('error');
			$('#registerPasswordMessage').text("");
			if (!_.isString(password) || !_.isArray(filteredPassword) || filteredPassword.length != 1 || filteredPassword[0] != password) {
				$('#registerPassword').addClass('error');
				$('#registerPasswordMessage').text("Invalid password. Expects alphanumeric string between {0,100} characters");
				return false;
			}

			$('#registerPasswordConfirm').removeClass('error');
			$('#registerPasswordConfirmMessage').text("");
			if (!_.isString(passwordConf) || password != passwordConf) {
				$('#registerPasswordConfirm').addClass('error');
				$('#registerPasswordConfirmMessage').text("Password is not the same");
				return false;
			}

			$('#registerEmail').removeClass('error');
			$('#registerEmailMessage').text("");
			var filteredEmail = Env.login.filterEmail.exec(email);
			if (!_.isString(email) || !_.isArray(filteredEmail) || filteredEmail.length != 1 || filteredEmail[0] != email) {
				$('#registerEmail').addClass('error');
				$('#registerEmailMessage').text("That's not your actual email, is it?");
				return false;
			}

			var testingLocal = true,
				url = null;
			if (testingLocal) {
				url = location.origin;
			} else {
				url = 'http://54.86.213.238';
			}


			$.getJSON(url+':8124', {request:REQ_REGISTER, username: username, password: password, email: email}, function(reply){

				if (!reply || !_.isObject(reply)) {
					$('#registerMessage').text("Server error..");
					return;
				}

				if (reply.success != true) {
					$('#registerMessage').text("Error " + reply.reason);
					return;
				}

				$('#registerMessage').text("Successfully created character!");

				Login(username, password, function(err){
					if (err) {
						$('#loginMessage').text("Error: could not login.. please report this error");
					} else {
						hideLogin();

						if (localStorage.getItem('autologin') === "true") {
							localStorage.setItem('username', username);
							localStorage.setItem('password', password);
						}

						window['hasConnected'] = {
							username: username,
							password: password
						};
					}
				});
			}, function(err){
				console.error(err);
				$('#registerMessage').text("Error: "+err);
			});

			return false;
		});

		$('#loginButton').click(function(){

			var username = $('#loginUsername').val(),
				password = $('#loginPassword').val();

			Login(username, password, function(err){
				if (err) {
					$('#loginMessage').text("Error: "+err.reason);
				} else {
					hideLogin();

					if (localStorage.getItem('autologin') === "true") {
						localStorage.setItem('username', username);
						localStorage.setItem('password', password);
					}

					window['hasConnected'] = {
						username: username,
						password: password
					};
				}
			});

			return false;
		});

		var hideLogin = function(){

			$('#loginScreen').hide();
		};

		window['hideLogin'] = hideLogin;


		// Autologin functionality (for quick dev)
		if (localStorage.getItem('autologin') === "true" &&
			localStorage.getItem('username') &&
			localStorage.getItem('password')) {

			var username = localStorage.getItem('username'),
				password = localStorage.getItem('password');

			Login(username, password, function(err){
				if (err) {
					console.error("Error autologging in!!!");
					console.error(err);
				} else {
					hideLogin();

					window['hasConnected'] = {
						username: username,
						password: password
					};
				}
			});
		}
	};


	var tryToInitializeLogin = function(){
		if (window.hasOwnProperty('Login')) {
			initializeLogin();
		} else {
			setTimeout(tryToInitializeLogin, 100);
		}
	}

	tryToInitializeLogin();
});
