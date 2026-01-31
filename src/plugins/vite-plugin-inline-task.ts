/**
 * Vite plugin that transforms `useInlineTask(() => { ... })` calls:
 *
 * 1. **Auto-capture** — Detects component-scope variables referenced in the
 *    callback body, rewrites them to `__scope.varName`, and appends a captures
 *    object as the second argument.
 *
 * 2. **Auto-inject** — Converts the void call into a variable assignment and
 *    appends the resulting `<script>` element to the component's JSX return.
 *
 * This eliminates the need for manual captures, JSX placement, context, or
 * a provider component.
 *
 * Runs with `enforce: 'pre'` so the transform happens before Qwik's optimizer.
 */
import type { Plugin } from "vite";
import ts from "typescript";
import MagicString from "magic-string";

export function inlineTaskPlugin(): Plugin {
  return {
    name: "vite-plugin-inline-task",
    enforce: "pre",

    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return;
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
      let counter = 0;

      // Group inline-task variable names by their enclosing function so we can
      // inject them all into the correct JSX return.
      const groups = new Map<
        ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
        string[]
      >();

      function visit(node: ts.Node) {
        if (isUseInlineTaskCall(node)) {
          const call = node as ts.CallExpression;
          const fn = call.arguments[0] as
            | ts.ArrowFunction
            | ts.FunctionExpression;

          const enclosing = findEnclosingFunction(call);
          if (!enclosing) {
            ts.forEachChild(node, visit);
            return;
          }

          // --- auto-capture (only for 0-param, single-arg calls) ---
          if (call.arguments.length === 1 && fn.parameters.length === 0) {
            applyAutoCapture(call, fn, enclosing, sourceFile, s);
          }

          // --- auto-inject: convert expression statement → variable decl ---
          if (ts.isExpressionStatement(call.parent)) {
            const varName = `__it_${counter++}`;
            s.appendLeft(
              call.parent.getStart(sourceFile),
              `const ${varName} = `,
            );

            if (!groups.has(enclosing)) groups.set(enclosing, []);
            groups.get(enclosing)!.push(varName);
          }

          transformed = true;
        }

        ts.forEachChild(node, visit);
      }

      ts.forEachChild(sourceFile, visit);

      // --- inject collected scripts into each enclosing function's return ---
      for (const [enclosingFn, varNames] of groups) {
        injectIntoReturn(enclosingFn, varNames, sourceFile, s);
      }

      if (!transformed) return;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Matches any `useInlineTask(fn)` call where `fn` is an arrow / function
 * expression. Works for both 1-arg (auto-capture) and 2-arg (manual) calls.
 */
function isUseInlineTaskCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isIdentifier(node.expression)) return false;
  if (node.expression.text !== "useInlineTask") return false;
  if (node.arguments.length < 1) return false;

  const fn = node.arguments[0];
  return ts.isArrowFunction(fn) || ts.isFunctionExpression(fn);
}

// ---------------------------------------------------------------------------
// Auto-capture
// ---------------------------------------------------------------------------

function applyAutoCapture(
  call: ts.CallExpression,
  fn: ts.ArrowFunction | ts.FunctionExpression,
  enclosing:
    | ts.ArrowFunction
    | ts.FunctionExpression
    | ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  s: MagicString,
): void {
  const scopeNames = collectScopeDeclarations(
    enclosing,
    call.getStart(sourceFile),
    sourceFile,
  );
  if (scopeNames.size === 0) return;

  const refs = findFreeVarRefs(fn, sourceFile, scopeNames);
  if (refs.length === 0) return;

  // Deduplicate capture names (preserve first-occurrence order)
  const captureNames: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!seen.has(ref.text)) {
      seen.add(ref.text);
      captureNames.push(ref.text);
    }
  }

  // Insert `__scope` parameter between the empty parens
  const paramPos = fn.parameters.pos;
  const paramEnd = fn.parameters.end;
  if (paramPos < paramEnd) {
    s.overwrite(paramPos, paramEnd, "__scope");
  } else {
    s.appendLeft(paramPos, "__scope");
  }

  // Replace each captured reference with `__scope.<name>`
  for (const ref of refs) {
    const start = ref.getStart(sourceFile);
    s.overwrite(start, ref.end, `__scope.${ref.text}`);
  }

  // Append captures object as second argument
  const capturesStr = captureNames.join(", ");
  s.appendLeft(call.end - 1, `, { ${capturesStr} }`);
}

// ---------------------------------------------------------------------------
// Auto-inject into JSX return
// ---------------------------------------------------------------------------

