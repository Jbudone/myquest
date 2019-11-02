const Parser = require("@babel/parser");
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const fs = require('fs');

const prettier = require('prettier');
const jshint = require('jshint').JSHINT;

let __FIXME_ERRCNT = 0;

// NOTE:
//  Here's the current state of PreprocessAST for future me:
//      - Dynamic whitelisting isn't fool proof, its completely basic in favour of better static and runtime perf + less
//      complexity
//
//          Code:
//              do.a.thing();
//              do.a.thingTwo();
//
//          Basic dynamic whitelisting
//              CHECK(do) && CHECK(do.a) && CHECK(do.a.thing);
//              do.a.thing();
//              CHECK(do.a.thingTwo);
//              do.a.thingTwo();
//
//          Safer dynamic whitelisting
//              CHECK(do) && CHECK(do.a) && CHECK(do.a.thing);
//              do.a.thing();
//              CHECK(do) && CHECK(do.a) && CHECK(do.a.thingTwo);
//              do.a.thingTwo();
//
//
//         This considers if our whitelist has changed in other code. If we really wanted to do that we would want to
//         preprocess *all* code and keep an obj-like file that provides a whitelist for functions across the scope of
//         the project. Unfortunately because of JS typeless nature its not easy to determine which function is being
//         called, so its not easy to point to the right function when whitelisting. Worse this makes things far more
//         complicated and more perf heavy. I think having a basic whitelisting mode is better. If we really needed we
//         could simply provide an option to make whitelisting less trustworthy so that we only whitelist safe types
//         (Env, Math, Array, Object, etc.) and use that mode for soak tests or something
//
//
//      - I'm not sure how much I trust the loc for sourcemaps; that may need some cleaning
//      - Further preprocess would be nice: SCRIPT_INJECT, Assert, LOG_DEBUG, etc.
//      - If statements and conditionals would be nice to work in:
//
//
//          if (foo.a ? foo.a.b() : foo.b.c())
//
//          Desired:
//          CHECK(foo) && (foo.a ? (CHECK(foo.a) && CHECK(foo.a.b)) : (CHECK(foo.b) && CHECK(foo.b.c)))
//
//      - Profiling/optimizations: I haven't done any profiling, so I'm not sure how well this performs and if there's
//      any easy speed ups





// TODO:
//  - SCRIPT_INJECT in here as opposed to bash?
//      - Have to check leadingComments on all nodes for this
//      - Could take an argument that specifies if we need to check for SCRPIT_INJECT; also could only look until we
//      find it, then stop looking
//  - FIXME: Do we need CHeckNode(topNode === true) to be a block statement? If so we should Assert this
//  * FIXME: LocalExpression, BinaryExpression
//      These are allowed to fail since we may have previous checks:
//          _.isObject(notAnObj) && notAnObj.a.b.c.d()
//
//      We could make our checks like: { CHECK(a) && CHECK(a.b) && CHECK(a.b.c) }
//      With binary/logical expressions we could include them as so:
//          { (CHECK(a) && { CHECK(a.b) || CHECK(a.c) }) || (CHECK(b) }
//
//  - Inline static functions: DEBUGGER, etc.
//      We could inline with the expression:
//          (_.isObject(notAnObj) && (CHECK(notAnObj) && CHECK(notAnObj.a) && CHECK(notAnObj.a.b) &&
//          CHECK(notAnObj.a.b.c) && CHECK(notAnObj.a.b.c.d) && notAnObj.a.b.c.d()))
//  * FIXME: ConditionalExpression
//  - Smoke tests would be nice for this. Parse & CHECK code that's supposed to fail at parts, and will only crash if
//  preprocessed incorrectly
//  - Lint for less safe code / unable to check code
//  - More accurate copying of loc for sourcemaps
//  * FIXME: Dynamic whitelist on type checking (list of known values as we traverse through nodes)
//       - HAS_KEY unecessary if we're about to test that key: IS_OBJECT(a), HAS_KEY(a, 'b'), IS_OBJECT(a.b)
//       - scopedWhitelist: BodyStatement pushes a new scope to this array, then goes through each expression in body
//          - Each preCheck/replacementCheck adds to scopedWhitelist
//          - Pop scopedWhitelist at end of BodyStatement processing
//          - whitelist: hash of node/check?
//  * Inline checks: CHECK( (typeof a === 'object') && ('b' in a) && (typeof a.b === 'object') )
//  - Check not null/undefined:
//      a[c.d] -- c.d should be defined, and probably a raw type (NumericLiteral, string)
//
//
//  - How would we prevent checks if we've already done a manual check?
//      if (a && a.b && a.b.c) { ... }
//  - Whitelist check: be ready for mutations in-between:
//     
//     a.b.c.d = 1
//     if (x) Transform(a)
//     a.b.c.e = 2
//
//
//      Maybe we can keep track of type intrinsic while parsing, and then when a call is made we kill nuke any
//      intrinsics that we can't trust anymore. Then when we want to CHECK we first see if the check is already safe
//
//      Would need this to also be safe with block scope (conditions/etc.)
//
//      - Profile to determine overhead for extra assertion checking (no whitelist? nuke part of whitelist after
//      mutation call)
//
//  - Profiler speeds for larger files
//  - Could keep track of all available variables based off scope as we traverse through node. For any CHECK(..) points
//  we could also provide a list of variables in the scope, add it all to a string (for better perf) and pass that
//  string to an eval that allows us to fetch those variables and then pass to DEBUG or errorReport
//      CHECK(typeof a.b === "object", "a;x;f")
//          --> Assert(typeof a.b === "object") ? {} : { var scopedVars = eval(codeFromScopedVarsStr("a;x;f")); DEBUGGER(assertStatement, scopedVars); };
//              false? build variable fetch from str
//                  scopedVarsCode = "scopedVars.push(a, x, f)"
//                  eval(scopedVarsCode)
//                  DEBUGGER(assertStatement, scopedVars)
//  - Fix output:
//      const
//              a; CHECK(b);
//
//      a = b.c;
//  - Clean CheckNode input:  (curNode, assert, state)
//      assert: things we want to check/confirm
//      state: modifyNode, scopeNode, scopedWhitelist




