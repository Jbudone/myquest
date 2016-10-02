module.exports = function(grunt){

	//require("load-grunt-tasks")(grunt);
	require("time-grunt")(grunt);

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-newer');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-shell');

	grunt.initConfig({
		"babel": {
			options: {
				sourceMap: true,
				presets: ['es2015']
			},
			dist: {
				files: [
				{
					expand: true,
					cwd: 'js/',
					src: ['**/*.js','!lib/*'],
					dest: 'dist/'
				}
				]
			}
		},

		"eslint": {
			dist: {
				options: {
					cache: true
				},
				files: [
				{
					expand: true,
					cwd: 'js/',
					src: ['**/*.js','!lib/*'],
					dest: 'dist/'
				}
				]
			}
		},

        "shell": {
          options: {
            stderr: true
          },
          target: {
            command: 'bash build-scripts'
          }
        },

        "copy": {
          files: {
            cwd: 'js',  // set working folder / root to copy
            src: '**/*',           // copy all files and subfolders
            dest: 'dist',    // destination folder
            expand: true           // required when using cwd
          }
        },

        "watch": {
          scripts: {
              files: 'js/**/*.js',
              tasks: ['default'],
              options: {
                spawn: false
              }
          }
        },

	});

    grunt.event.on('watch', function(action, filepath, target) {
        grunt.log.writeln(target + ': ' + filepath + ' has ' + action);
    });

    grunt.registerTask('scriptinjection', function(){
        grunt.task.run('shell');
    });

	/*
	grunt.registerTask('spritesheets', function(){

		var fs = require('fs');
		fs.readFile('data/sheets.new.json', function(err, data){
			console.log('b');
			if (err) {
				console.error("Could not read sheets!");
				return;
			}

			console.log('a');
			console.log(data);
		});
	});
	*/

    // TODO: only run scriptinjection on files output from babel; otherwise get newer to work with
    // shell
    // TODO: setup json-lint for json files
    // TODO: spritesheets & maps exporting tasks
    // TODO: rebuild task
    // TODO: only copy changed/new lib files
    // TODO: add a blocking file which disallows startup of server/client while present: "Build
    // system still in process"
    //
    // TODO: Instead of continuously recompiling script files, simply watch the injected script for
    // changes and inject into raw scripts?
    /*
    grunt.task.registerTask("default", function(){
        //grunt.loadNpmTasks('grunt-babel');

        //grunt.task.run(['newer:babel', 'shell', 'newer:copy']);
        grunt.task.run(['newer:copy', 'shell']);
    });
    */

    grunt.registerTask("default", ['newer:copy', 'shell']);
    //grunt.registerTask("lint", ['eslint']);
};
