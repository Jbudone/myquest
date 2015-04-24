
define(['serializable'], function(Serializable){

	var numPaths=0,
		localActionId=0;

	var now=Date.now,
		isObjectEmpty=function(obj){

		if (!(obj instanceof Object)) return new MismatchError("Expected object");

		var empty=true;
		for (var s in obj){
			empty=false;
			break;
		}
		return empty;
	}, frontOfObject=function(obj){
		if (!(obj instanceof Object)) return new MismatchError("Expected object");

		for (var k in obj){
			return k;
		}
		return null;
	}, extendClass=function(toClass) {return{
		with: function(module){
			var copy=function(target){
				var type = typeof target;
				if (type == 'object') {

					if (target == null) return null;
					if (target instanceof Array) {
						var arr=[];
						for (var i=0; i<target.length; ++i) {
							arr.push( copy(target[i]) );
						}
						return arr;
					} else {
						var obj={};
						for (var key in target) {
							obj[key]=copy(target[key]);
						}
						return obj;
					}
				} else {
					return target;
				}
			};
			for (var key in module){
				toClass[key]=copy(module[key]);
			}
			return toClass;
		}};
	}, Point = function(x,y) {
		extendClass(this).with(Serializable);
		this.x=x;
		this.y=y;
	}, Tile=function(y, x, map){
		if (!_.isNumber(y)) return new Error("Expects y to be a number");
		if (!_.isNumber(x)) return new Error("Expects x to be a number");
		extendClass(this).with(Serializable);
		this.y=y;
		this.x=x;


		if (map) {
			if (!(typeof map === "Map")) return new Error("Expected Map object");
			var pageY = parseInt(y / Env.pageHeight),
				pageX = parseInt(x / Env.pageWidth);
			this.page = map.pages[ map.pagesPerRow * pageY + pageX ];
			if (!(typeof this.page === "Page")) return new Error("pageY/pageX is out of range of Map pages");
		}

		this.toJSON=function(){
			var tile={
				y:y,
				x:x
			};
			if (this.hasOwnProperty('page')) tile.page = this.page.index;
		};
		this.offset=function(yOff, xOff) {
			if (!_.isNumber(yOff)) return new Error("Expects yOff to be a number");
			if (!_.isNumber(xOff)) return new Error("Expects xOff to be a number");
			var y = this.y + yOff,
				x = this.x + xOff;
			if (y < 0 || x < 0) return new Error("Bad offset from tile.."); // TODO: check y/x too far?
			return new Tile(y, x);
		};
		this.localizeTile=function(){
			if (!this.page) return false;
			if (this.page.y <= this.y &&
				this.page.x <= this.x) {

					console.log("Localizing tile: from ("+this.y+", "+this.x+")");
					this.y -= this.page.y;
					this.x -= this.page.x;
					console.log("		to ("+this.y+", "+this.x+")");
			} else {
				console.log("COULD NOT LOCALIZE TILE!");
				console.log("Page: "+this.page.y+", "+this.page.x);
				console.log("Tile: "+this.y+", "+this.x);
				return false;
			}
		};
	}, Walk=function(direction, distance, destination){
		extendClass(this).with(Serializable);
		this.direction   = direction;
		this.distance    = distance; // distance (global real coordinates)
		this.walked      = 0; // distance travelled already
		this.destination = destination; 
	}, Path=function(){
		extendClass(this).with(Serializable);
		this.id          = (++numPaths);
		this.walks       = [];
		this.start       = null; // TODO: NEED THIS (splitWalks)
		this.onFinished  = new Function();
		this.onFailed    = new Function();

		this.length=function(){
			var distance=0;
			for (var i=0; i<this.walks.length; ++i) {
				distance += this.walks[i].distance;
			}
			return distance;
		};

		this.addWalk=function(direction, distance, destination){
			if (!_.isNumber(direction) || !_.isNumber(distance)) return new Error("Expected direction/distance as numbers");
			this.walks.push((new Walk(direction, distance, destination)));
		};

		this.splitWalks=function(){
			var walks    = [],
				maxWalk  = 2 * Env.tileSize,
				curTile  = this.start;
			for (var i=0; i<this.walks.length; ++i) {
				var walk    = this.walks[i],
					walked  = 0,
					steps   = walk.distance;
					
				while (walked < steps) {
					var nextWalk = new Walk(walk.direction, null, null),
						yDistance = 0,
						xDistance = 0;
						
					if (walked + maxWalk > steps) {
						nextWalk.distance = (steps - walked);
					} else {
						nextWalk.distance = maxWalk;
					}

					     if (walk.direction == NORTH) yDistance = -nextWalk.distance;
					else if (walk.direction == SOUTH) yDistance =  nextWalk.distance;
					else if (walk.direction == WEST)  xDistance = -nextWalk.distance;
					else if (walk.direction == EAST)  xDistance =  nextWalk.distance;
					curTile = curTile.offset( Math.round(yDistance/Env.tileSize),
											  Math.round(xDistance/Env.tileSize) );
					if (_.isError(curTile)) return curTile;
					nextWalk.destination = curTile;

					walked += maxWalk;
					walks.push(nextWalk);
				}
			}

			this.walks = walks;
		};

	}, loadLocalExtension=function(module,context){
		var folder=(Env.isServer?'server':'client');
		require([folder+'/'+module], function(module){
			console.log(module);
		});
	}, BufferQueue=function(){
		this.taco=[];
		this.bell=[];
		this.state=true;
		this.switch=function(){
			this.state=!this.state;
		};
		this.queue=function(data){
			var buffer=(this.state?this.taco:this.bell);
			buffer.push(data);
		};
		this.read=function(){
			return (this.state?this.bell:this.taco);
		};
		this.clear=function(){
			if (this.state) this.bell=[];
			else this.taco=[];
		};
	};

	return {
		now: now,
		extendClass: extendClass,
		Point: Point,
		Walk: Walk,
		Path: Path,
		Tile: Tile,
		loadLocalExtension: loadLocalExtension,
		BufferQueue: BufferQueue,
		isObjectEmpty: isObjectEmpty,
		frontOfObject: frontOfObject
	};
});
