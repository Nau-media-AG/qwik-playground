/**
 * Vite plugin that auto-captures component-scope variables referenced inside
 * `useInlineTask(() => { ... })` calls.
 *
 * When the plugin sees a single-argument `useInlineTask` call whose callback
 * has **zero parameters**, it:
 *
 * 1. Parses the file with TypeScript to build an AST
 * 2. Walks up to the enclosing function scope (the component$ callback)
 * 3. Collects all variable declarations in that scope
 * 4. Finds free-variable references in the callback body
 * 5. Rewrites: adds a `__scope` parameter, replaces captured references with
 *    `__scope.varName`, and appends `{ var1, var2 }` as the second argument
 *
 * This runs with `enforce: 'pre'` so the transform happens before Qwik's
 * optimizer touches the file.
 */
import type { Plugin } from "vite";
import ts from "typescript";
import MagicString from "magic-string";

export function inlineTaskPlugin(): Plugin {
  return {
    name: "vite-plugin-inline-task",
    enforce: "pre",

    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id)) return;
      if (!code.includes("useInlineTask")) return;
      if (id.includes("node_modules")) return;

      const sourceFile = ts.createSourceFile(
        id,
        code,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        id.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const s = new MagicString(code);
      let transformed = false;

      function visit(node: ts.Node) {
        if (isAutoCapturableCall(node)) {
          if (transformCall(node, sourceFile, s)) {
            transformed = true;
          }
        }
        ts.forEachChild(node, visit);
      }

      ts.forEachChild(sourceFile, visit);

      if (!transformed) return;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Is this a `useInlineTask(fn)` call with exactly 1 arg, where fn has 0 params? */
function isAutoCapturableCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isIdentifier(node.expression)) return false;
  if (node.expression.text !== "useInlineTask") return false;
  if (node.arguments.length !== 1) return false;

  const fn = node.arguments[0];
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  if (fn.parameters.length !== 0) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

function transformCall(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  s: MagicString,
): boolean {
  const fn = call.arguments[0] as ts.ArrowFunction | ts.FunctionExpression;

  // 1. Find enclosing function (the component$ callback)
  const enclosing = findEnclosingFunction(call);
  if (!enclosing) return false;

  // 2. Collect variable names declared in the enclosing scope *before* this call
  const scopeNames = collectScopeDeclarations(
    enclosing,
    call.getStart(sourceFile),
  );
  if (scopeNames.size === 0) return false;

  // 3. Find free-variable references in the callback body
  const refs = findFreeVarRefs(fn, sourceFile, scopeNames);
  if (refs.length === 0) return false;

  // 4. Deduplicate capture names (preserve first-occurrence order)
  const captureNames: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!seen.has(ref.text)) {
      seen.add(ref.text);
      captureNames.push(ref.text);
    }
  }

  // 5. Insert `__scope` parameter between the empty parens
  const paramPos = fn.parameters.pos; // right after `(`
  const paramEnd = fn.parameters.end; // right before `)`
  if (paramPos < paramEnd) {
    s.overwrite(paramPos, paramEnd, "__scope");
  } else {
    s.appendLeft(paramPos, "__scope");
  }

  // 6. Replace each captured reference with `__scope.<name>`
  for (const ref of refs) {
    const start = ref.getStart(sourceFile);
    s.overwrite(start, ref.end, `__scope.${ref.text}`);
  }

  // 7. Append captures object as second argument
  const capturesStr = captureNames.join(", ");
  s.appendLeft(call.end - 1, `, { ${capturesStr} }`);

  return true;
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/** Walk up the AST to find the nearest enclosing function. */
function findEnclosingFunction(
  node: ts.Node,
): ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | null {
  let current = node.parent;
  while (current) {
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Collect every variable name declared at the top level of `scope`'s body,
 * but only declarations that appear **before** `beforePos` in the source.
 */
function collectScopeDeclarations(
  scope: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
  beforePos: number,
): Set<string> {
  const names = new Set<string>();
  const body = scope.body;
  if (!body || !ts.isBlock(body)) return names;

  for (const stmt of body.statements) {
    if (stmt.getStart() >= beforePos) break;

    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        collectBindingNames(decl.name, names);
      }
    }
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    }
  }

  return names;
}

