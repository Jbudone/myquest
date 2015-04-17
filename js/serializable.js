
define(function(){

	var Serializable = {
		toJSON:function(){
			var json={},
				jsonizeValue = function(val) {
					var type = typeof val;
					if (type == 'function') return null;
					if (val == null) return null;
					if (val instanceof Array) {
						var jsonized = [],
							jsonizedVal = null;
						for (i=0; i<val.length; ++i) {
							jsonizedVal = jsonizeValue(val[i]);
							if (_.isError(jsonizedVal)) return jsonizedVal;

							jsonized.push( jsonizedVal );
						}
						return jsonized;
					} else if (typeof val == 'object') {
						if (val.hasOwnProperty('toJSON')) {
							var json = val.toJSON();
							return json; // if error then returning error
						}
						var jsonized = {},
							jsonizedVal = null;
						for (var key in val) {
							jsonizedVal = jsonizeValue(val[key]);
							if (_.isError(jsonizedVal)) return jsonizedVal;

							jsonized[key] = jsonizedVal;
						}
						return jsonized;
					} else {
						return val;
					}
				},
				keyVal = null,
				jsonVal = null;

			for (var key in this) {
				keyVal = this[key];
				if (typeof keyVal != "function") {
					jsonVal = jsonizeValue(keyVal);
					if (_.isError(jsonVal)) return jsonVal;

					json[key] = jsonVal;
				}
			}
			return json;
		},
		fromJSON:function(data){

			if (_.isString(data)) {
				// FIXME: look into if this try/catch is hurting performance
				try {
					data = JSON.parse(data);
				} catch(e){
					return Error("Bad JSON given");
				}
			}

			if (!_.isObject(data)) return Error("Data is not an object");

			for (var key in data) {
				this[key] = data[key];
			}
		},
		serialize:function(){
			var json = this.toJSON();
			if (_.isError(json)) return json;

			return JSON.stringify(json);
		}
	};

	return Serializable;
});
