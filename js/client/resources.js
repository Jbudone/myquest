define(function(Resources){
	var Resources={
		_init: function(){

		},

		read: function(file){
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