// TESTS BELOW
//let code = "const a = function() {\nconst b = 1; const c = 3; c.call(); assert(Log(b) && 1 && true && b.yup()); a.b.c.thing(); b(); a[b.c].d; return b.that(); }; assert(Log(a) && console.log(b)); Log(a()); console.log(a()); a[b.c].d; var x = { b:1, c:[1,2] };";
//let code = "{ CALL({ check: 1, args: [{ node: a.b.c }] }); }";
//let code = "{ a[b.c.d].e.f(); }";
//let code = "{ a[b.c] = 2; }";
//let code = "{ a.b(3); }";
//let code = " { a.b().c(); }";
//let code = "{ a.b.c; }";
//let code = "{ a.b[c].d; }";
//let code = "{ a.b[0].d; }";
//let code = "{ a.b['s'].d; }";
//let code = "{ var f = () => { if(a.b.c.d) { { var a = c.d; } return b.x(); } else return 2; }; }";
//let code = "{ for(var a in b.c.d) { x(); a(); } }";
//let code = "{ var f = () => { const obj = { x: 1}, a = obj, b = a.x, c = obj.x(1, 2); } }";
//let code = "{ const obj = { x: 1}, a = obj, b = a.x, c = obj.x(1, 2); }";
//let code = "{ const a = x(j.k.y / z.w, 10),\
//                    b = x(j.k.x / z.w, 10),\
//                    c = this.y(z, y); }";
//let code = "{ this.charComponent = function(name) {\
//                return this.charComponents.find((c) => c.name === name);\
//            }; }";
//let code = "{ f((c) => c.name === name); }";
//let code = "{ const fxmgrPath = Env.isBot ? 'test/pseudofxmgr' : 'client/fxmgr',\n\
//    rendererPath = Env.isBot ? 'test/pseudoRenderer' : 'client/renderer',\n\
//    uiPath = Env.isBot ? 'test/pseudoUI' : 'client/ui'; }";
//let code = "{ ( ( typeof defensiveInfo == 'object' || DEBUGGER('a') ) && ( typeof target == 'object' || DEBUGGER('b') ) && ( typeof target.entity == 'object' || DEBUGGER('c') ) && ( typeof target.entity.npc == 'object' || DEBUGGER('d') ) ) }";
let code = "{ var OBJECT_TYPES = ['object', 'function']; var a = 1; OBJECT_TYPES.includes(typeof a); }";


const Settings = {
    output: null,
    verbose: true
    //checkSyntax: true
};

const ModifyNode = function() {
    this.preCheck    = []; // preCheck: Checks made *before* the node
    this.replaceNode = []; // replaceNode: Replace node with these
    this.hoistNodes  = []; // hostNodes: Hoist these nodes to the top of the scope
};

let sourceFile = 'a.js';

// Process Server arguments
for (let i = 0; i < process.argv.length; ++i) {

    const arg = process.argv[i];
    if (arg === "--file") {
        sourceFile = process.argv[++i];
        code = fs.readFileSync(sourceFile, 'utf8');
    } else if (arg == "--output") {
        Settings.output = process.argv[++i];
        Settings.verbose = false;
    }
}


const OBJECT_TYPE = "OBJECT",
    FUNCTION_TYPE = "FUNCTION";

const HAS_KEY = "HAS_KEY",
    IS_TYPE   = "IS_TYPE";


