define(function(){

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

        var e = new Error();
        this.stack = e.stack;
	};

	allErrors['GameError'] = GameError; // NOTE: a Game error is not an error in code; its an error specific to within the game (eg. a player requests to pickup an item which is not there)

  var Err = function ErrorMessage(message, ...args) {
      var err = new Error(),
          stack = err.stack;

      stack = message + "\n" + stack;
      if (!Env.isServer && !Env.isBot) {
          console.error(message);
          console.error(args);
          debugger;
      } else {
          const msg = stack.split('\n')[3];
          DEBUGGER(message); // DEBUGGER will attempt to find this error message in uglified src and sourcemap back
      }
    return { message: message, args: args, stack: stack };
  }

    allErrors['Err'] = Err;

  /*
	// An extendable error class
	// arg1 is supposed to be a hint (o/w use it for args)
	// arg2 is supposed to be args
	var Err = function(message, arg1, arg2){

		var e = new Error(message);

		// In case arg1
		if (!arg2 && _.isObject(arg1)) {
			arg2 = arg1;
		}

		e.hint = _.isFinite(arg1) ? arg1 : null;
		e.args = arg2 || {};
		return e;
	};
  */

	return allErrors;
});
