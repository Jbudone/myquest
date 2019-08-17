const Parser = require("@babel/parser");
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const fs = require('fs');

const prettier = require('prettier');


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
//      We could inline with the expression:
//          (_.isObject(notAnObj) && (CHECK(notAnObj) && CHECK(notAnObj.a) && CHECK(notAnObj.a.b) &&
//          CHECK(notAnObj.a.b.c) && CHECK(notAnObj.a.b.c.d) && notAnObj.a.b.c.d()))
//  * FIXME: ConditionalExpression
//  - Smoke tests would be nice for this. Parse & CHECK code that's supposed to fail at parts, and will only crash if
//  preprocessed incorrectly
//  - Lint for less safe code / unable to check code
//  - More accurate copying of loc for sourcemaps
//  * FIXME: Dynamic whitelist on type checking (list of known values as we traverse through nodes)
//     HAS_KEY unecessary if we're about to test that key: IS_OBJECT(a), HAS_KEY(a, 'b'), IS_OBJECT(a.b)
//  * Inline checks: CHECK( (typeof a === 'object') && ('b' in a) && (typeof a.b === 'object') )
//  - Check not null/undefined:
//      a[c.d] -- c.d should be defined, and probably a raw type (NumericLiteral, string)
//
//
//  - How would we prevent checks if we've already done a manual check?
//      if (a && a.b && a.b.c) { ... }
//  - How do we carry over checks later?
//      a.b.c.d = 1 // checks a.b.c
//      a.b.c.e = 2 // re-checks a.b.c
//
//      Would also need to protect against mutations in-between
//      a.b.c.d = 1
//      Transform(a)
//      a.b.c.e = 2
//
//
//      Maybe we can keep track of type intrinsic while parsing, and then when a call is made we kill nuke any
//      intrinsics that we can't trust anymore. Then when we want to CHECK we first see if the check is already safe
//
//      Would need this to also be safe with block scope (conditions/etc.)
//
//      How could we carry over checks / store global intrinics?  CHECK(IS_FUNCTION, assert), CHECK(IS_OBJECT, Env)
//
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
let code = "{ const fxmgrPath = Env.isBot ? 'test/pseudofxmgr' : 'client/fxmgr',\n\
    rendererPath = Env.isBot ? 'test/pseudoRenderer' : 'client/renderer',\n\
    uiPath = Env.isBot ? 'test/pseudoUI' : 'client/ui'; }";


const Settings = {
    output: null,
    verbose: true
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

    const checkNodeArr = [];
    const checkNodeExpr = {
        type: 'ExpressionStatement',
        expression: {
            type: 'CallExpression',
            callee: {
                type: 'Identifier',
                name: 'CHECK'
            },
            arguments: [
                {
                    type: 'ArrayExpression',
                    elements: checkNodeArr
                }
            ]
        }
    };

    setNodeLoc(checkNodeExpr);

    const checkItemNode = {
        type: 'ObjectExpression',
        properties: [
            {
                type: 'ObjectProperty',
                key: {
                    type: 'Identifier',
                    name: 'checker'
                },
                value: {
                    // FIXME: We'll change this to numeric literal later
                    //type: 'NumericLiteral',
                    //value: 1

                    type: 'Identifier',
                    name: checkItem.checker
                },
                kind: 'init'
            }
        ]
    };

    setNodeLoc(checkItemNode);

    if (checkItem.checker === IS_TYPE) {

        // Whitelisted types for checking
        const whitelistTypeCheck = ['MemberExpression', 'Identifier'];
        if (whitelistTypeCheck.indexOf(checkItem.args[0].type) === -1) {
            return null;
        }


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

        // Node to check
        const clonedNode = cloneNode(checkItem.args[0]);
        const objNode = {
            type: 'ObjectProperty',
            key: {
                type: 'Identifier',
                name: 'node'
            },
            value: clonedNode,
            kind: 'init'
        };

        setNodeLoc(objNode);
        checkItemNode.properties.push(objNode);

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
        const objInitNode = {
            type: 'ObjectProperty',
            key: {
                type: 'Identifier',
                name: 'object'
            },
            value: clonedObjNode,
            kind: 'init'
        };
        setNodeLoc(objInitNode);
        checkItemNode.properties.push(objInitNode);

        // Property
        const objPropNode = {
            type: 'ObjectProperty',
            key: {
                type: 'Identifier',
                name: 'property'
            },
            value: propNode,
            kind: 'init'
        };
        setNodeLoc(objPropNode);
        checkItemNode.properties.push(objPropNode);

    }

    checkNodeArr.push(checkItemNode);

    return checkNodeExpr;
};