// Clone a node
const cloneNode = (node) => {

    const clonedNode = {};
    if (node.type === 'ExpressionStatement') {
        console.error("FIXME: Unexpected cloning ExpressionStatement");
        return null;
    } else if (node.type === 'Identifier') {

        clonedNode.type = node.type;
        clonedNode.name = node.name;
    } else if (node.type === 'MemberExpression') {

        clonedNode.type = node.type;
        clonedNode.object = cloneNode(node.object);
        clonedNode.property = cloneNode(node.property);

        clonedNode.computed = node.computed;
        //if (clonedNode.property.type === 'MemberExpression') {
        //    clonedNode.computed = true;
        //}
    } else if (node.type === 'CallExpression') {

        clonedNode.type = node.type;
        clonedNode.callee = cloneNode(node.callee);

        clonedNode.arguments = [];
        node.arguments.forEach((arg) => {
            const clonedArg = cloneNode(arg);
            clonedNode.arguments.push(clonedArg);
        });
    } else if (node.type === 'NumericLiteral') {

        clonedNode.type = node.type;
        clonedNode.value = node.value;
    } else if (node.type === 'StringLiteral') {

        clonedNode.type = node.type;
        clonedNode.value = node.value;
    } else if (node.type === 'ThisExpression') {

        clonedNode.type = node.type;
    } else if (node.type === 'BinaryExpression') {

        clonedNode.type = node.type;
        clonedNode.operator = node.operator;
        clonedNode.left = cloneNode(node.left);
        clonedNode.right = cloneNode(node.right);
    } else {
        console.error(`FIXME: Unexpected cloning type ${node.type}`);
        for (let key in node) {
            if(['loc','start','end','type'].indexOf(key) >= 0) continue;
            console.error(`  node.${key}`);
        }
        return null;
    }

    return clonedNode;
};


// Convert a child node to a BlockStatement if necessary
// eg.      var a = () => return 1;
//   into:  var a = () => { return 1; }
const blockChildNode = (node, prop) => {
    if (node[prop].type !== 'BlockStatement') {
        const blockNode = {
            type: 'BlockStatement',
            directives: [],
            body: [node[prop]],
            loc: {
                filename: sourceFile,
                start: {
                    line: node.loc.start.line,
                    column: node.loc.start.column
                },
                end: {
                    line: node.loc.end.line,
                    column: node.loc.end.column
                }
            }
        };

        node[prop] = blockNode;
        return blockNode;
    }

    return node[prop];
};


// Create a node from a CHECK block
// eg. { checker: IS_TYPE, args: [node, OBJECT_TYPE] }
const buildNodeFromCheck = (checkItem, loc) => {


    const setNodeLoc = (node) => {
        //node.start = 0;
        //node.end = 0;
        node.loc = {
            filename: loc.filename,
            start: {
                line: loc.start.line,
                column: loc.start.column
            },
            end: {
                line: loc.end.line,
                column: loc.end.column
            }
        }
    };

    //const checkNodeArr = [];
    const checkNodeExpr = {
        type: 'ExpressionStatement',
        expression: {
            type: 'LogicalExpression',
            NODE_CHECKTYPE: true,
            left: {},
            operator: '||',
            right: {
                type: 'CallExpression',
                callee: {
                    type: 'Identifier',
                    name: 'DEBUGGER'
                },
                arguments: [{
                    type: 'StringLiteral',
                    value: `ERROR MESSAGE HERE: ${++__FIXME_ERRCNT}` // FIXME
                }]
            }
        }
    };

    setNodeLoc(checkNodeExpr);

    const checkItemNode = {};
    checkNodeExpr.expression.left = checkItemNode;
    setNodeLoc(checkItemNode);

    if (checkItem.checker === IS_TYPE) {

        // Whitelisted types for checking
        const whitelistTypeCheck = ['MemberExpression', 'Identifier'];
        if (whitelistTypeCheck.indexOf(checkItem.args[0].type) === -1) {
            return null;
        }


        /*
        // Type Comparison
        const typeCmpNode = {
            type: 'ObjectProperty',
            key: {
                type: 'Identifier',
                name: 'typeCmp'
            },
            value: {
                // FIXME: We'll change this to numeric literal later
                type: 'Identifier',
                name: checkItem.args[1]
            },
            kind: 'init'
        };

        setNodeLoc(typeCmpNode);
        checkItemNode.properties.push(typeCmpNode);
        */

        // Node to check
        const clonedNode = cloneNode(checkItem.args[0]);
        //const objNode = {
        //    type: 'ObjectProperty',
        //    key: {
        //        type: 'Identifier',
        //        name: 'node'
        //    },
        //    value: clonedNode,
        //    kind: 'init'
        //};





        checkItemNode.type = 'CallExpression';
        checkItemNode.callee = {
            object: {
                type: 'Identifier',
                name: 'OBJECT_TYPES'
            },
            property: {
                type: 'Identifier',
                name: 'includes'
            },
            computed: false,
            type: 'MemberExpression'
        };
        checkItemNode.arguments = [{
            type: 'UnaryExpression',
            operator: 'typeof',
            argument: clonedNode
        }];



        setNodeLoc(checkItemNode.callee);
        setNodeLoc(checkItemNode.arguments[0]);
        //checkItemNode.properties.push(objNode);

    } else if (checkItem.checker === HAS_KEY) {

        let value, type;
        if (checkItem.args[2].type === 'Identifier') {
            value = checkItem.args[2].name;
        } else if (checkItem.args[2].type === 'Literal') {
            value = checkItem.args[2].value;
        } else if (checkItem.args[2].type === 'NumericLiteral') {
            value  = checkItem.args[2].value;
        } else if (checkItem.args[2].type === 'MemberExpression') {
        } else {
            // FIXME: Property may not be a literal/identifier, eg.  a[b.c.d]
            console.error(`FIXME: Unhandled property type ${checkItem.args[2].type} for HAS_KEY check`);
            return;
        }

        let propNode = {};

        // Computed node?
        if (checkItem.args[3]) {
            propNode.type = 'Identifier';
            propNode.name = value;
        } else {
            propNode.type = 'StringLiteral';
            propNode.value = value;
        }

        if (checkItem.args[2].type === 'MemberExpression') {
            propNode = cloneNode(checkItem.args[2]);
        }

        // Object
        const clonedObjNode = cloneNode(checkItem.args[1]);
        //const objInitNode = {
        //    type: 'ObjectProperty',
        //    key: {
        //        type: 'Identifier',
        //        name: 'object'
        //    },
        //    value: clonedObjNode,
        //    kind: 'init'
        //};
        //setNodeLoc(objInitNode);
        //checkItemNode.properties.push(objInitNode);

        //// Property
        //const objPropNode = {
        //    type: 'ObjectProperty',
        //    key: {
        //        type: 'Identifier',
        //        name: 'property'
        //    },
        //    value: propNode,
        //    kind: 'init'
        //};
        //setNodeLoc(objPropNode);
        //checkItemNode.properties.push(objPropNode);
        checkItemNode.type = 'BinaryExpression';
        checkItemNode.operator = 'in';
        checkItemNode.left = propNode;
        checkItemNode.right = clonedObjNode;
        setNodeLoc(checkItemNode);

    }

    //checkNodeArr.push(checkItemNode);

    return checkNodeExpr;
};

