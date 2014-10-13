define(function(Resources){
	var Resources={
		_init: function(){

		},

		ready: function(file){
			return new Promise(function(succeeded, failed){
				$.ajax(file, {
					cache: false,
					dataType: 'text'
				}).done(function(res){
					succeeded(res);
				});
			});
		}
	};

	return Resources;
});
