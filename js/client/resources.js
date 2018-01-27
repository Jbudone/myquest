define(['resourceProcessor'], function(ResourceProcessor){
	var Resources={
		_init: function(){

		},

        process: function(res){
            return ResourceProcessor.unpack(res);
        },

		read: function(file){

			if (Env.isBot) {
				return new Promise(function(loaded, failed){
					fs.readFile(file, function(err, data){
						if (err) {
							failed(err);
						} else {
                            data = Resources.process(data);
                            if (data) {
                                loaded(data);
                            } else {
                                failed();
                            }
						}
					});
				});
			} else {
				return new Promise(function(succeeded, failed){
					$.ajax(file, {
						cache: false,
						dataType: 'text'
					}).done(function(res){

                        res = Resources.process(res);
                        if (res) {
                            succeeded(res);
                        } else {
                            failed();
                        }
					}).error(function(err){
						failed(err);
					});
				});
			}
        }
	};

	return Resources;
});
