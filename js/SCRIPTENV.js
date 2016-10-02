define(function(){

var toEval = "";
for (var scriptKey in The.scripting) {
	toEval += "var "+scriptKey+" = The.scripting['"+scriptKey+"']; ";
}
			return toEval;

	return toEval;
});