// CheckNodeBody
// Check all elements in the body of the node, and handle any preChecks, replacements or hoisting returned from checks
const checkNodeBody = (node) => {
    const body = node.body;
    for(let i = 0; i < body.length; ++i) {

        // Begin checking this expression
        const node = body[i];
        const modifyNode = new ModifyNode();
        let prevLen = body.length;
        CheckNode(node, null, modifyNode, true, node);

        // Prepend all preChecks before node
        if (modifyNode.preCheck.length > 0) {
            modifyNode.preCheck.forEach((checkItem) => {
                // { checker: IS_TYPE, args: [NODE, TYPE] }
                // { checker: HAS_KEY, args: [NODE, NODE.OBJECT, NODE.PROPERTY] }
                const checkNode = buildNodeFromCheck(checkItem, node.loc);
                if (checkNode) {
                    body.splice(i, 0, checkNode);
                    ++i;
                }
            });
        }

        // Replace node with replacement nodes
        if (modifyNode.replaceNode.length > 0) {

            const leadingComments = node.leadingComments;
            for (let j = 0; j < modifyNode.replaceNode.length; ++j) {
                // TODO: This is a poor way to see if this is a check or an actual node
                if (modifyNode.replaceNode[j].checker) {
                    const replaceNode = buildNodeFromCheck(modifyNode.replaceNode[j], node.loc);
                    modifyNode.replaceNode[j] = replaceNode;
                    if (!replaceNode) {
                        modifyNode.replaceNode.splice(j, 1);
                        --j;
                    }
                }
            }

            body[i].leadingComments = leadingComments;
            body.splice(i, 1, ...modifyNode.replaceNode);
            i += modifyNode.replaceNode.length - 1;
        }

        // Hoist nodes to the top
        if (modifyNode.hoistNodes.length > 0) {

            for (let j = 0; j < modifyNode.hoistNodes.length; ++j) {
                body.splice(0, 0, ...modifyNode.hoistNodes);
                i += modifyNode.hoistNodes.length;
            }
        }
    };
};