const stringifyNode = (node, topNode) => {
    if (node.type === 'MemberExpression') {

        if (topNode) {
            const objStr = stringifyNode(node.object, true);
            if (!objStr) return;
            return `${objStr}`;
        } else {
            const objStr = stringifyNode(node.object),
                valStr = stringifyNode(node.property);

            if (!objStr || !valStr) return;

            if (node.computed) {
                return `${objStr}[${valStr}]`;
            } else {
                return `${objStr}.${valStr}`;
            }
        }
    } else if (node.type === 'Identifier') {
        return node.name;
    } else if (node.type === 'ThisExpression') {
        return 'this';
    } else if (node.type === 'StringLiteral') {
        return node.value;
    } else if (node.type === 'NumericLiteral') {
        return node.value;
    } else if (node.type === 'BinaryExpression') {
        const left = stringifyNode(node.left),
            right = stringifyNode(node.right);

        if (!left || !right) return;
        return `${left}${node.operator}${right}`;
    }
};

const isSafeIdentifier = (node) => {

    let identifier = stringifyNode(node, true);
    if (!identifier) return false;

    // Global node object?
    // FIXME: What about window objects for user? Or mismatch between window/GLOBAL in user/server tests?
    if (SafeIdentifiers.indexOf(identifier) >= 0) {
        return true;
    }

    // FIXME: Check against common node libs?
    // FIXME: Custom list of global objects in game: Err, Env
};

// isCheckWhitelisted
// Check if we've already whitelisted this check
const isCheckWhitelisted = (checkItem, builtCheck, scopedWhitelist) => {

    //let checks = builtCheck.expression.left.arguments[0] .left.argument;
    let hashedCheck = '';

    let validHashCheck = false;
    if (checkItem.checker === IS_TYPE) {
        //let check = checks[2];
        let check = checkItem.args[0];
        if (checkItem.args[1] === OBJECT_TYPE) {
            hashedCheck = 'IS_TYPE:OBJECT_TYPE:';
        } else if (checkItem.args[1] === FUNCTION_TYPE) {
            hashedCheck = 'IS_TYPE:FUNCTION_TYPE:';
        }

        // Is this a globally safe object?
        if (isSafeIdentifier(check)) {
            return true;
        }

        let nodeCheckStr = stringifyNode(check);
        if (nodeCheckStr) {
            hashedCheck += nodeCheckStr;
            validHashCheck = true;
        }
    } else if (checkItem.checker === HAS_KEY) {
        //let obj = checks[1], prop = checks[2];
        let obj = checkItem.args[1], prop = checkItem.args[2];
        let objCheckStr = stringifyNode(obj.value);
        let valCheckStr = stringifyNode(prop.value);


        // Is this a globally safe object?
        if (isSafeIdentifier(obj.value)) {
            return true;
        }

        if (objCheckStr && valCheckStr) {
            hashedCheck = `HAS_KEY:${objCheckStr}:${valCheckStr}`;
            validHashCheck = true;
        }
    }

    if (!validHashCheck) {
        console.error("FIXME: Unexpected check against whitelist");
        return false;
    }

    // Does this hash exist in our whitelist?
    let checkScope = scopedWhitelist;
    do {
        if (checkScope.whitelist.indexOf(hashedCheck) >= 0) {
            return true;
        }
        checkScope = checkScope.parentScope;
    } while (checkScope);

    // Not whitelisted? Add to whitelist
    scopedWhitelist.whitelist.push(hashedCheck);
    return false;
};

