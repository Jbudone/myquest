
<html>
<head>
	<!-- NO Cache -->
	<meta http-equiv="cache-control" content="max-age=0" />
	<meta http-equiv="cache-control" content="no-cache" />
	<meta http-equiv="expires" content="0" />
	<meta http-equiv="expires" content="Tue, 01 Jan 1980 1:00:00 GMT" />
	<meta http-equiv="pragma" content="no-cache" />

	<title>Web-based RPG Game -- HEAVY DEVELOPMENT</title>

	<!-- Stylesheets -->
	<style>
		canvas {
			position: absolute;
			margin-left: auto;
			margin-right: auto;
			left: 0;
			right: 0;
		}

		#warnings {
			position: absolute;
			top:520px;
		}

		h3 {
			margin-top: 0px;
			margin-bottom: 0px;
		}
	</style>

	<!-- Scripts -->
	<script src="js/lib/modernizr.js"></script>
	<script src="js/lib/require.js"></script>
</head>
<body>

	<canvas id="background" width="2000px" height="2000px"></canvas>
	<canvas id="entities" width="2000px" height="2000px"></canvas>

	<div id="warnings">
		<h1><b>Warning: </b>Heavy Development</h1>
	
		<h2> Currently working on..</h2>
		<ul>
			<li>Combat system: <b>Resurrection</b>, <b>Player death</b>, <b>Player autoattack</b>, <b>Fighting (facing) direction</b></li>
			<li>Fault taulerance</li>
			<li>Multiplayer components</li>
		</ul>
		<h3> Being tested on Google Chrome</h3>
		<h3> Server is being run on a home network, on a cheap netbook in the basement. May be slow, may be offline</h3>
	</div>
<script>
requirejs.config({
	"baseUrl": "js",
	"paths": {
		// "jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
		"jquery": "lib/jquery-2.0.3.min",
		// "underscore": "//underscorejs.org/underscore",
		"underscore": "lib/underscore-min"
	},
});

// Load the main app module to start the app
require(['underscore','objectmgr','environment','utilities','extensions','event','lib/stacktrace','errors','fsm'],function(_,The,Env,Utils,Ext,Events,Stack,Errors,FSM){

	// TODO: why aren't The or Env global?
	window['The']=The;
	window['Env']=(new Env());
	window['Ext']=Ext;
	window['Stack']=Stack;

	for(var util in Utils) {
		window[util]=Utils[util];
	}

	for(var evtObj in Events) {
		window[evtObj]=Events[evtObj];
	}

	for(var err in Errors) {
		window[err]=Errors[err];
	}

	for(var key in FSM) {
		window[key]=FSM[key];
	}
	for(var i=0; i<FSM['states'].length; ++i) {
		window[FSM['states'][i]]=i;
	}


	window['printStackTrace'] = printStackTrace;

	var id = localStorage.getItem('id');
	window['id']=id;
	requirejs(["main"]);
});
</script>
</body>
</html>
