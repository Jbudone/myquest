const Parser = require("@babel/parser");
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const fs = require('fs');

const prettier = require('prettier');


// TODO:
//  - Write CHECK statement -- cleanup
//  - Test in the wild -- prepro all
//  - Startup: Check js for all files + modified date, compare against counterpart in dist + modified date, do we need
//  to wait on rebuild?
//  * FIXME: CheckNode(... topNode === true) probably needs blockChildNode(node, 'prop') so that we create a body and
//  run checks inside of the body; confirm this is set for ALL topNodes, or inside CheckNode if topNode then assert its
//  a block
//  * FIXME: ConditionalExpression
//  * FIXME: ThisExpression
//  - Could place preChecks in BlockStatement: { CHECK(a); CHECK(a.b); CHECK(a.b.c); } a.b.c();
//  - Cleanup this file
//  - Lint for less safe code / unable to check code
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
//  - Check not null/undefined:
//      a[c.d] -- c.d should be defined, and probably a raw type (NumericLiteral, string)
//
//  - Check IsNull
//      - Arguments: this can be a problem if we create a member and then call it all in the same body of arguments
//           Func(initializeObj(a) && a.memberFunc())
//         We could probably lint this
//  - Profiler speeds for larger files
//  - Confirm source maps intact
//  - Could keep track of all available variables based off scope as we traverse through node. For any CHECK(..) points
//  we could also provide a list of variables in the scope, add it all to a string (for better perf) and pass that
//  string to an eval that allows us to fetch those variables and then pass to DEBUG or errorReport
//      CHECK(typeof a.b === "object", "a;x;f")
//          --> Assert(typeof a.b === "object") ? {} : { var scopedVars = eval(codeFromScopedVarsStr("a;x;f")); DEBUGGER(assertStatement, scopedVars); };
//              false? build variable fetch from str
//                  scopedVarsCode = "scopedVars.push(a, x, f)"
//                  eval(scopedVarsCode)
//                  DEBUGGER(assertStatement, scopedVars)

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
let code = "{ var f = () => { if(a.b.c.d) { { var a = c.d; } return b.x(); } else return 2; }; }";
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


const Settings = {
    output: null
};

const ModifyNode = function() {
    this.preCheck = [];
    this.replaceNode = [];
    this.hoistNodes = [];
};

let sourceFile = 'a.js';

// Process Server arguments
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--file") {
        sourceFile = process.argv[++i];
        code = fs.readFileSync(sourceFile, 'utf8');
    }

    if (arg == "--output") {
        Settings.output = process.argv[++i];
    }
}



var parsed = Parser.parse(code, { sourceFilename: sourceFile });

const OBJECT_TYPE = "OBJECT",
    FUNCTION_TYPE = "FUNCTION";

const HAS_KEY = "HAS_KEY",
    IS_TYPE = "IS_TYPE";

// Log(..)
//  - ExpressionStatement
//    - expression: Expression (CallExpression)
//      - arguments[]
//        - [0]: CallExpression
//          - arguments[0]
//          - callee: Identifier
//            - name: "a"
//      - callee: Identifier
//        - name: "Log"
//
// console.log(..)
//  - ExpressionStatement (console)
//    - expression: Expression  (CallExpression)
//      - arguments[]
//        - [0]: CallExpression
//          - arguments[0]
//          - callee: Identfier
//            - name: "a"
//      - callee: MemberExpression
//        - object: Identifier
//          - name: "console"
//        - property: Identifier
//          - name: "log"
//
//
// assert(..)
//  - ExpressionStatement (assert)
//    - expression: CallExpression
//      - arguments[]
//      - callee: Identifier
//        - name: "assert"
//    - parentPath: Program
//      - body[]
//        - [0]: ...
//        - ...




