
define(function(){

	var Serializable = {
		toJSON:function(){
			var json={},
				jsonizeValue = function(val) {
					var type = typeof val;
					if (type == 'function') return null;
					if (val == null) return null;
					if (val instanceof Array) {
						var jsonized = [];
						for (i=0; i<val.length; ++i) {
							jsonized.push( jsonizeValue(val[i]) );
						}
						return jsonized;
					} else if (typeof val == 'object') {
						if (val.hasOwnProperty('toJSON')) {
							try {
								var json = val.toJSON(),
									attempt = JSON.stringify(json);
								return json;
							} catch(e) {
								console.log("Error: could not toJSON on: "+key);
								// return null;
							}
						}
						var jsonized = {};
						for (var key in val) {
							jsonized[key] = jsonizeValue(val[key]);
						}
						return jsonized;
					} else {
						return val;
					}
				};
			for (var key in this) {
				var keyVal = this[key];
				if (typeof keyVal != "function") {
					json[key] = jsonizeValue(keyVal);
				}
			}
			return json;
		},
		fromJSON:function(data){
			var parse = function(json) {

			};

			for (var key in data) {
				this[key] = data[key];
			}
		},
		serialize:function(){
			var json = this.toJSON();
			return JSON.stringify(json);
		}
	};

	return Serializable;
});
