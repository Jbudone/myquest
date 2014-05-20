
define(['resources','eventful'], function(Resources,Eventful){



	/* Camera
	 *
	 * Camera is responsible for various rendering techniques; including transitioning (zoning) between pages,
	 * rumbling/shake effects, viewing plateaus?
	 *
	 ********************************************************/
	var Camera = function(){
		extendClass(this).with(Eventful);
		this.lastTime=now();
		this.offsetX=0;
		this.offsetY=0;

		this.isZoning=false;
		this.updated=false;
		this.moveSpeed=75;
		this.lastUpdated=now();

		this.listenTo(The.map, EVT_ZONE, function(map,direction){
			console.log("CAMERA ZONING: "+direction);

			     if (direction=='n') this.offsetY = -(Env.pageHeight-Env.pageBorder) * Env.tileSize;
			else if (direction=='w') this.offsetX = (Env.pageWidth-Env.pageBorder)   * Env.tileSize;
			else if (direction=='e') this.offsetX = -(Env.pageWidth-Env.pageBorder)  * Env.tileSize;
			else if (direction=='s') this.offsetY = (Env.pageHeight-Env.pageBorder)  * Env.tileSize;
		});

		this.step=function(time){
			var move=this.moveSpeed,
				left=-Env.pageBorder*Env.tileSize,
				top=Env.pageBorder*Env.tileSize;
			this.handlePendingEvents();
			// NOTE: still need to draw camera offset, otherwise zoning into this map will cause jaggy camera
			// 		movements
			// if (!The.map.curPage.neighbours.west) left=0;
			// if (!The.map.curPage.neighbours.north) top=0;
			if (this.offsetX<left) {
				this.offsetX+=move;
				if (this.offsetX>left) this.offsetX=left;
				this.updated=true;
			} else if (this.offsetX>left) {
				this.offsetX-=move;
				if (this.offsetX<left) this.offsetX=left;
				this.updated=true;
			} else if (this.offsetY<top) {
				this.offsetY+=move;
				if (this.offsetY>top) this.offsetY=top;
				this.updated=true;
			} else if (this.offsetY>top) {
				this.offsetY-=move;
				if (this.offsetY<top) this.offsetY=top;
				this.updated=true;
			}

			if (time - this.lastUpdated > 2500) {
				this.updated = true; // Use this as a just in case for background redraws
				this.lastUpdated = time;
			}
		};
	};

	return Camera;
});
