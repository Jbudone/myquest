define(function(Resources){
	var Resources={
		_init: function(){

		},

		read: function(file){

			if (Env.isBot) {
				return new Promise(function(loaded, failed){
					fs.readFile(file, function(err, data){
						if (err) {
							failed(err);
						} else {
							loaded(data);
						}
					});
				});
			} else {
				return new Promise(function(succeeded, failed){
					$.ajax(file, {
						cache: false,
						dataType: 'text'
					}).done(function(res){
						succeeded(res);
					}).error(function(err){
						failed(err);
					});
				});
			}
		}
	};

	return Resources;
});
