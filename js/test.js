
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


		cluster.setupMaster({
			exec: 'js/test/bot.js',
		});
		var bot1 = cluster.fork();
		bot1.on('listening', function(){
		});
		var bot1Move = 0,
			bot2Move = 0;
		bot1.on('message', function(msg){
			console.log(msg);
			if (!msg.msg) return;
			if (msg.msg == 'ready') {
				bot1.send({ command: BOT_CONNECT, id: 2 });
			} else if (msg.msg == 'connected') {
				if (++bot1Move % 2 == 0) {
					bot1.send({ command: BOT_MOVE, tile: { x: 25, y: 5 }});
				} else {
					bot1.send({ command: BOT_MOVE, tile: { x: 17, y: 5 }});
				}
			} else {
				if (++bot1Move % 2 == 0) {
					bot1.send({ command: BOT_MOVE, tile: { x: 25, y: 5 }});
				} else {
					bot1.send({ command: BOT_MOVE, tile: { x: 17, y: 5 }});
				}
			}
		});

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
});
