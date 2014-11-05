
// Load our scripting environment
toEval = "";
for (var scriptKey in The.scripting) {
	toEval += "var "+scriptKey+" = The.scripting['"+scriptKey+"']; ";
}

eval(toEval);
