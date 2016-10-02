define(function(){

	// Pool
	//
	// A pool container for objects which can be recycled
	// Allocates objects on the fly, and keeps them contained in contiguous memory
	// for faster access. The array size is fixed (to avoid copies between arrays),
	// so when more objects are needed then another array of the same fixed size is
	// created. When one of extra arrays becomes empty, then it is freed from memory.
	// 
	// You can provide an initialization constructor for objects which are only
	// called upon its creation. Afterwards only the normal constructor is called
	var Pool = function(object){

		var pool = [];

		this.new = function(){
			
			var o;
			if (pool.length) {
				o = pool.shift();
				o.constructor.apply(this, arguments);
			} else {
				o = new object;
				o.apply(this, arguments);
			}


		};

		object.prototype.dispose = function(){
			pool.unshift(this);
		};
	};

	return {
		Pool: Pool
	};
});