/**
 * Finds the return statement(s) of `fn` and appends `{__it_0}{__it_1}...`
 * to the returned JSX. Handles:
 * - Block bodies with explicit `return ...`
 * - Expression arrow bodies `() => <JSX />`
 * - Existing JSX fragments (inserts before closing `</>`)
 * - Non-fragment JSX (wraps in a new fragment)
 */
function injectIntoReturn(
  fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
  varNames: string[],
  sourceFile: ts.SourceFile,
  s: MagicString,
): void {
  const injection = varNames.map((v) => `{${v}}`).join("");

  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
    // Expression body:  () => <JSX />
    injectAroundExpr(fn.body, injection, sourceFile, s);
    return;
  }

  // Block body — find all return statements (skip nested functions)
  const returns = findReturnStatements(fn);
  for (const ret of returns) {
    if (ret.expression) {
      // Unwrap parenthesized expressions to reach the JSX
      let expr: ts.Expression = ret.expression;
      while (ts.isParenthesizedExpression(expr)) {
        expr = expr.expression;
      }
      injectAroundExpr(expr, injection, sourceFile, s);
    }
  }
}

function injectAroundExpr(
  expr: ts.Expression | ts.Node,
  injection: string,
  sourceFile: ts.SourceFile,
  s: MagicString,
): void {
  if (ts.isJsxFragment(expr)) {
    // Already a fragment — insert before the closing </>
    const closingStart = expr.closingFragment.getStart(sourceFile);
    s.appendLeft(closingStart, injection);
  } else {
    // Wrap in a new fragment
    s.appendLeft(expr.getStart(sourceFile), "<>");
    s.appendLeft(expr.end, `${injection}</>`);
  }
}

/** Collect return statements at the top level of a function body (not in nested functions). */
function findReturnStatements(
  fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
): ts.ReturnStatement[] {
  const results: ts.ReturnStatement[] = [];
  if (!fn.body || !ts.isBlock(fn.body)) return results;

  function walk(node: ts.Node) {
    // Don't enter nested function scopes
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      results.push(node);
    }
    ts.forEachChild(node, walk);
  }

  ts.forEachChild(fn.body, walk);
  return results;
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
  sourceFile?: ts.SourceFile,
): Set<string> {
  const names = new Set<string>();

  // Include the enclosing function's own parameters
  for (const param of scope.parameters) {
    collectBindingNames(param.name, names);
  }

  const body = scope.body;
  if (!body || !ts.isBlock(body)) return names;

  for (const stmt of body.statements) {
    if (stmt.getStart(sourceFile) >= beforePos) break;

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
function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
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
        scope.names.add(node.name.text);
      }
      for (const p of (node as ts.FunctionLikeDeclaration).parameters) {
        collectBindingNames(p.name, child.names);
      }
      if (node.body) {
        ts.forEachChild(node.body, (c) => walk(c, child));
      }
      return;
    }

    // ---- new scope for for-loops (loop variable is scoped to the loop) ----
    if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node)
    ) {
      const loopScope: Scope = { names: new Set(), parent: scope };
      const init = node.initializer;
      if (init && ts.isVariableDeclarationList(init)) {
        for (const decl of init.declarations) {
          collectBindingNames(decl.name, loopScope.names);
        }
      }
      ts.forEachChild(node, (c) => walk(c, loopScope));
      return;
    }

    // ---- new block scope for non-function blocks ----
    if (ts.isBlock(node)) {
      const blockScope: Scope = { names: new Set(), parent: scope };
      ts.forEachChild(node, (c) => walk(c, blockScope));
      return;
    }

    // ---- new scope for catch clause ----
    if (ts.isCatchClause(node)) {
      const catchScope: Scope = { names: new Set(), parent: scope };
      if (node.variableDeclaration) {
        collectBindingNames(node.variableDeclaration.name, catchScope.names);
      }
      ts.forEachChild(node, (c) => walk(c, catchScope));
      return;
    }

    // ---- collect declarations in current scope ----
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        collectBindingNames(decl.name, scope.names);
      }
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

  if (ts.isPropertyAccessExpression(parent) && parent.name === node)
    return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isClassDeclaration(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent)) return false;
  if (ts.isExportSpecifier(parent)) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  if (ts.isBreakStatement(parent) && parent.label === node) return false;
  if (ts.isContinueStatement(parent) && parent.label === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node)
    return false;

  // Identifiers inside type annotations / type references are not value references
  if (ts.isTypeNode(parent)) return false;

  return true;
}