/*
traverse(parsed, {
  enter(path) {

      // We may have added this node. Traverse sucks and will hit it
    if (path.node.skip) {
        return;
    }

    if (path.isIdentifier({ name: "b" })) {
      //path.node.name = "c";
    } else if (path.isIdentifier({ name: "Log" })) {
        //debugger;
    } else if (path.isIdentifier({ name: "log" })) {
        //debugger;
    } else if (path.isIdentifier({ name: "assert" })) {
        //debugger;
    }

    // Replace console.log with Log
    if
    (
        path.type === "ExpressionStatement" &&
        path.node.expression.type === "CallExpression" &&
        path.node.expression.callee.type === "MemberExpression" &&
        path.node.expression.callee.object.type === "Identifier" &&
        path.node.expression.callee.object.name === "console" &&
        path.node.expression.callee.property.type === "Identifier" &&
        path.node.expression.callee.property.name === "log"
    )
    {
        // NOTE: arguments remain the same
        const expr = path.node.expression;
        expr.callee.type = "Identifier";
        expr.callee.name = "Log";
        delete expr.callee.object;
        delete expr.callee.property;
    }

    // Remove asserts
    if
    (
        path.type === "ExpressionStatement" &&
        path.node.expression.type === "CallExpression" &&
        path.node.expression.callee.type === "Identifier" &&
        path.node.expression.callee.name === "assert"
    )
    {
        const parent = path.parentPath;
        if (parent.type === "Program") {
            const idx = parent.node.body.indexOf(path.node);
            parent.node.body.splice(idx, 1);
        } else if (parent.type === "BlockStatement") {
            const idx = parent.node.body.indexOf(path.node);
            parent.node.body.splice(idx, 1);
        }
    }

    // Find all MemberExpressions and CallExpressions in a BlockStatement
    if
    (
        path.type === "BlockStatement"
    )
    {
    */
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
                            //console.log("==============================================");
                            //console.log(clonedNode);
                            //console.log("==============================================");
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

        // Flexibility in checker:
        //
        //   a.b.c()
        //
        // CHECK_SAFETY([
        //  { IS_OBJECT, a },
        //  { HAS_KEY, a, b },
        //  { IS_OBJECT, a.b },
        //  { HAS_KEY, a.b, c },
        //  { IS_FUNCTION, a.b.c }
        // ])
        //
        // Then we can turn on/off as needed. We can even turn on/off in particular files if we only need to debug
        // one, and can turn on/off on the fly, LOG instead of ASSERT, etc.

        // Check left -> right order
        //
        //    a.b.c.d.x()
        //
        // IsObject: a
        // HasKey: a("b")
        // IsObject: a.b
        // HasKey: a.b("c")
        // IsObject: a.b.c
        // HasKey: a.b.c("d")
        // IsObject: a.b.c.d
        // HasKey: a.b.c.d("x")
        // IsFunction: a.b.c.d.x
        //
        //     a.b[c.d]
        //
        // IsObject: a
        // HasKey: a("b")
        // IsObject: a.b
        // IsObject: c
        // HasKey: c("d")
        // 
        //
        // ExpressionStatement:
        //  - CallExpression?
        //    - _.isFunction on outcome (retrieved from everything below)
        //      CallExpression(callee : Expression, arguments[]: Expression)
        //
        //      Things that won't work:
        //        a.b[c ? d() : e].x()     Lint this
        //                                 We could also return true/false or something to indicate whether or not
        //                                 we can safely test below
        //        MemberExpression: Ternary calls
        //        MemberExpression Function calls: a.b().c   a[b()].c
        //        CallExpression: computed arguments
        //
        //      Flow
        //
        //        a.b[c.d].x()             1) IsFunction: - Recursively check below to build up our function object:
        //                                                  { IS_FUNCTION, XXXXXXX }
        //
        //                                                  XXXXXXX: We can simply re-use the `callee` expression
        //                                                  since this already contains everything we need
        //                                                - Also build array of things to check: c.d, a.b, a.b[c.d].x
        //                                                  These are MemberExpressions so we should be able to
        //                                                  naturally go through the same recursive call and build
        //                                                  ontop of array(s) of things to check
        //
        //  - MemberExpression?
        //    - MemberExpression(object: Expression, property: Expression: computed: Bool)
        //      computed: Determined at runtime: a[b]
        //
        //    Flow
        //
        //      a.b[c.d]                   1) IsObject: - { IS_OBJECT, XXXXXX }
        //
        //                                                XXXXXXXX: Re-use the `MemberExpression` as an argument to
        //                                                IsObject CallExpression
        //                                              - Check IsObject on object
        //                                              - Recursively check safety on property
        //
        //                                    
        //                                       a.b[c.d].x
        //
        //                                       MemberExpression
        //                                         object: MemberExpression
        //                                           object: MemberExpression
        //                                             object: Identity
        //                                               name: a
        //                                             property: Identity
        //                                               name: b
        //                                           property: MemberExpression
        //                                             object: Identity
        //                                               name: c
        //                                             property: Identity
        //                                               name: d
        //                                         property: Identity
        //                                           name: x
        //
        //
        //                                        -- Top level function can always ignore property, since that's
        //                                        allowed to be null
        //
        //                                        -- HasKey check can maybe be done on the same upper level, but
        //                                        BEFORE checking IsFunction or IsObject/etc.
        //                                        
        //                                           Check: MemberExpression(a.b[c.d].x)   expect? None (can be null)
        //                                            Check: MemberExpression(a.b[c.d])     expect: Object
        //                                             Check: MemberExpression(a.b)         expect: Object
        //                                              Check: Identity(a)                  expect: Object
        //                                              Check: HasKey ? a.b                 -- this is because we
        //                                                                                     expect Object from MemberExpression
        //                                             Check: MemberExpression(c.d)         expect? None (can be null)
        //                                              Check: Identity(c)                  expect: Object
        //                                              ----- skip HasKey check because it can be null
        //                                             HasKey ? a.b[c.d]                    -- expect: Object
        //
        //
        //                                        a.b.c.d[a].c()
        //
        //                                          Check: CallExpression(a.b.c.d[a].c)          expect: IsFunction
        //                                           Check: MemberExpression(a.b.c.d[a])         expect: Object
        //                                           HasKey ? a.b.c.d[a].c
        //
        //                RecursiveCheck(curNode): return { thingsToCheck[], computed ? }  -- computed if we do a
        //                function call OR conditionExpression (ternary) somewhere in here, so we can lint this part
        //
        //                  1) Call RecursiveCheck(curNode) to obtain array of things to check
        //                  2) append (at end) checks on this level: HasKey? IsFunction? IsObject?
        //                  3) Return revised array, computed
        //                      - IsFunction? safe is false, BUT if this is the top function then its fine
        //
        //
        //                  Outside; Build CHECK_SAFETY call
        //

        const CheckNode = (curNode, expectType, modifyNode, topLevel, scopeNode) => {

        //let codeStr = "";
        //if (curNode.start && curNode.end) {
        //    code.substr(curNode.start, curNode.end - curNode.start);
        //}
        let codeStr = code.substr(curNode.start, curNode.end - curNode.start);

        if (curNode.type === 'Program') {

            for (let i = 0; i < curNode.body.length; ++i) {
                const modifyNode = new ModifyNode();
                CheckNode(curNode.body[i], null, modifyNode, true, null);
            }

        } else if (curNode.type === 'ExpressionStatement') {
            //console.log(curNode);
            //console.log(code.substr(curNode.start, curNode.end - curNode.start));
            //console.log("Check: " + codeStr);

            // 
            //   MemberExpression:
            //     - CheckNode(`object`, expectType: Object)
            //     - isComputed? Early out
            //     - expectType !== null?
            //       - HasKey(`object`, `property`)  -- append to checkArr
            //       - IsType(node, expectType)      -- append to checkArr
            //
            //   CallExpression:
            //     - CheckNode(`callee`, expectType: Function)
            //     - isComputed: Early out
            //     - expectType ---- Assert this is null, otherwise this is computed
            //

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
                //checkArr.splice(0);
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
                //checkArr.splice(0);
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

            const safeCallObjectTypes = ['MemberExpression', 'Identifier'];
            if (curNode.callee.object && safeCallObjectTypes.indexOf(curNode.callee.object.type) === -1) {

                console.error("FIXME: Unexpected call object type " + curNode.callee.object.type);
                return false;
            }


            // FIXME: Should confirm curNode.callee is NOT a CallExpression (lint)
            const computed = CheckNode(curNode.callee, null, modifyNode, false, scopeNode);
            if (computed) {
                //checkArr.splice(0);
                // NOTE: do(this).then(that);
                //console.error("FIXME: Computed node in CallExpression");
                return true;
            }

            //if (expectType !== null) {
            //    checkArr = [];
            //    debugger;
            //    console.error("FIXME: CallExpression is expected to be a type!");
            //    process.exit();
            //}

            modifyNode.preCheck.push({
                checker: IS_TYPE,
                args: [curNode.callee, FUNCTION_TYPE]
            });

            curNode.arguments.forEach((callArg) => {
                let argComputed = CheckNode(callArg, null, modifyNode, false, scopeNode);
                // We don't care whether or not this argument is computed
            });

            //console.log(`  ${codeStr}: IS_TYPE: FUNCTION`);

            return true;
        } else if (curNode.type === 'Identifier') {
            // FIXME: Do we need a check here? Object/etc.?

            if (expectType !== null) {
                modifyNode.preCheck.push({
                    checker: IS_TYPE,
                    args: [curNode, expectType]
                });
                //console.log(`  ${codeStr}: IS_TYPE: OBJECT`);
            }

            return false;
        } else if (curNode.type === 'ThisExpression') {

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
            const body = curNode.body;
            for(let i = 0; i < body.length; ++i) {
            //curNode.body.forEach((node) => {

                // Begin checking this expression
                const node = body[i];
                const modifyNode = new ModifyNode();
                let prevLen = body.length;
                CheckNode(node, null, modifyNode, true, curNode);


                if (modifyNode.preCheck.length > 0) {


                    // Build array of checks from checkArr
                    modifyNode.preCheck.forEach((checkItem) => {
                        // { checker: IS_TYPE, args: [NODE, TYPE] }
                        // { checker: HAS_KEY, args: [NODE, NODE.OBJECT, NODE.PROPERTY]
                        const checkNode = buildNodeFromCheck(checkItem, node.loc);
                        body.splice(i, 0, checkNode);
                        ++i;
                    });
                }


                    //console.log(checkNodeExpr);
                    //console.log(JSON.stringify(checkNodeExpr));

                    /*
                    checkNodeExpr.start = node.start;
                    checkNodeExpr.end = node.end;
                    checkNodeExpr.loc = {
                        start: {
                            line: node.loc.start.line,
                            column: node.loc.start.column,
                        },
                        end: {
                            line: node.loc.end.line,
                            column: node.loc.end.column,
                        }
                    };
                    */


                if (modifyNode.replaceNode.length > 0) {

                    for (let j = 0; j < modifyNode.replaceNode.length; ++j) {
                        // TODO: This is a poor way to see if this is a check or an actual node
                        if (modifyNode.replaceNode[j].checker) {
                            modifyNode.replaceNode[j] = buildNodeFromCheck(modifyNode.replaceNode[j], node.loc);
                        }
                    }

                    body.splice(i, 1, ...modifyNode.replaceNode);
                    i += modifyNode.replaceNode.length - 1;
                }

                if (modifyNode.hoistNodes.length > 0) {

                    for (let j = 0; j < modifyNode.hoistNodes.length; ++j) {
                        body.splice(0, 0, ...modifyNode.hoistNodes);
                        i += modifyNode.hoistNodes.length;
                    }
                }

                //console.log('====================');
            };

        } else if (curNode.type === 'ForStatement') {

            CheckNode(curNode.body, null, modifyNode, false, scopeNode);

        } else if (curNode.type === 'VariableDeclaration') {

            // FIXME: Perform a specialized check for const:
            // We can't hoist const:
            //  const a = b.x;  ==>  const a; a = b.x;
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
            //
            // NOTE: const and let are not hoisted under the hood, and are instead defined at execution point
            if (curNode.kind === 'const' || curNode.kind === 'let') {

                // FIXME: This is really gross and breaks our assumptions about not inserting nodes in place of curNode
                //let nodeIndexInScope = 0;
                //for (nodeIndexInScope = 0; nodeIndexInScope < scopeNode.body.length; ++nodeIndexInScope) {
                //    if (scopeNode.body[nodeIndexInScope] === curNode) break;
                //}

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

                        //scopeNode.body.splice(nodeIndexInScope + i, 0, declarationNode);
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

                    loc: curNode.loc,
                    start: curNode.start,
                    end: curNode.end,
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
            // need a block statement node
            let consequentNode = blockChildNode(curNode, 'consequent');
            CheckNode(consequentNode, null, modifyNode, true, scopeNode);

            // FIXME: alternate node needs BlockStatement check too
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

            let arrowBody = blockChildNode(curNode, 'body');
            CheckNode(arrowBody, null, modifyNode, true, scopeNode);

        } else if (curNode.type === 'ThrowStatement') {

            CheckNode(curNode.argument, null, modifyNode, true, scopeNode);

        } else if (curNode.type === 'TemplateLiteral') {

            curNode.expressions.forEach((template) => {
                CheckNode(template, null, modifyNode, false, scopeNode);
            });

        } else if (curNode.type === 'BinaryExpression') {

            CheckNode(curNode.left, null, modifyNode, false, scopeNode); // FIXME: Is a variable
            CheckNode(curNode.right, null, modifyNode, false, scopeNode);

        } else if (curNode.type === 'NewExpression') {

            curNode.arguments.forEach((callArg) => {
                let argComputed = CheckNode(callArg, null, modifyNode, false, scopeNode);
                // We don't care whether or not this argument is computed
            });

        // ================================================
        // Whitelisted Expressions
        } else if (curNode.type === 'DebuggerStatement') {
        } else if (curNode.type === 'SpreadElement') {
        } else if (curNode.type === 'LogicalExpression') {
        } else if (curNode.type === 'BreakStatement') {
        } else if (curNode.type === 'ContinueStatement') {
        // ================================================
        // Safe Expressions
        } else if (curNode.type === 'UpdateExpression') {
        } else if (curNode.type === 'NumericLiteral') {
        } else if (curNode.type === 'StringLiteral') {
        } else if (curNode.type === 'BooleanLiteral') {
        } else if (curNode.type === 'NullLiteral') {
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
         //CheckNode(path.node, null, [], true, path.node);
         CheckNode(parsed.program, null, null, true, null);

/*
    } // if "path.type === BlockStatement"
}
});
*/

const output = generate(parsed, {
    retainLines: true,
    //comments: false,
    //concise: true,
    //compact: true,
    sourceMaps: true
}, { sourceFile: code });

//let prettifiedCode = prettier.format(output.code, { parser: 'babel' })

//console.log(parsed);
////console.log(output);
//console.log(output.code);
//console.log(prettifiedCode);


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
