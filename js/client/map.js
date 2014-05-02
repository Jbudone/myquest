
define(function(){

	var Map={

		curPage:null,

		loadMap: function(){

		},

		zoning: false,
		zone: function(direction) {
			var newPage=null;
			     if (direction=='n') newPage=this.curPage.neighbours.north;
			else if (direction=='w') newPage=this.curPage.neighbours.west;
			else if (direction=='s') newPage=this.curPage.neighbours.south;
			else if (direction=='e') newPage=this.curPage.neighbours.east;

			if (newPage) {
				this.zoning = true;
				var borderX=Env.pageBorder*Env.tileSize,
					borderY=Env.pageBorder*Env.tileSize;

				if (!newPage.neighbours.west) borderX=0;
				if (!newPage.neighbours.north) borderY=0;
				console.log("Zoning: "+direction);
				this.curPage=newPage;

				this.triggerEvent(EVT_ZONE, direction);

				// How do we know we've finished zoning?
				// 	Player: finished moving (also disallow any further movement, OR stack movements if player
				// 			currently zoning)
				var timeOfZoning=(new Date()).getTime(),
					minTimeToZone=0; // TODO: calculate based off min steps to safe spot, and char movespeed
				this.listenTo(The.player, EVT_FINISHED_WALK, function(player){
						this.zoning = false;
						this.stopListeningTo(The.player, EVT_FINISHED_WALK);
				});
			}
		},

		step: function(time) {
			// process events queue
			this.handlePendingEvents();
			for (var i in this.pages) {
				var page = this.pages[i];
				page.step(time);
			}
			this.handlePendingEvents(); // events from pages
		}
	};

	return Map;
});
