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
//  - Source maps to hide CHECK statement
//  * FIXME:  if(a.b.c.d) return b.x();  // can't have CHECK() on b.x() because there's no { } scope within if statement
//  * FIXME: Condition checks   if(....)
//  * FIXME: VariableDeclarations  const a = b.c.d.e;
//  * Cleanup this file
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

//let code = "const a = function() {\nconst b = 1; const c = 3; c.call(); assert(Log(b) && 1 && true && b.yup()); a.b.c.thing(); b(); a[b.c].d; return b.that(); }; assert(Log(a) && console.log(b)); Log(a()); console.log(a()); a[b.c].d; var x = { b:1, c:[1,2] };";
//let code = "{ CALL({ check: 1, args: [{ node: a.b.c }] }); }";
let code = "{ a[b.c.d].e.f(); }";
//let code = "{ a[b.c] = 2; }";
//let code = "{ a.b(3); }";
//let code = " { a.b().c(); }";


// Process Server arguments
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--file") {
        const file = process.argv[++i];
        code = fs.readFileSync(file, 'utf8');
    }
}



var parsed = Parser.parse(code);

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

traverse(parsed, {
  enter(path) {
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
        const body = path.node.body;
        for (let i = 0; i < body.length; ++i) {
            const node = body[i];

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

            const CheckNode = (curNode, expectType, checkArr, topLevel) => {

                const codeStr = code.substr(curNode.start, curNode.end - curNode.start);
                if (curNode.type === 'ExpressionStatement') {
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

                    const computed = CheckNode(curNode.expression, null, checkArr, true);
                    return computed;
                } else if (curNode.type === 'MemberExpression') {

                    // FIXME: Should confirm curNode.object is NOT a CallExpression (lint)
                    let computed = CheckNode(curNode.object, OBJECT_TYPE, checkArr, false);
                    if (computed) {
                        //checkArr.splice(0);
                        console.error("FIXME: Computed node in MemberExpression");
                        return true;
                    }

                    // Property may be an object
                    // I believe the only way this could happen is if its an array:   a.b.c[XXXXXX]
                    if (curNode.property.type === 'MemberExpression') {
                        // FIXME: We may want an IS_NOT_NULL check here
                        // FIXME: may also want IS_NOT_COMPUTED   lint check here  eg.  a[c()],  a[b ? c() : d+1]
                        computed = CheckNode(curNode.property, null, checkArr, false);
                    }

                    if (computed) {
                        //checkArr.splice(0);
                        console.error("FIXME: Computed node in MemberExpression");
                        return true;
                    }


                    if (expectType !== null) {

                        checkArr.push({
                            checker: HAS_KEY,
                            args: [curNode, curNode.object, curNode.property]
                        });

                        //console.log(`  ${codeStr}: HAS_KEY`);

                        checkArr.push({
                            checker: IS_TYPE,
                            args: [curNode, OBJECT_TYPE]
                        });
                        //console.log(`  ${codeStr}: IS_TYPE: OBJECT`);
                    }

                    return false;

                } else if (curNode.type === 'CallExpression') {

                    // FIXME: Should confirm curNode.callee is NOT a CallExpression (lint)
                    const computed = CheckNode(curNode.callee, null, checkArr, false);
                    if (computed) {
                        //checkArr.splice(0);
                        console.error("FIXME: Computed node in CallExpression");
                        return true;
                    }

                    //if (expectType !== null) {
                    //    checkArr = [];
                    //    debugger;
                    //    console.error("FIXME: CallExpression is expected to be a type!");
                    //    process.exit();
                    //}

                    checkArr.push({
                        checker: IS_TYPE,
                        args: [curNode.callee, FUNCTION_TYPE]
                    });

                    curNode.arguments.forEach((callArg) => {
                        let argComputed = CheckNode(callArg, null, checkArr, false);
                        // We don't care whether or not this argument is computed
                    });

                    //console.log(`  ${codeStr}: IS_TYPE: FUNCTION`);
                    
                    return true;
                } else if (curNode.type === 'Identifier') {
                    // FIXME: Do we need a check here? Object/etc.?

                    if (expectType !== null) {
                        checkArr.push({
                            checker: IS_TYPE,
                            args: [curNode, expectType]
                        });
                        //console.log(`  ${codeStr}: IS_TYPE: OBJECT`);
                    }

                    return false;
                } else if (curNode.type === 'ObjectExpression') {

                    curNode.properties.forEach((objProp) => {
                        CheckNode(objProp.value, null, checkArr, false);
                    });
                } else if (curNode.type === 'ArrayExpression') {

                    curNode.elements.forEach((objElem) => {
                        CheckNode(objElem, null, checkArr, false);
                    });
                } else if (curNode.type === 'AssignmentExpression') {

                    CheckNode(curNode.left, null, checkArr, false);
                    CheckNode(curNode.right, null, checkArr, false);
                } else if (curNode.type === 'ReturnStatement') {

                    if (curNode.argument) {
                        CheckNode(curNode.argument, null, checkArr, false);
                    }
                } else {
                    console.error(`FIXME: Unhandled node type: ${curNode.type}`);
                    return true;
                }
            };

            // Begin checking this expression
            const checkArr = [];
            CheckNode(node, null, checkArr, true);
            if (checkArr.length === 0) continue; // Nothing to check here

            //console.log(checkArr);

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

                    if (clonedNode.property.type === 'MemberExpression') {
                        clonedNode.computed = true;
                    }
                } else if (node.type === 'CallExpression') {

                    clonedNode.type = node.type;
                    clonedNode.callee = cloneNode(node.callee);

                    clonedNode.arguments = [];
                    node.arguments.forEach((arg) => {
                        const clonedArg = cloneNode(arg);
                        clonedNode.arguments.push(clonedArg);
                    });
                } else {
                    console.error(`FIXME: Unexpected cloning type ${node.type}`);
                    return null;
                }

                return clonedNode;
            };

            // Build array of checks from checkArr
            checkArr.forEach((checkItem) => {
                // { checker: IS_TYPE, args: [NODE, TYPE] }
                // { checker: HAS_KEY, args: [NODE, NODE.OBJECT, NODE.PROPERTY]

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

                if (checkItem.checker === IS_TYPE) {
                    
                    // Type Comparison
                    checkItemNode.properties.push({
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
                    });

                    // Node to check
                    const clonedNode = cloneNode(checkItem.args[0]);
                    //console.log("==============================================");
                    //console.log(clonedNode);
                    //console.log("==============================================");
                    checkItemNode.properties.push({
                        type: 'ObjectProperty',
                        key: {
                            type: 'Identifier',
                            name: 'node'
                        },
                        value: clonedNode,
                        kind: 'init'
                    });

                } else if (checkItem.checker === HAS_KEY) {

                    // Object
                    const clonedObjNode = cloneNode(checkItem.args[1]);
                    checkItemNode.properties.push({
                        type: 'ObjectProperty',
                        key: {
                            type: 'Identifier',
                            name: 'object'
                        },
                        value: clonedObjNode,
                        kind: 'init'
                    });

                    // Property
                    const clonedObjProp = cloneNode(checkItem.args[2]);
                    checkItemNode.properties.push({
                        type: 'ObjectProperty',
                        key: {
                            type: 'Identifier',
                            name: 'property'
                        },
                        value: clonedObjProp,
                        kind: 'init'
                    });

                }

                checkNodeArr.push(checkItemNode);

            });

            //console.log(checkNodeExpr);
            //console.log(JSON.stringify(checkNodeExpr));

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
            body.splice(i, 0, checkNodeExpr);
            ++i;

            //console.log('====================');
        }
    }
  }
});

const output = generate(parsed, {
    retainLines: true
}, code);

//const prettifiedCode = prettier.format(output.code, { parser: 'babel' })

//console.log(parsed);
//console.log(output);
console.log(output.code);
//console.log(prettifiedCode);
