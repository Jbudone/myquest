
define(() => {

    const Serializable = {

        toJSON() {
            const json = {};

            const jsonizeValue = function(val) {

                const type = typeof val;
                if (type === 'function') return null;
                if (val === null) return null;
                if (val instanceof Array) {
                    const jsonized  = [];
                    let jsonizedVal = null;

                    for (let i = 0; i < val.length; ++i) {
                        jsonizedVal = jsonizeValue(val[i]);
                        jsonized.push(jsonizedVal);
                    }
                    return jsonized;
                } else if (typeof val === 'object') {

                    if (val.toJSON) {
                        return val.toJSON(); // if error then returning error
                    }

                    const jsonized  = {};
                    let jsonizedVal = null;

                    for (const key in val) {
                        jsonizedVal = jsonizeValue(val[key]);
                        jsonized[key] = jsonizedVal;
                    }
                    return jsonized;
                } else {
                    return val;
                }
            };

            let keyVal  = null,
                jsonVal = null;

            for (const key in this) {
                keyVal = this[key];
                if (typeof keyVal !== 'function') {
                    jsonVal = jsonizeValue(keyVal);
                    json[key] = jsonVal;
                }
            }
            return json;
        },

        fromJSON(data) {

            if (_.isString(data)) {
                // FIXME: look into if this try/catch is hurting performance
                try {
                    data = JSON.parse(data);
                } catch(e){
                    return new Error("Bad JSON given");
                }
            }

            if (!_.isObject(data)) return new Error("Data is not an object");

            for (const key in data) {
                this[key] = data[key];
            }
        },

        serialize() {
            return JSON.stringify(this.toJSON());
        }
    };

    return Serializable;
});
