define(['lib/stacktrace'], function(Stack){

	var GenericError = function(error) {
		this.name    = "Error";
		this.message = error;
		this.print   = function() {
			if (console.error) {
				console.error(this.name + ': ' + this.message);
				console.trace();
				console.log(this.stack);
			} else {
				console.log(this.name + ': ' + this.message);
				console.log(this.stack);
			}
		}
	};
	GenericError.prototype = new Error;

	var errorTypes = [
		'MismatchError',
		'RangeError',
		'UnexpectedError'
	], allErrors = {};

	allErrors['GenericError'] = GenericError;

	for (var i=0; i<errorTypes.length; ++i) {
		var errorName = errorTypes[i];
		allErrors[errorName] = function(error) {
			this.name = errorName;
			this.message = error;
		};
		allErrors[errorName].prototype = new GenericError;

	}

	return allErrors;
});
