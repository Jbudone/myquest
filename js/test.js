
var requirejs = require('requirejs');

requirejs.config({
	nodeRequire: require,
	baseUrl: "js",
	paths: {
		//"jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
		"underscore": "http://underscorejs.org/underscore",
	},
});



var couldNotStartup = function(e){
   console.log("Could not startup server");
   if (e) {
	   console.log(e);
	   console.log(e.stack);
   }
   process.exit();
};

process.on('exit', couldNotStartup);
process.on('SIGINT', couldNotStartup);
process.on('uncaughtException', couldNotStartup);


requirejs(['keys'],function(Keys){

	var _         = require('underscore'),
		$         = require('jquery')(require("jsdom").jsdom().parentWindow),
		fs        = require('fs'),
		Promise   = require('bluebird'),
		http      = require('http'), // TODO: need this?
		WebSocket = require('ws'),
		chalk     = require('chalk'),
		cluster   = require('cluster');

	$.support.cors = true;
	Promise.longStackTraces();


	var errorInGame = function(e){

		console.error(chalk.red(e));
		console.trace();
		process.exit();
	};

	var printMsg = function(msg){
		if (_.isObject(msg)) msg = JSON.stringify(msg);
		console.log(chalk.bold.underline.green(msg));
	};


		cluster.setupMaster({
			exec: 'js/test/bot.js',
		});
		var bot1 = cluster.fork();
		bot1.on('listening', function(){ });
		var bot1Move = 0,
			bot2Move = 0;
		var bot1Moves = [{x:56, y:65},
						 {x:70, y:65},
						 {x:82, y:65},
						 {x:82, y:75},
						 {x:82, y:85},
						 {x:82, y:94},
						 {x:72, y:94},
						 {x:62, y:94},
						 {x:52, y:94},
						 {x:42, y:94},
						 {x:32, y:94},
						 {x:22, y:94},
						 {x:12, y:94},
						 {x:12, y:84},
						 {x:12, y:74},
						 {x:12, y:64},
						 {x:12, y:54},
						 {x:12, y:44},
						 {x:12, y:34},
						 {x:12, y:25},
						 {x:22, y:25},
						 {x:32, y:25},
						 {x:42, y:25},
						 {x:52, y:25},
						 {x:62, y:25},
						 {x:72, y:25},
						 {x:84, y:25},
						 {x:84, y:35},
						 {x:84, y:45},
						 {x:84, y:55},
						 {x:84, y:65},
						 {x:84, y:75},
						 {x:84, y:85},
						 {x:82, y:94},
						 {x:72, y:94},
						 {x:62, y:94},
						 {x:52, y:94},
						 {x:42, y:94},
						 {x:32, y:94},
						 {x:22, y:94},
						 {x:12, y:94},
						 {x:12, y:25},
						 {x:12, y:84},
						 {x:12, y:74},
						 {x:12, y:64},
						 {x:12, y:54},
						 {x:12, y:44},
						 {x:12, y:34},
						 {x:12, y:25},
						 {x:22, y:25},
						 {x:32, y:25},
						 {x:42, y:25},
						 {x:52, y:25},
						 {x:62, y:25},
						 {x:72, y:25},
						 {x:84, y:25}];
		bot1.on('message', function(msg){
			printMsg(msg);

			if (!msg.msg) return;
			if (msg.msg == 'ready') {
				bot1.send({ command: BOT_CONNECT, username: "bot1", password: "iambot" });
			} else if (msg.msg == 'connected') {

			} else if (msg.msg == 'started') {
				bot1.send({ command: BOT_MOVE, tile: { x: bot1Moves[0].x, y: bot1Moves[0].y } });
			} else if (msg.msg == 'nostart') {

			} else if (msg.msg == 'nologin') {
				bot1.send({ command: BOT_SIGNUP, username: "bot1", password: "iambot", email: "k9@lol.bot" });
			} else if (msg.msg == 'signedup') {
				var username = msg.username,
					password = msg.password;
				bot1.send({ command: BOT_CONNECT, username: username, password: password });
			} else if (msg.msg == 'nosignup') {
				console.error("Could not signup!");
			} else if (msg.msg == 'badpath') {
				// Already there?
				console.error("Could not set path");
				++bot1Move;
				bot1.send({ command: BOT_MOVE, tile: { x: bot1Moves[bot1Move].x, y: bot1Moves[bot1Move].y } });
			} else if (msg.msg == 'failedpath') {
				console.error("Failed to walk along path..");
				--bot1Move;
				setTimeout(function(){
					bot1.send({ command: BOT_MOVE, tile: { x: bot1Moves[0].x, y: bot1Moves[0].y } });
				}, 500);
			} else {
				console.log("FINISHED MOVE: "+bot1Move);
				if (++bot1Move >= bot1Moves.length) {
					console.log("I've finished, master");
				} else {
					bot1.send({ command: BOT_MOVE, tile: { x: bot1Moves[bot1Move].x, y: bot1Moves[bot1Move].y } });
				}
			}
		});

		/*
		var bot2 = cluster.fork();
		bot2.on('listening', function(){
		});
		bot2.on('message', function(msg){
			console.log(msg);
			if (!msg.msg) return;
			if (msg.msg == 'ready') {
				bot2.send({ command: BOT_CONNECT, id: 3 });
			} else if (msg.msg == 'connected') {
				if (++bot2Move % 2 == 0) {
					bot2.send({ command: BOT_MOVE, tile: { x: 22, y: 8 }});
				} else {
					bot2.send({ command: BOT_MOVE, tile: { x: 13, y: 5 }});
				}
			} else {
				if (++bot2Move % 2 == 0) {
					bot2.send({ command: BOT_MOVE, tile: { x: 22, y: 8 }});
				} else {
					bot2.send({ command: BOT_MOVE, tile: { x: 13, y: 5 }});
				}
			}
		});
		*/
});
