define(['fs'], function(fs){

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
		},
	};

	return Resources;

});