// CheckNodeBody
// Check all elements in the body of the node, and handle any preChecks, replacements or hoisting returned from checks
const checkNodeBody = (node, state) => {
    const body = node.body;
    const thisScope = state.scope;
    const innerScope = { parentScope: thisScope, whitelist: [] };
    state.scope = innerScope;
    const modifyNode = state.modifyNode;
    for(let i = 0; i < body.length; ++i) {

        // Begin checking this expression
        const node = body[i];
        const innerModifyNode = new ModifyNode();
        let prevLen = body.length;
        state.modifyNode = innerModifyNode;
        CheckNode(node, null, state);

        let lastAssertLine = -2,
            lastAssert = null;

        // Prepend all preChecks before node
        if (innerModifyNode.preCheck.length > 0) {
            innerModifyNode.preCheck.forEach((checkItem) => {
                // { checker: IS_TYPE, args: [NODE, TYPE] }
                // { checker: HAS_KEY, args: [NODE, NODE.OBJECT, NODE.PROPERTY] }
                const checkNode = buildNodeFromCheck(checkItem, node.loc);
                if (checkNode) {
                    if (isCheckWhitelisted(checkItem, checkNode, innerScope)) return;

                    // Can we flatten this assert into the previous line?
                    if (lastAssertLine === (i - 1)) {
                        // Find leftmost node and splice as logicalExpression there to branch this check
                        let leftMostNode = lastAssert.expression, leftMostNodeParent = null;
                        while (leftMostNode.left && leftMostNode.left.NODE_CHECKTYPE) {
                            leftMostNodeParent = leftMostNode;
                            leftMostNode = leftMostNode.left;
                        }

                        if (!leftMostNodeParent) {
                            lastAssert.expression = {
                                type: 'LogicalExpression',
                                NODE_CHECKTYPE: true,
                                left: leftMostNode,
                                operator: '&&',
                                right: checkNode.expression
                            };
                        } else {
                            leftMostNodeParent.left = {
                                type: 'LogicalExpression',
                                NODE_CHECKTYPE: true,
                                left: leftMostNode,
                                operator: '&&',
                                right: checkNode.expression
                            };

                            leftMostNodeParent.left.loc = leftMostNodeParent.loc;
                        }

                        // Steal loc from lastAssert
                        checkNode.loc = lastAssert.expression.loc;

                        //lastAssert.expression.arguments[0].elements.push(
                        //    checkNode.expression.arguments[0].elements[0]
                        //);
                    } else {
                        lastAssertLine = i;
                        lastAssert = checkNode;
                        body.splice(i, 0, checkNode);
                        ++i;
                    }
                }
            });
        }

        // Replace node with replacement nodes
        if (innerModifyNode.replaceNode.length > 0) {

            const leadingComments = node.leadingComments;
            for (let j = 0; j < innerModifyNode.replaceNode.length; ++j) {
                // TODO: This is a poor way to see if this is a check or an actual node
                if (innerModifyNode.replaceNode[j].checker) {
                    const checkItem = innerModifyNode.replaceNode[j];
                    const replaceNode = buildNodeFromCheck(checkItem, node.loc);
                    innerModifyNode.replaceNode[j] = replaceNode;
                    if (!replaceNode) {
                        innerModifyNode.replaceNode.splice(j, 1);
                        --j;
                    } else if (isCheckWhitelisted(checkItem, replaceNode, innerScope)) {
                        innerModifyNode.replaceNode.splice(j, 1);
                        --j;
                        // FIXME: We only want to remove checks, not the replaced variableDeclaration
                    }
                }
            }

            body[i].leadingComments = leadingComments;
            body.splice(i, 1, ...innerModifyNode.replaceNode);
            i += innerModifyNode.replaceNode.length - 1;
        }

        // Hoist nodes to the top
        if (innerModifyNode.hoistNodes.length > 0) {

            for (let j = 0; j < innerModifyNode.hoistNodes.length; ++j) {
                body.splice(0, 0, ...innerModifyNode.hoistNodes);
                i += innerModifyNode.hoistNodes.length;
            }
        }
    }

    state.modifyNode = modifyNode;
    state.scope = thisScope;
};

let gUid = 0;
const Assertion = (assertList, assertion, scope) => {
    // whitelist: array of subsequent inner scopes, each an array of assertions. Check whitelist from innermost -> outermost
    let assertionHash = "";
    // FIXME: Come up with a unique hash for the assertion (checker: args: [node, ...])
    //  - Could recursively traverse through node and hash that node, then mix w/ child node hashes
    //  - Can mark each node w/ a uid of that hash (if it isn't marked already); that way in the future if we come
    //  across a uid in a node, we can skip hashing that one
    //  - Then hash the check itself and mix with the node hash: "AAA_BBBBBBBBBBB"  AAA is checker hash, BBBBBBBBB is
    //  node hash
    //
    //  As we hit nodes add scopedNode and point that node to scopedNode. If scopedNode already exists then point node
    //  to that scopedNode. Use scopedNode for scopedWhitelist
    //
    //  OR we could do this during assertion build up time: pass a scope id to Assertion, and then add that scope to
    //  assertion object. Assertions are built linearly so we should go through scopes in order; however if we ever do
    //  parallelize this then we can order assertions before processing (in which case only this way would work). Then
    //  processing assertions we build whitelist as we process and store that whitelist in scope
    //
    //  scope: { parentScope: ..., scopeWhitelist: [] }

    assertion.scope = scope;

    // FIXME: This won't work, because
    //  Env.a = 1;
    //  Env.b = 2;  // Both of these are different nodes for Env
    //const getNodeId = (node) => {
    //    if (node.uid) return node.uid;
    //    node.uid = gUid++;
    //};

    //let checkerHash = 10 * (assertion.checker === HAS_KEY ? 1 : 2);

    assertList.push(assertion);
};


