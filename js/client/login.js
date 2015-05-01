$(document).ready(function(){

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
		if (!_.isString(username) || username.length < 1) {
			$('#registerUsername').addClass('error');
			$('#registerUsernameMessage').text("Invalid username");
			return false;
		}

		if (!_.isString(password) || password.length < 1) {
			$('#registerPassword').addClass('error');
			$('#registerPasswordMessage').text("Invalid password");
			return false;
		}

		if (!_.isString(passwordConf) || password != passwordConf) {
			$('#registerPasswordConfirm').addClass('error');
			$('#registerPasswordConfirmMessage').text("Password is not the same");
			return false;
		}



		$.getJSON(location.origin+':8124', {request:REQ_REGISTER, username: username, password: password, email: email}, function(reply){

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
				$('#loginMessage').text("Error: Bad username/password");
			} else {
				hideLogin();
			}
		});

		return false;
	});

	var hideLogin = function(){

		$('#loginScreen').hide();
	};

	window['hideLogin'] = hideLogin;


});