// CheckNode
// Recursively build checks through the node based off the type, and any children nodes it may have
const CheckNode = (curNode, expectType, modifyNode, topLevel, scopeNode) => {

    //let codeStr = "";
    //if (curNode.start && curNode.end) {
    //    code.substr(curNode.start, curNode.end - curNode.start);
    //}
    let codeStr = code.substr(curNode.start, curNode.end - curNode.start);

    if (curNode.type === 'Program') {

        // Top-most node in the file
        checkNodeBody(curNode);

    } else if (curNode.type === 'ExpressionStatement') {

        // We're assuming ExpressionStatement is the entire expression, and cannot contain an
        // ExpressionStatement
        if (!topLevel) {
            console.error("Unexpected: ExpressionStatement inside of an ExpressionStatement");
            process.exit();
        }

        const computed = CheckNode(curNode.expression, null, modifyNode, true, scopeNode);
        return computed;
    } else if (curNode.type === 'MemberExpression') {

        // FIXME: Should confirm curNode.object is NOT a CallExpression (lint)
        let computed = CheckNode(curNode.object, OBJECT_TYPE, modifyNode, false, scopeNode);
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
            computed = CheckNode(curNode.property, null, modifyNode, false, scopeNode);
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
            modifyNode.preCheck.push({
                checker: HAS_KEY,
                args: [curNode, curNode.object, curNode.property, propComputed]
            });

            //console.log(`  ${codeStr}: HAS_KEY`);

            modifyNode.preCheck.push({
                checker: IS_TYPE,
                args: [curNode, OBJECT_TYPE]
            });
            //console.log(`  ${codeStr}: IS_TYPE: OBJECT`);
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
        const computed = CheckNode(curNode.callee, null, modifyNode, false, scopeNode);
        if (computed) {
            // eg. do(this).then(that);
            return true;
        }

        // In some cases we can't or don't want to bother checking the callee
        //  eg.    var a = ((() => return { a: 1 })())
        const safeFunctionCallees = ['Identifier', 'MemberExpression'];
        if (safeFunctionCallees.indexOf(curNode.callee.type) !== -1) {
            modifyNode.preCheck.push({
                checker: IS_TYPE,
                args: [curNode.callee, FUNCTION_TYPE]
            });
        }

        // Check arguments in call
        curNode.arguments.forEach((callArg) => {
            CheckNode(callArg, null, modifyNode, false, scopeNode);
        });

        return true;
    } else if (curNode.type === 'Identifier') {

        if (expectType !== null) {
            modifyNode.preCheck.push({
                checker: IS_TYPE,
                args: [curNode, expectType]
            });
        }

        return false;
    } else if (curNode.type === 'ObjectExpression') {

        curNode.properties.forEach((objProp) => {
            if (objProp.type === 'ObjectProperty') {
                CheckNode(objProp.value, null, modifyNode, false, scopeNode);
            } else if (objProp.type === 'ObjectMethod') {
                CheckNode(objProp.body, null, modifyNode, true, scopeNode);
            }
        });
    } else if (curNode.type === 'ArrayExpression') {

        curNode.elements.forEach((objElem) => {
            CheckNode(objElem, null, modifyNode, false, scopeNode);
        });
    } else if (curNode.type === 'AssignmentExpression') {

        CheckNode(curNode.left, null, modifyNode, false, scopeNode);
        CheckNode(curNode.right, null, modifyNode, false, scopeNode);
    } else if (curNode.type === 'ReturnStatement') {

        if (curNode.argument) {
            CheckNode(curNode.argument, null, modifyNode, false, scopeNode);
        }
    } else if (curNode.type === 'BlockStatement') {

        // NOTE: These is a top-level blockstatement within this scope
        checkNodeBody(curNode);

    } else if (curNode.type === 'ForStatement') {

        CheckNode(curNode.body, null, modifyNode, false, scopeNode);

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
            for (let i = 0; i < curNode.declarations.length; ++i) {
                const declarator = curNode.declarations[i];
                const declaratorModifyNode = new ModifyNode();

                if (declarator.init) {
                    CheckNode(declarator.init, null, declaratorModifyNode, false, scopeNode);
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

            replaceNodes.forEach((replaceNode) => {
                modifyNode.replaceNode.push(replaceNode);
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

        modifyNode.hoistNodes.push(hoistedVariableDeclaration);

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

            const innerModifyNode = new ModifyNode();
            CheckNode(assignmentNode, null, innerModifyNode, true, null);

            innerModifyNode.preCheck.forEach((preCheck) => {
                modifyNode.preCheck.push(preCheck);
            });

            innerModifyNode.replaceNode.forEach((replaceNode) => {
                modifyNode.replaceNode.push(replaceNode);
            });

            modifyNode.replaceNode.push(assignmentNode);
        });

    } else if (curNode.type === 'ForInStatement') {

        CheckNode(curNode.right, OBJECT_TYPE, modifyNode, false, scopeNode);
        let forInBody = blockChildNode(curNode, 'body');
        CheckNode(forInBody, null, modifyNode, true, scopeNode);

    } else if (curNode.type === 'IfStatement') {

        CheckNode(curNode.test, null, modifyNode, false, scopeNode);

        // Consequent may not be a block statement, but if we want to add checks for statements inside then we'll
        // need a block statement node. The same goes for alternate node
        let consequentNode = blockChildNode(curNode, 'consequent');
        CheckNode(consequentNode, null, modifyNode, true, scopeNode);

        if (curNode.alternate) {
            let alternateNode = blockChildNode(curNode, 'alternate');
            CheckNode(alternateNode, null, modifyNode, true, scopeNode);
        }

    } else if (curNode.type === 'UnaryExpression') {

        CheckNode(curNode.argument, null, modifyNode, false, scopeNode);

    } else if (curNode.type === 'WhileStatement' || curNode.type === 'DoWhileStatement') {

        CheckNode(curNode.test, null, modifyNode, false, scopeNode);
        CheckNode(curNode.body, null, modifyNode, false, scopeNode);

    } else if (curNode.type === 'FunctionExpression') {

        CheckNode(curNode.body, null, modifyNode, true, scopeNode);

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
        CheckNode(arrowBody, null, modifyNode, true, scopeNode);

    } else if (curNode.type === 'ThrowStatement') {

        CheckNode(curNode.argument, null, modifyNode, true, scopeNode);

    } else if (curNode.type === 'TemplateLiteral') {

        curNode.expressions.forEach((template) => {
            CheckNode(template, null, modifyNode, false, scopeNode);
        });

    } else if (curNode.type === 'NewExpression') {

        curNode.arguments.forEach((callArg) => {
            CheckNode(callArg, null, modifyNode, false, scopeNode);
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
const parsed = Parser.parse(code, { sourceFilename: sourceFile });
CheckNode(parsed.program, null, null, true, null);


// FIXME: Look into what settings we want here
const output = generate(parsed, {
    //retainLines: true, // NOTE: retainLines can cause multiple statements to merge to the same line, and causes issues
    //w/ /* SCRIPT INECT */ also being merged with other statements, so those statements get wiped
    //comments: false,
    //concise: true,
    //compact: true,
    sourceMaps: true
}, { sourceFile: code });


if (Settings.verbose) {
    let prettifiedCode = prettier.format(output.code, { parser: 'babel' })

    console.log(parsed);
    //console.log(output);
    console.log(output.code);
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
