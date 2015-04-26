define(['lib/stacktrace'], function(Stack){

	var GenericError = function(error, data) {
		this.name    = "Error";
		this.message = error;
		this.data    = (data || null);
		this.print   = function() {
			if (console.error) {
				console.error(this.name + ': ' + this.message);
				if (this.data) console.error(data);
				console.trace();
				console.log(this.stack);
			} else {
				console.log(this.name + ': ' + this.message);
				console.log(this.stack);
				if (this.data) console.log(data);
			}
		}
	};
	// GenericError.prototype = new Error;

	var errorTypes = [
		'MismatchError',
		'RangeError',
		'UnexpectedError'
	], allErrors = {};

	allErrors['GenericError'] = GenericError;

	for (var i=0; i<errorTypes.length; ++i) {
		var errorName = errorTypes[i];
		allErrors[errorName] = Error;
		// FIXME: decided to go with _.isError(e) which doesn't work on extended errors like this.. adjust as
		// necessary
		// allErrors[errorName] = function(error) {
		// 	this.name = errorName;
		// 	this.message = error;
		// };
		// allErrors[errorName].prototype = new GenericError;

	}

	var GameError = function(error, data) {
		this.name    = "Error";
		this.message = error;
		this.data    = (data || null);
		this.print   = function() {
			if (console.error) {
				console.error(this.name + ': ' + this.message);
				if (this.data) console.error(data);
				console.trace();
				console.log(this.stack);
			} else {
				console.log(this.name + ': ' + this.message);
				console.log(this.stack);
				if (this.data) console.log(data);
			}
		}
	};

	allErrors['GameError'] = GameError; // NOTE: a Game error is not an error in code; its an error specific to within the game (eg. a player requests to pickup an item which is not there)

	return allErrors;
});