// CheckNode
// Recursively build checks through the node based off the type, and any children nodes it may have
//const CheckNode = (curNode, expectType, modifyNode, topLevel, scopeNode, scopedWhitelist) => {
const CheckNode = (curNode, expectType, state) => {


    //let codeStr = "";
    //if (curNode.start && curNode.end) {
    //    code.substr(curNode.start, curNode.end - curNode.start);
    //}
    let codeStr = code.substr(curNode.start, curNode.end - curNode.start);

    if (curNode.type === 'Program') {

        // Top-most node in the file
        checkNodeBody(curNode, state);

    } else if (curNode.type === 'ExpressionStatement') {

        // We're assuming ExpressionStatement is the entire expression, and cannot contain an
        // ExpressionStatement
        const computed = CheckNode(curNode.expression, null, state);
        return computed;
    } else if (curNode.type === 'MemberExpression') {

        // FIXME: Should confirm curNode.object is NOT a CallExpression (lint)
        let computed = CheckNode(curNode.object, OBJECT_TYPE, state);
        if (computed) {
            //console.error("FIXME: Computed node in MemberExpression");
            // eg.  extendClass(this).with(that)
            //      $(el).position
            return true;
        }

        // Property may be an object
        // I believe the only way this could happen is if its an array:   a.b.c[XXXXXX]
        if (curNode.property.type === 'MemberExpression') {
            // FIXME: We may want an IS_NOT_NULL check here
            // FIXME: may also want IS_NOT_COMPUTED   lint check here  eg.  a[c()],  a[b ? c() : d+1]
            computed = CheckNode(curNode.property, null, state);
        }

        if (computed) {
            //console.error("FIXME: Computed node in MemberExpression");
            return true;
        }


        if (expectType !== null) {

            // We'll need to handle checks on member expressions in 2 different ways:
            // FIXME: Better to have a check for is prop is an identifier or literal, or maybe
            // curNode.computed works?
            //   a.b   ===>  a.hasOwnProperty('b')
            //   a[b]  ===>  a.hasOwnProperty(b)    // computed
            const propComputed = curNode.computed;// curNode.property.type === 'MemberExpression';

            // FIXME: Can we get rid of the HAS_KEY check? Since we're about to check that prop is an object anyways, we
            // can piggyback off that check
            //let preCheck = { 
            //    checker: HAS_KEY,
            //    args: [curNode, curNode.object, curNode.property, propComputed]
            //};
            //Assertion(state.modifyNode.preCheck, preCheck, state.scope);

            preCheck = {
                checker: IS_TYPE,
                args: [curNode, OBJECT_TYPE]
            };
            Assertion(state.modifyNode.preCheck, preCheck, state.scope);
        }

        return false;

    } else if (curNode.type === 'CallExpression') {

        const safeCallObjectTypes = ['MemberExpression', 'ThisExpression', 'Identifier'];
        if (curNode.callee.object && safeCallObjectTypes.indexOf(curNode.callee.object.type) === -1) {

            // eg. CallExpression:  GetTile().LocalPos()
            console.error("FIXME: Unexpected call object type " + curNode.callee.object.type);
            return false;
        }

        // If curNode.callee is computed, we can't proceed any further
        const computed = CheckNode(curNode.callee, null, state);
        if (computed) {
            // eg. do(this).then(that);
            return true;
        }

        // In some cases we can't or don't want to bother checking the callee
        //  eg.    var a = ((() => return { a: 1 })())
        const safeFunctionCallees = ['Identifier', 'MemberExpression'];
        if (safeFunctionCallees.indexOf(curNode.callee.type) !== -1) {

            let preCheck = {
                checker: IS_TYPE,
                args: [curNode.callee, FUNCTION_TYPE]
            };
            Assertion(state.modifyNode.preCheck, preCheck, state.scope);
        }

        // Check arguments in call
        curNode.arguments.forEach((callArg) => {
            CheckNode(callArg, null, state);
        });

        return true;
    } else if (curNode.type === 'Identifier') {

        if (expectType !== null) {
            let preCheck = {
                checker: IS_TYPE,
                args: [curNode, expectType]
            };
            Assertion(state.modifyNode.preCheck, preCheck, state.scope);
        }

        return false;
    } else if (curNode.type === 'ObjectExpression') {

        curNode.properties.forEach((objProp) => {
            if (objProp.type === 'ObjectProperty') {
                CheckNode(objProp.value, null, state);
            } else if (objProp.type === 'ObjectMethod') {
                CheckNode(objProp.body, null, state);
            }
        });
    } else if (curNode.type === 'ArrayExpression') {

        curNode.elements.forEach((objElem) => {
            CheckNode(objElem, null, state);
        });
    } else if (curNode.type === 'AssignmentExpression') {

        CheckNode(curNode.left, null, state);
        CheckNode(curNode.right, null, state);
    } else if (curNode.type === 'ReturnStatement') {

        if (curNode.argument) {
            CheckNode(curNode.argument, null, state);
        }
    } else if (curNode.type === 'BlockStatement') {

        // NOTE: These is a top-level blockstatement within this scope
        checkNodeBody(curNode, state);

    } else if (curNode.type === 'ForStatement') {

        CheckNode(curNode.body, null, state);

    } else if (curNode.type === 'VariableDeclaration') {

        // Perform a specialized check for const:
        // We can't hoist const:
        //  const a = b.x;  ==>  const a; a = b.x;
        //
        //
        // We could instead split up declarators into individual VariableDeclarations
        //
        // const a = b,
        //       b = a.x;
        //
        // into
        //
        // const a = b;
        // const b = a.x;
        //
        // NOTE: Need to make curNode the LAST VariableDeclaration
        // NOTE: const and let are not hoisted under the hood, and are instead defined at execution point
        // TODO: Including var in this list, even though we'd prefer to hoist vars. For some reason hosting vars
        // doesn't work properly and results in assignments that don't have a semicolon
        if (curNode.kind === 'const' || curNode.kind === 'let' || curNode.kind === 'var') {
            const replaceNodes = [];
            const savedModifyNode = state.modifyNode;
            for (let i = 0; i < curNode.declarations.length; ++i) {
                const declarator = curNode.declarations[i];
                const declaratorModifyNode = new ModifyNode();
                state.modifyNode = declaratorModifyNode;

                if (declarator.init) {
                    CheckNode(declarator.init, null, state);
                }

                let declarationNode;
                if (i === curNode.declarations.length - 1) {
                    declarationNode = curNode;
                    declarationNode.declarations.splice(0, i);
                } else {
                    declarationNode = {
                        type: 'VariableDeclaration',
                        kind: curNode.kind,
                        declarations: [declarator]
                    };
                }

                declaratorModifyNode.preCheck.forEach((preCheck) => {
                    replaceNodes.push(preCheck);
                });

                declaratorModifyNode.replaceNode.forEach((replaceNode) => {
                    replaceNodes.push(replaceNode);
                });

                replaceNodes.push(declarationNode);
            }

            state.modifyNode = savedModifyNode;
            replaceNodes.forEach((replaceNode) => {
                state.modifyNode.replaceNode.push(replaceNode);
            });

            return;
        }

        // FIXME: Declarations is an array, but could have declarators that depend on the previous:
        // var a = obj,
        //     b = a.x;
        //
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/var
        // mdn says vars are auto hoisted to the top before execution. We could auto-hoist declarators in a block,
        // replace VariableDeclarator with a CHECK + Assignment

        const hoistedVariableDeclaration = {
            type: 'VariableDeclaration',
            kind: curNode.kind,
            declarations: []
        };

        state.modifyNode.hoistNodes.push(hoistedVariableDeclaration);

        // FIXME: modifyNode.hoistNodes, and modifyNode.replaceNode = 0
        curNode.declarations.forEach((declarator) => {
            // VariableDeclarator

            // Hoist the variable declaration
            hoistedVariableDeclaration.declarations.push({
                id: declarator.id,
                type: declarator.type,
                init: null
            });

            // Convert this to an assignment
            const assignmentNode = {
                type: 'AssignmentExpression',
                operator: '=',
                left: declarator.id,
                right: declarator.init,

                loc: {
                    filename: sourceFile,
                    start: {
                        line: curNode.loc.start.line,
                        column: curNode.loc.start.column
                    },
                    end: {
                        line: curNode.loc.end.line,
                        column: curNode.loc.end.column
                    }
                },
                //start: curNode.start,
                //end: curNode.end,
            };

            const savedModifyNode = state.modifyNode;
            const innerModifyNode = new ModifyNode();
            state.modifyNode = innerModifyNode;
            CheckNode(assignmentNode, null, state);

            state.modifyNode = savedModifyNode;
            innerModifyNode.preCheck.forEach((preCheck) => {
                state.modifyNode.preCheck.push(preCheck);
            });

            innerModifyNode.replaceNode.forEach((replaceNode) => {
                state.modifyNode.replaceNode.push(replaceNode);
            });

            state.modifyNode.replaceNode.push(assignmentNode);
        });

    } else if (curNode.type === 'ForInStatement') {

        CheckNode(curNode.right, OBJECT_TYPE, state);
        let forInBody = blockChildNode(curNode, 'body');
        CheckNode(forInBody, null, state);

    } else if (curNode.type === 'IfStatement') {

        CheckNode(curNode.test, null, state);

        // Consequent may not be a block statement, but if we want to add checks for statements inside then we'll
        // need a block statement node. The same goes for alternate node
        let consequentNode = blockChildNode(curNode, 'consequent');
        CheckNode(consequentNode, null, state);

        if (curNode.alternate) {
            let alternateNode = blockChildNode(curNode, 'alternate');
            CheckNode(alternateNode, null, state);
        }

    } else if (curNode.type === 'UnaryExpression') {

        CheckNode(curNode.argument, null, state);

    } else if (curNode.type === 'WhileStatement' || curNode.type === 'DoWhileStatement') {

        CheckNode(curNode.test, null, state);
        CheckNode(curNode.body, null, state);

    } else if (curNode.type === 'FunctionExpression') {

        CheckNode(curNode.body, null, state);

    } else if (curNode.type === 'ArrowFunctionExpression') {

        // If body wasn't a block statement then it may have the return shortcut too
        //   var x = () => 1;
        const isBlockStatement = curNode.body.type === 'BlockStatement';
        if (!isBlockStatement) {

            if (curNode.body.type !== 'ReturnStatement') {
                const returnStatement = {
                    type: 'ReturnStatement',
                    argument: curNode.body,

                    loc: {
                        filename: sourceFile,
                        start: {
                            line: curNode.body.loc.start.line,
                            column: curNode.body.loc.start.column
                        },
                        end: {
                            line: curNode.body.loc.end.line,
                            column: curNode.body.loc.end.column
                        }
                    }
                };

                curNode.body = returnStatement;
            }
        }

        let arrowBody = blockChildNode(curNode, 'body');
        CheckNode(arrowBody, null, state);

    } else if (curNode.type === 'ThrowStatement') {

        CheckNode(curNode.argument, null, state);

    } else if (curNode.type === 'TemplateLiteral') {

        curNode.expressions.forEach((template) => {
            CheckNode(template, null, state);
        });

    } else if (curNode.type === 'NewExpression') {

        curNode.arguments.forEach((callArg) => {
            CheckNode(callArg, null, state);
        });


    // ================================================
    // Special Treatment Expressions (whitelisted for now)
    } else if (curNode.type === 'LogicalExpression') {
    } else if (curNode.type === 'BinaryExpression') {
    // ================================================
    // Whitelisted Expressions
    } else if (curNode.type === 'DebuggerStatement') {
    } else if (curNode.type === 'SpreadElement') {
    } else if (curNode.type === 'BreakStatement') {
    } else if (curNode.type === 'ContinueStatement') {
    // ================================================
    // Safe Expressions
    } else if (curNode.type === 'UpdateExpression') {
    } else if (curNode.type === 'NumericLiteral') {
    } else if (curNode.type === 'StringLiteral') {
    } else if (curNode.type === 'BooleanLiteral') {
    } else if (curNode.type === 'NullLiteral') {
    } else if (curNode.type === 'ThisExpression') {
    // ================================================

    } else {
        console.error(`FIXME: Unhandled node type: ${curNode.type}`);
        for (let key in curNode) {
            if(['loc','start','end','type'].indexOf(key) >= 0) continue;
            console.error(`  node.${key}`);
        }
        return true;
    }
};

