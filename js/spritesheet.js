
define(function(){

	var Spritesheet = function(data) {
		this.id = data.id;

		this.image = new Image(data.filename);
		this.image.onload = function() {

		};
		this.width = data.width;
		this.height = data.height;
	}, sheets={};

	return Spritesheet;
});
