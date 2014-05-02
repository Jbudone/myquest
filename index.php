
<html>
<head>
	<!-- NO Cache -->
	<meta http-equiv="cache-control" content="max-age=0" />
	<meta http-equiv="cache-control" content="no-cache" />
	<meta http-equiv="expires" content="0" />
	<meta http-equiv="expires" content="Tue, 01 Jan 1980 1:00:00 GMT" />
	<meta http-equiv="pragma" content="no-cache" />

	<!-- Stylesheets -->
	<style>
		canvas {
			position:absolute;
		}
	</style>

	<!-- Scripts -->
	<script src="js/lib/modernizr.js"></script>
	<script src="js/lib/require.js"></script>
</head>
<body>

	<canvas id="background" width="2000px" height="2000px"></canvas>
	<canvas id="entities" width="2000px" height="2000px"></canvas>

<script>
requirejs.config({
	"baseUrl": "js",
	"paths": {
		"jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
		"underscore": "//underscorejs.org/underscore",
	},
});

// Load the main app module to start the app
require(['underscore','objectmgr','environment','utilities','extensions','event','lib/stacktrace','errors'],function(_,The,Env,Utils,Ext,Events,Stack,Errors){

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

	window['printStackTrace'] = printStackTrace;

	window['id']=null;
	<?php if (isset($_GET['id'])) { ?> id = <?php echo $_GET['id']; } ?>;
	if (!id) {
		id = localStorage.getItem('id');
	}

	if (id) {
		requirejs(["main"]);
	} else {
		console.error("Need an id..");
	}
});
</script>
</body>
</html>
