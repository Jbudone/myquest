
define(['resources'], function(Resources){


	var Sprite = function(spriteID){
		Ext.extend(this,'sprite');

		// Load Sprite
		// ID of Sprite given..find and use sprite from sprites
		this.states=Resources.sprites[spriteID].states;
		this.sheet=Resources.sprites[spriteID].sheet;
		this.spriteID=spriteID;

		this.tileSize=this.sheet.tileSize.width;
		this.offset_x=this.sheet.offset.x;
		this.offset_y=this.sheet.offset.y;
		this.state={y:(this.tileSize*4), x:(this.tileSize*0)};
		this.draw=function(ctx){
		};

	};

	return Sprite;
});
