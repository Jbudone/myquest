define(['fs'], function(fs){

    const chokidar = require('chokidar');

	var Resources={
		fs: null,
		_init: function(){
			this.fs = require('fs');
		}, read: function(file){
			return new Promise(function(loaded, failed){
				fs.readFile(file, function(err, data){
					if (err) {
						failed(err);
					} else {
						loaded(data);
					}
				});
			});
        }, watchFile: function(file, cb){

            const watcher = chokidar.watch(file, { persistent: true });
            watcher.on('change', (path, stats) => {
                this.read(file).then(cb);
            });
        },
	};

	return Resources;

});