// Begin checking body
let parsed = null;

try {
    parsed = Parser.parse(code, { sourceFilename: sourceFile });
} catch (e) {
    console.error(e);
    process.exit(-1);
}

const SafeIdentifiers = ['Math', 'Env', 'Assert', '_', 'Array', 'Object', 'Promise', 'JSON', 'Err', 'String', 'Date', 'Number', 'Error', 'window', 'GLOBAL', 'define'];
const scope = { parentScope: null, whitelist: [] };
const state = { modifyNode: null, scope };
CheckNode(parsed.program, null, state);


// FIXME: Look into what settings we want here
const output = generate(parsed, {
    //retainLines: true, // NOTE: retainLines can cause multiple statements to merge to the same line, and causes issues
    //w/ /* SCRIPT INECT */ also being merged with other statements, so those statements get wiped
    //comments: false,
    //concise: true,
    //compact: true,
    sourceMaps: true
}, { sourceFile: code });

if (Settings.checkSyntax) {
    console.log(jshint);
    jshint(output.code, { esversion: 9 });
    console.log(jshint.data());
}


if (Settings.verbose) {
    let prettifiedCode = prettier.format(output.code, { parser: 'babel' })

    //console.log(parsed);
    //console.log(output);
    //console.log(output.code);
    console.log(prettifiedCode);
}

if (Settings.output) {
    let mapFile = Settings.output + '.map';
    const sourceMap = output.map;

    for(let i = 0; i < sourceMap.sources.length; ++i) {
        const srcPath = sourceMap.sources[i];
        const relPath = srcPath.substr(srcPath.lastIndexOf('/') + 1);
        sourceMap.sources[i] = relPath;
    }

    let mapRelFile = Settings.output.substr(Settings.output.lastIndexOf('/') + 1) + '.map';
    output.code += `\n//# sourceMappingURL=${mapRelFile}`;
    fs.writeFileSync(Settings.output, output.code);
    fs.writeFileSync(mapFile, JSON.stringify(sourceMap));
}