/** Recursively extract names from a binding pattern (handles destructuring). */
function collectBindingNames(
  name: ts.BindingName,
  out: Set<string>,
): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
  } else if (ts.isObjectBindingPattern(name)) {
    for (const el of name.elements) {
      collectBindingNames(el.name, out);
    }
  } else if (ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (!ts.isOmittedExpression(el)) {
        collectBindingNames(el.name, out);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Free-variable analysis
// ---------------------------------------------------------------------------

interface Scope {
  names: Set<string>;
  parent: Scope | null;
}

function scopeHas(name: string, scope: Scope | null): boolean {
  while (scope) {
    if (scope.names.has(name)) return true;
    scope = scope.parent;
  }
  return false;
}

/**
 * Walk the function body and return every `Identifier` node that:
 *  - is a *variable reference* (not a property name, declaration, etc.)
 *  - is **not** declared locally inside `fn`
 *  - **is** declared in the component scope (`captureNames`)
 */
function findFreeVarRefs(
  fn: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  captureNames: Set<string>,
): ts.Identifier[] {
  const refs: ts.Identifier[] = [];

  // Top-level scope of the function (params + body declarations)
  const topScope: Scope = { names: new Set(), parent: null };
  for (const p of fn.parameters) {
    collectBindingNames(p.name, topScope.names);
  }

  function walk(node: ts.Node, scope: Scope): void {
    // ---- new nested scope for functions ----
    if (
      node !== fn &&
      (ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        ts.isFunctionDeclaration(node))
    ) {
      const child: Scope = { names: new Set(), parent: scope };
      if (ts.isFunctionDeclaration(node) && node.name) {
        scope.names.add(node.name.text); // function name is in *outer* scope
      }
      for (const p of (node as ts.FunctionLikeDeclaration).parameters) {
        collectBindingNames(p.name, child.names);
      }
      if (node.body) {
        ts.forEachChild(node.body, (c) => walk(c, child));
      }
      return;
    }

    // ---- collect declarations in current scope ----
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        collectBindingNames(decl.name, scope.names);
      }
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      collectBindingNames(node.variableDeclaration.name, scope.names);
    }

    // ---- check identifiers ----
    if (ts.isIdentifier(node) && node.parent) {
      if (
        isVariableReference(node) &&
        !scopeHas(node.text, scope) &&
        captureNames.has(node.text)
      ) {
        refs.push(node);
      }
    }

    ts.forEachChild(node, (c) => walk(c, scope));
  }

  if (fn.body) {
    if (ts.isBlock(fn.body)) {
      ts.forEachChild(fn.body, (c) => walk(c, topScope));
    } else {
      // expression body: () => expr
      walk(fn.body, topScope);
    }
  }

  return refs;
}

/**
 * Returns `true` when the identifier is used as a *variable reference*
 * rather than as a property name, declaration name, label, etc.
 */
function isVariableReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;

  // obj.prop  — prop is not a reference
  if (ts.isPropertyAccessExpression(parent) && parent.name === node)
    return false;

  // const x = …
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;

  // function x() {}
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;

  // class X {}
  if (ts.isClassDeclaration(parent) && parent.name === node) return false;

  // (x) => …
  if (ts.isParameter(parent) && parent.name === node) return false;

  // { key: value }  — key is not a reference (but shorthand { key } IS)
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;

  // method name in class/object
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;

  // property signature in a type
  if (ts.isPropertySignature(parent) && parent.name === node) return false;

  // import { x } from '…'
  if (ts.isImportSpecifier(parent)) return false;

  // export { x }
  if (ts.isExportSpecifier(parent)) return false;

  // label: …   /   break label;   /   continue label;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  if (ts.isBreakStatement(parent) && parent.label === node) return false;
  if (ts.isContinueStatement(parent) && parent.label === node) return false;

  // const { prop: local } = …  — prop is not a reference
  if (ts.isBindingElement(parent) && parent.propertyName === node)
    return false;

  return true;
}
