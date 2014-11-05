module.exports = function(grunt){

	grunt.initConfig({
		shell: {
			options: {
				stderr: true
			},
			target: {
				command: 'bash build-scripts'
			}
		},
		pkg: grunt.file.readJSON("package.json")
	});

	grunt.loadNpmTasks('grunt-shell');
	grunt.registerTask('default', function(){
		grunt.task.run('shell');
	});
};
