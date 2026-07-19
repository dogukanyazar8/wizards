import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const API_V1_DIR = fileURLToPath(new URL(".", import.meta.url));

const UNAUTHENTICATED_ROUTE_PATHS = new Set([
  "app/version",
  "desktop/download",
  "mobile/auth/exchange",
  "mobile/auth/forgot-password",
  "mobile/auth/login",
  "mobile/auth/refresh",
  "mobile/auth/register",
  "mobile/auth/revoke",
  "mobile/auth/verification-email",
]);

const BODYLESS_MUTATING_METHOD_PATHS = new Set([
  "POST admin/notification-campaigns/[campaignId]/send",
  "POST auth/desktop-session",
  "DELETE channels/[channelId]",
  "DELETE channels/[channelId]/messages",
  "DELETE channels/[channelId]/messages/[messageId]/pin",
  "POST channels/[channelId]/messages/[messageId]/pin",
  "PATCH channels/[channelId]/read",
  "DELETE dm/[conversationId]",
  "PATCH dm/[conversationId]/read",
  "PATCH dm/[conversationId]/unread",
  "DELETE friends/[userId]",
  "DELETE friends/block/[userId]",
  "POST friends/block/[userId]",
  "DELETE friends/request/[id]",
  "DELETE mobile/channels/[channelId]/history",
  "DELETE mobile/channels/[channelId]/messages/[messageId]",
  "DELETE mobile/dm/[conversationId]/messages/[messageId]",
  "PATCH mobile/dm/[conversationId]/read",
  "DELETE mobile/friends/[userId]",
  "DELETE mobile/friends/blocks/[userId]",
  "DELETE mobile/notifications",
  "PATCH mobile/channels/[channelId]/read",
  "PATCH mobile/notifications/[id]/read",
  "PATCH mobile/notifications/read-all",
  "DELETE mobile/servers/[serverId]/categories/[categoryId]",
  "DELETE mobile/servers/[serverId]/channels/[channelId]",
  "DELETE mobile/servers/[serverId]/invites/[inviteId]",
  "DELETE mobile/servers/[serverId]/members/[memberId]",
  "DELETE mobile/servers/[serverId]/roles/[roleId]",
  "POST mobile/account/two-factor/setup",
  "POST mobile/friends/requests/[id]/accept",
  "POST mobile/friends/requests/[id]/reject",
  "PUT mobile/friends/blocks/[userId]",
  "PATCH notifications/[id]/read",
  "DELETE notifications/clear",
  "PATCH notifications/read-all",
  "DELETE servers/[serverId]/invites/[inviteId]",
  "DELETE servers/[serverId]/categories/[categoryId]",
  "DELETE servers/[serverId]/members/[memberId]",
  "DELETE servers/[serverId]/members/me",
  "DELETE servers/[serverId]/roles/[roleId]",
]);

const AUTH_GUARD_CALL_PATTERN =
  /\b(?:requireApiUserId|requireMobileApiUserId|requireMobileApiSession|requireAdminUser)\s*\(/;
const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const RAW_REQUEST_BODY_CALL_PATTERN = /\b(?:request|req)\.(?:json|text|formData)\s*\(/;

const EXPECTED_RATE_LIMIT_ACTIONS = [
  {
    action: "server:detail",
    method: "GET",
    routePath: "servers/[serverId]",
  },
  {
    action: "server:update",
    method: "PATCH",
    routePath: "servers/[serverId]",
  },
  {
    action: "server:delete",
    method: "DELETE",
    routePath: "servers/[serverId]",
  },
  {
    action: "mobile:message:search",
    method: "GET",
    routePath: "mobile/channels/[channelId]/messages/search",
  },
  {
    action: "mobile:message:search",
    method: "GET",
    routePath: "mobile/dm/[conversationId]/messages/search",
  },
  {
    action: "mobile:server:create",
    method: "POST",
    routePath: "mobile/servers",
  },
  {
    action: "mobile:server:join",
    method: "POST",
    routePath: "mobile/servers/join",
  },
  {
    action: "mobile:server:detail",
    method: "GET",
    routePath: "mobile/servers/[serverId]",
  },
  {
    action: "mobile:server:update",
    method: "PATCH",
    routePath: "mobile/servers/[serverId]",
  },
  {
    action: "mobile:server:delete",
    method: "DELETE",
    routePath: "mobile/servers/[serverId]",
  },
  {
    action: "mobile:server:invites:list",
    method: "GET",
    routePath: "mobile/servers/[serverId]/invites",
  },
  {
    action: "mobile:server:invites:create",
    method: "POST",
    routePath: "mobile/servers/[serverId]/invites",
  },
  {
    action: "mobile:server:invites:revoke",
    method: "DELETE",
    routePath: "mobile/servers/[serverId]/invites/[inviteId]",
  },
  {
    action: "mobile:server:categories:create",
    method: "POST",
    routePath: "mobile/servers/[serverId]/categories",
  },
  {
    action: "mobile:server:categories:update",
    method: "PATCH",
    routePath: "mobile/servers/[serverId]/categories/[categoryId]",
  },
  {
    action: "mobile:server:categories:delete",
    method: "DELETE",
    routePath: "mobile/servers/[serverId]/categories/[categoryId]",
  },
  {
    action: "mobile:server:channels:create",
    method: "POST",
    routePath: "mobile/servers/[serverId]/channels",
  },
  {
    action: "mobile:server:channels:update",
    method: "PATCH",
    routePath: "mobile/servers/[serverId]/channels/[channelId]",
  },
  {
    action: "mobile:server:channels:delete",
    method: "DELETE",
    routePath: "mobile/servers/[serverId]/channels/[channelId]",
  },
  {
    action: "mobile:server:members:list",
    method: "GET",
    routePath: "mobile/servers/[serverId]/members",
  },
  {
    action: "mobile:server:roles:list",
    method: "GET",
    routePath: "mobile/servers/[serverId]/roles",
  },
  {
    action: "mobile:server:roles:create",
    method: "POST",
    routePath: "mobile/servers/[serverId]/roles",
  },
  {
    action: "mobile:server:roles:overview:list",
    method: "GET",
    routePath: "mobile/servers/[serverId]/roles/overview",
  },
  {
    action: "mobile:server:roles:update",
    method: "PATCH",
    routePath: "mobile/servers/[serverId]/roles/[roleId]",
  },
  {
    action: "mobile:server:roles:delete",
    method: "DELETE",
    routePath: "mobile/servers/[serverId]/roles/[roleId]",
  },
  {
    action: "mobile:server:member-roles:update",
    method: "PATCH",
    routePath: "mobile/servers/[serverId]/members/[memberId]/roles",
  },
  {
    action: "mobile:server:member:kick",
    method: "DELETE",
    routePath: "mobile/servers/[serverId]/members/[memberId]",
  },
  {
    action: "mobile:channel:history:clear",
    method: "DELETE",
    routePath: "mobile/channels/[channelId]/history",
  },
  {
    action: "mobile:media:claim",
    method: "POST",
    routePath: "mobile/uploads",
  },
] as const;

function isM1RouteRateAction(action: string) {
  return (
    action.startsWith("mobile:server:") ||
    action.startsWith("mobile:channel:history:") ||
    (action.startsWith("mobile:media:") && action !== "mobile:media:upload")
  );
}

const EXPECTED_M1_RATE_LIMIT_MAPPINGS = EXPECTED_RATE_LIMIT_ACTIONS.filter(({ action }) =>
  isM1RouteRateAction(action),
);

const M1_ROUTE_PATHS = new Set<string>(
  EXPECTED_M1_RATE_LIMIT_MAPPINGS.map(({ routePath }) => routePath),
);

type RouteFile = {
  checker: ts.TypeChecker;
  content: string;
  methods: string[];
  path: string;
  routePath: string;
  sourceFile: ts.SourceFile;
};

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
type TraceCallable = FunctionLike | ts.MethodDeclaration;

type TraceValue =
  | { kind: "central-parser" }
  | { kind: "central-rate-limiter" }
  | { closure: TraceFrame; kind: "function"; node: TraceCallable }
  | { closure: TraceFrame; kind: "object"; node: ts.ObjectLiteralExpression }
  | { kind: "request" }
  | { kind: "string"; value: string }
  | { kind: "unknown" };

type TraceFrame = Map<ts.Symbol, TraceValue>;

type ExecutionTrace = {
  consumesRequestWithCentralParser: boolean;
  rateLimitActions: Set<string>;
};

type TraceState = {
  checker: ts.TypeChecker;
  result: ExecutionTrace;
  unstableSymbols: Set<ts.Symbol>;
  visited: WeakMap<TraceCallable, Set<string>>;
};

const CENTRAL_PARSER_VALUE: TraceValue = { kind: "central-parser" };
const CENTRAL_RATE_LIMITER_VALUE: TraceValue = { kind: "central-rate-limiter" };
const REQUEST_VALUE: TraceValue = { kind: "request" };
const UNKNOWN_TRACE_VALUE: TraceValue = { kind: "unknown" };

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function routePathFor(filePath: string) {
  const routeDir = path.dirname(filePath);
  return path.relative(API_V1_DIR, routeDir).split(path.sep).join("/") || ".";
}

function sourceFileFor(content: string) {
  return ts.createSourceFile("route.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

function functionInitializer(node: ts.VariableDeclaration): FunctionLike | null {
  if (!node.initializer) {
    return null;
  }

  const initializer = unwrapExpression(node.initializer);
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
    ? initializer
    : null;
}

function resolveAliasedSymbol(symbol: ts.Symbol, checker: ts.TypeChecker) {
  let current = symbol;
  const visited = new Set<ts.Symbol>();

  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !visited.has(current)) {
    visited.add(current);
    const target = checker.getAliasedSymbol(current);
    if (target === current) {
      break;
    }
    current = target;
  }

  return current;
}

function moduleExportSymbol(
  sourceFile: ts.SourceFile,
  exportName: string,
  checker: ts.TypeChecker,
) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  return moduleSymbol
    ? (checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === exportName) ??
        null)
    : null;
}

function resolveFunctionLikeFromSymbol(
  inputSymbol: ts.Symbol,
  checker: ts.TypeChecker,
  visited = new Set<ts.Symbol>(),
): FunctionLike | null {
  const symbol = resolveAliasedSymbol(inputSymbol, checker);
  if (visited.has(symbol)) {
    return null;
  }
  visited.add(symbol);

  for (const declaration of symbol.declarations ?? []) {
    if (ts.isFunctionDeclaration(declaration)) {
      return declaration;
    }

    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      continue;
    }

    const directFunction = functionInitializer(declaration);
    if (directFunction) {
      return directFunction;
    }

    const initializer = unwrapExpression(declaration.initializer);
    if (ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer)) {
      const initializerSymbol = checker.getSymbolAtLocation(initializer);
      if (initializerSymbol) {
        const resolved = resolveFunctionLikeFromSymbol(initializerSymbol, checker, visited);
        if (resolved) {
          return resolved;
        }
      }
    }
  }

  return null;
}

function exportedMethods(sourceFile: ts.SourceFile, checker: ts.TypeChecker) {
  return HTTP_METHODS.filter((method) => moduleExportSymbol(sourceFile, method, checker));
}

function exportedRouteHandler(route: RouteFile, method: string): FunctionLike | null {
  const symbol = moduleExportSymbol(route.sourceFile, method, route.checker);
  return symbol ? resolveFunctionLikeFromSymbol(symbol, route.checker) : null;
}

function isDirectHandlerAlias(route: RouteFile, method: string) {
  const exportSymbol = moduleExportSymbol(route.sourceFile, method, route.checker);
  if (!exportSymbol) {
    return false;
  }

  const symbol = resolveAliasedSymbol(exportSymbol, route.checker);
  return (symbol.declarations ?? []).some((declaration) => {
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      return false;
    }

    const initializer = unwrapExpression(declaration.initializer);
    return ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer);
  });
}

function propertyName(name: ts.PropertyName | undefined) {
  if (!name) {
    return null;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function ancestorImportDeclaration(node: ts.Node) {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isImportDeclaration(current)) {
      return current;
    }
  }

  return null;
}

function isImportedSymbol(symbol: ts.Symbol, moduleName: string, exportName: string) {
  return Boolean(
    symbol.declarations?.some((declaration) => {
      if (!ts.isImportSpecifier(declaration)) {
        return false;
      }

      const importDeclaration = ancestorImportDeclaration(declaration);
      return (
        importDeclaration &&
        ts.isStringLiteralLike(importDeclaration.moduleSpecifier) &&
        importDeclaration.moduleSpecifier.text === moduleName &&
        (declaration.propertyName ?? declaration.name).text === exportName
      );
    }),
  );
}

function isImportedBinding(
  expression: ts.Expression,
  moduleName: string,
  exportName: string,
  checker: ts.TypeChecker,
) {
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression);
    return Boolean(symbol && isImportedSymbol(symbol, moduleName, exportName));
  }

  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== exportName) {
    return false;
  }

  const namespaceSymbol = checker.getSymbolAtLocation(expression.expression);
  return Boolean(
    namespaceSymbol?.declarations?.some((declaration) => {
      if (!ts.isNamespaceImport(declaration)) {
        return false;
      }

      const importDeclaration = ancestorImportDeclaration(declaration);
      return (
        importDeclaration &&
        ts.isStringLiteralLike(importDeclaration.moduleSpecifier) &&
        importDeclaration.moduleSpecifier.text === moduleName
      );
    }),
  );
}

function traceValueSignature(value: TraceValue): string {
  if (value.kind === "function" || value.kind === "object") {
    return `${value.kind}:${path.normalize(value.node.getSourceFile().fileName)}:${value.node.pos}:${value.node.end}`;
  }

  return value.kind === "string" ? `string:${value.value}` : value.kind;
}

function symbolSignature(symbol: ts.Symbol) {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  return declaration
    ? `${path.normalize(declaration.getSourceFile().fileName)}:${declaration.pos}:${symbol.name}`
    : symbol.name;
}

function traceFrameSignature(frame: TraceFrame) {
  return [...frame.entries()]
    .map(([symbol, value]) => `${symbolSignature(symbol)}=${traceValueSignature(value)}`)
    .sort()
    .join("|");
}

function resolveSymbolTraceValue(
  inputSymbol: ts.Symbol,
  frame: TraceFrame,
  state: TraceState,
  resolving: Set<ts.Symbol>,
): TraceValue {
  if (state.unstableSymbols.has(inputSymbol)) {
    return UNKNOWN_TRACE_VALUE;
  }

  if (isImportedSymbol(inputSymbol, "@/lib/api", "parseJsonBody")) {
    return CENTRAL_PARSER_VALUE;
  }
  if (isImportedSymbol(inputSymbol, "@/lib/api-rate-limit", "enforceApiRateLimit")) {
    return CENTRAL_RATE_LIMITER_VALUE;
  }

  if (frame.has(inputSymbol)) {
    return frame.get(inputSymbol) ?? UNKNOWN_TRACE_VALUE;
  }

  const symbol = resolveAliasedSymbol(inputSymbol, state.checker);
  if (state.unstableSymbols.has(symbol)) {
    return UNKNOWN_TRACE_VALUE;
  }
  if (frame.has(symbol)) {
    return frame.get(symbol) ?? UNKNOWN_TRACE_VALUE;
  }
  if (resolving.has(symbol)) {
    return UNKNOWN_TRACE_VALUE;
  }

  const nextResolving = new Set(resolving).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isFunctionDeclaration(declaration)) {
      return { closure: new Map(frame), kind: "function", node: declaration };
    }

    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return resolveTraceValue(declaration.initializer, frame, state, nextResolving);
    }
  }

  return UNKNOWN_TRACE_VALUE;
}

function objectPropertyTraceValue(
  objectValue: Extract<TraceValue, { kind: "object" }>,
  targetPropertyName: string,
  frame: TraceFrame,
  state: TraceState,
  resolving: Set<ts.Symbol>,
): TraceValue {
  const objectFrame = new Map([...objectValue.closure, ...frame]);

  for (const property of [...objectValue.node.properties].reverse()) {
    if (ts.isSpreadAssignment(property)) {
      const spread = resolveTraceValue(property.expression, objectFrame, state, resolving);
      if (spread.kind === "object") {
        const value = objectPropertyTraceValue(
          spread,
          targetPropertyName,
          objectFrame,
          state,
          resolving,
        );
        if (value.kind !== "unknown") {
          return value;
        }
      }
      continue;
    }

    if (propertyName(property.name) !== targetPropertyName) {
      continue;
    }

    if (ts.isPropertyAssignment(property)) {
      return resolveTraceValue(property.initializer, objectFrame, state, resolving);
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      const valueSymbol = state.checker.getShorthandAssignmentValueSymbol(property);
      return valueSymbol
        ? resolveSymbolTraceValue(valueSymbol, objectFrame, state, resolving)
        : UNKNOWN_TRACE_VALUE;
    }

    if (ts.isMethodDeclaration(property)) {
      return { closure: objectFrame, kind: "function", node: property };
    }
  }

  return UNKNOWN_TRACE_VALUE;
}

function resolveTraceValue(
  input: ts.Expression,
  frame: TraceFrame,
  state: TraceState,
  resolving = new Set<ts.Symbol>(),
): TraceValue {
  const expression = unwrapExpression(input);

  if (ts.isStringLiteralLike(expression)) {
    return { kind: "string", value: expression.text };
  }

  if (isImportedBinding(expression, "@/lib/api", "parseJsonBody", state.checker)) {
    return CENTRAL_PARSER_VALUE;
  }

  if (isImportedBinding(expression, "@/lib/api-rate-limit", "enforceApiRateLimit", state.checker)) {
    return CENTRAL_RATE_LIMITER_VALUE;
  }

  if (ts.isIdentifier(expression)) {
    const symbol = state.checker.getSymbolAtLocation(expression);
    return symbol ? resolveSymbolTraceValue(symbol, frame, state, resolving) : UNKNOWN_TRACE_VALUE;
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return { closure: new Map(frame), kind: "function", node: expression };
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return { closure: new Map(frame), kind: "object", node: expression };
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const owner = resolveTraceValue(expression.expression, frame, state, resolving);
    return owner.kind === "object"
      ? objectPropertyTraceValue(owner, expression.name.text, frame, state, resolving)
      : UNKNOWN_TRACE_VALUE;
  }

  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    const owner = resolveTraceValue(expression.expression, frame, state, resolving);
    return owner.kind === "object"
      ? objectPropertyTraceValue(owner, expression.argumentExpression.text, frame, state, resolving)
      : UNKNOWN_TRACE_VALUE;
  }

  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === "Object" &&
    expression.expression.name.text === "freeze" &&
    expression.arguments[0]
  ) {
    return resolveTraceValue(expression.arguments[0], frame, state, resolving);
  }

  return UNKNOWN_TRACE_VALUE;
}

function isContractCallable(callable: TraceCallable, allowedSourcePaths: ReadonlySet<string>) {
  return allowedSourcePaths.has(path.normalize(callable.getSourceFile().fileName).toLowerCase());
}

function collectUnstableSymbols(node: ts.Node, state: TraceState) {
  function rootAssignedIdentifier(input: ts.Expression): ts.Identifier | null {
    const expression = unwrapExpression(input);
    if (ts.isIdentifier(expression)) {
      return expression;
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      return rootAssignedIdentifier(expression.expression);
    }
    return null;
  }

  function visit(current: ts.Node): void {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return;
    }

    let target: ts.Expression | null = null;
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      current.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      target = current.left;
    } else if (
      (ts.isPrefixUnaryExpression(current) || ts.isPostfixUnaryExpression(current)) &&
      (current.operator === ts.SyntaxKind.PlusPlusToken ||
        current.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      target = current.operand;
    }

    if (target) {
      const identifier = rootAssignedIdentifier(target);
      if (identifier) {
        const symbol = state.checker.getSymbolAtLocation(identifier);
        if (symbol) {
          state.unstableSymbols.add(symbol);
          state.unstableSymbols.add(resolveAliasedSymbol(symbol, state.checker));
        }
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
}

function traceCallable(
  callable: TraceCallable,
  argumentValues: readonly TraceValue[],
  closureFrame: TraceFrame,
  allowedSourcePaths: ReadonlySet<string>,
  state: TraceState,
) {
  if (!callable.body || !isContractCallable(callable, allowedSourcePaths)) {
    return;
  }

  collectUnstableSymbols(callable.body, state);

  const frame = new Map(closureFrame);
  callable.parameters.forEach((parameter, index) => {
    if (!ts.isIdentifier(parameter.name)) {
      return;
    }

    const symbol = state.checker.getSymbolAtLocation(parameter.name);
    if (!symbol) {
      return;
    }

    const hasArgument = index < argumentValues.length;
    const value =
      (hasArgument ? argumentValues[index] : undefined) ??
      (parameter.initializer
        ? resolveTraceValue(parameter.initializer, frame, state)
        : UNKNOWN_TRACE_VALUE);
    frame.set(symbol, value);
  });

  const signature = `${argumentValues.map(traceValueSignature).join(",")}|${traceFrameSignature(frame)}`;
  const signatures = state.visited.get(callable) ?? new Set<string>();
  if (signatures.has(signature)) {
    return;
  }
  signatures.add(signature);
  state.visited.set(callable, signatures);

  function definitelyTerminatesStatement(node: ts.Node): boolean {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      return false;
    }

    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      return true;
    }

    if (ts.isBlock(node)) {
      return node.statements.some(definitelyTerminatesStatement);
    }

    if (ts.isIfStatement(node) && node.elseStatement) {
      return (
        definitelyTerminatesStatement(node.thenStatement) &&
        definitelyTerminatesStatement(node.elseStatement)
      );
    }

    if (ts.isTryStatement(node)) {
      if (node.finallyBlock && definitelyTerminatesStatement(node.finallyBlock)) {
        return true;
      }

      return (
        definitelyTerminatesStatement(node.tryBlock) &&
        (!node.catchClause || definitelyTerminatesStatement(node.catchClause.block))
      );
    }

    return false;
  }

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      return;
    }

    if (ts.isBlock(node)) {
      for (const statement of node.statements) {
        visit(statement);
        if (definitelyTerminatesStatement(statement)) {
          break;
        }
      }
      return;
    }

    if (ts.isTryStatement(node)) {
      visit(node.tryBlock);
      if (node.finallyBlock) {
        visit(node.finallyBlock);
      }
      return;
    }

    if (ts.isIfStatement(node)) {
      visit(node.expression);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      visit(node.condition);
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      visit(node.left);
      return;
    }

    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      return;
    }

    if (ts.isSwitchStatement(node)) {
      visit(node.expression);
      return;
    }

    if (ts.isCallExpression(node)) {
      for (const argument of node.arguments) {
        visit(argument);
      }

      const target = resolveTraceValue(node.expression, frame, state);
      const argumentsForCall = node.arguments.map((argument) =>
        resolveTraceValue(argument, frame, state),
      );

      if (target.kind === "central-parser" && argumentsForCall[0]?.kind === "request") {
        state.result.consumesRequestWithCentralParser = true;
      }

      if (target.kind === "central-rate-limiter" && argumentsForCall[1]?.kind === "string") {
        state.result.rateLimitActions.add(argumentsForCall[1].value);
      }

      if (target.kind === "function") {
        traceCallable(target.node, argumentsForCall, target.closure, allowedSourcePaths, state);
      }

      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      visit(node.initializer);
      const symbol = state.checker.getSymbolAtLocation(node.name);
      if (symbol) {
        frame.set(symbol, resolveTraceValue(node.initializer, frame, state));
      }
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      visit(node.right);
      const symbol = state.checker.getSymbolAtLocation(node.left);
      if (symbol) {
        frame.set(symbol, resolveTraceValue(node.right, frame, state));
      }
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(callable.body);
}

function routeContractSourcePaths(route: RouteFile) {
  const routeDirectory = path.dirname(route.sourceFile.fileName);
  const sourcePaths = new Set(
    [route.sourceFile.fileName, path.join(routeDirectory, "route-logic.ts")].map((fileName) =>
      path.normalize(fileName).toLowerCase(),
    ),
  );

  function addImportTarget(identifier: ts.Identifier) {
    const symbol = route.checker.getSymbolAtLocation(identifier);
    if (!symbol) {
      return;
    }

    for (const declaration of resolveAliasedSymbol(symbol, route.checker).declarations ?? []) {
      sourcePaths.add(path.normalize(declaration.getSourceFile().fileName).toLowerCase());
    }
  }

  for (const statement of route.sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith("route-logic")
    ) {
      continue;
    }

    const importClause = statement.importClause;
    if (importClause?.name) {
      addImportTarget(importClause.name);
    }

    const bindings = importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      addImportTarget(bindings.name);
    } else if (bindings) {
      for (const element of bindings.elements) {
        addImportTarget(element.name);
      }
    }
  }

  return sourcePaths;
}

function traceRouteMethod(route: RouteFile, method: string): ExecutionTrace {
  const result: ExecutionTrace = {
    consumesRequestWithCentralParser: false,
    rateLimitActions: new Set(),
  };
  const handler = exportedRouteHandler(route, method);
  if (!handler) {
    return result;
  }

  traceCallable(handler, [REQUEST_VALUE], new Map(), routeContractSourcePaths(route), {
    checker: route.checker,
    result,
    unstableSymbols: new Set(),
    visited: new WeakMap(),
  });
  return result;
}

function routeMethodConsumesRequestWithCentralParser(route: RouteFile, method: string) {
  return traceRouteMethod(route, method).consumesRequestWithCentralParser;
}

function rateLimitActionsForMethod(route: RouteFile, method: string) {
  return [...traceRouteMethod(route, method).rateLimitActions];
}

function bodylessMutatingMethodKeys(route: RouteFile) {
  return route.methods
    .filter((method) => MUTATING_METHODS.has(method))
    .filter((method) => !routeMethodConsumesRequestWithCentralParser(route, method))
    .map((method) => `${method} ${route.routePath}`)
    .sort();
}

function typeReferencesDependency(
  type: ts.Type,
  checker: ts.TypeChecker,
  visitedTypes = new Set<ts.Type>(),
): boolean {
  if (visitedTypes.has(type)) {
    return false;
  }
  visitedTypes.add(type);

  for (const symbol of [type.aliasSymbol, type.getSymbol()]) {
    if (!symbol) {
      continue;
    }

    const resolved = resolveAliasedSymbol(symbol, checker);
    if (/(?:Dependencies|Dependency)$/.test(resolved.name)) {
      return true;
    }

    for (const declaration of resolved.declarations ?? []) {
      if (ts.isTypeAliasDeclaration(declaration)) {
        const aliasedType = checker.getTypeFromTypeNode(declaration.type);
        if (aliasedType !== type && typeReferencesDependency(aliasedType, checker, visitedTypes)) {
          return true;
        }
      }
    }
  }

  if (type.isUnionOrIntersection()) {
    return type.types.some((part) => typeReferencesDependency(part, checker, visitedTypes));
  }

  return false;
}

function parameterReferencesDependency(
  parameter: ts.ParameterDeclaration,
  checker: ts.TypeChecker,
) {
  if (typeReferencesDependency(checker.getTypeAtLocation(parameter), checker)) {
    return true;
  }

  return Boolean(
    parameter.initializer &&
    typeReferencesDependency(checker.getTypeAtLocation(parameter.initializer), checker),
  );
}

function isNextRouteContextParameter(parameter: ts.ParameterDeclaration, checker: ts.TypeChecker) {
  const type = checker.getTypeAtLocation(parameter);
  if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
    return false;
  }

  if (type.isUnion() && type.types.some((part) => !checker.getPropertyOfType(part, "params"))) {
    return false;
  }

  return Boolean(checker.getPropertyOfType(type, "params"));
}

function mobileRouteHandlerIssues(route: RouteFile) {
  const issues: string[] = [];

  for (const method of route.methods) {
    const handler = exportedRouteHandler(route, method);
    if (!handler) {
      issues.push(`${method} ${route.routePath}: handler is not a function`);
      continue;
    }

    if (handler.parameters.length < 1 || handler.parameters.length > 2) {
      issues.push(
        `${method} ${route.routePath}: expected one or two parameters, received ${handler.parameters.length}`,
      );
      continue;
    }

    const context = handler.parameters[1];
    if (!context) {
      continue;
    }

    if (parameterReferencesDependency(context, route.checker)) {
      issues.push(`${method} ${route.routePath}: dependency type used as context`);
    } else if (!isNextRouteContextParameter(context, route.checker)) {
      issues.push(`${method} ${route.routePath}: second parameter is not a Next.js route context`);
    }
  }

  return issues;
}

function readRouteContractSource(filePath: string, routeContent: string) {
  const routeDirectory = path.dirname(filePath);
  const logicPaths = new Set([path.join(routeDirectory, "route-logic.ts")]);
  const routeSourceFile = sourceFileFor(routeContent);

  for (const statement of routeSourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.endsWith("route-logic")
    ) {
      logicPaths.add(path.resolve(routeDirectory, `${statement.moduleSpecifier.text}.ts`));
    }
  }

  return [
    routeContent,
    ...[...logicPaths]
      .filter((logicPath) => existsSync(logicPath))
      .map((logicPath) => readFileSync(logicPath, "utf8")),
  ].join("\n");
}

function createRouteProgram(filePaths: readonly string[]) {
  const webRoot = path.resolve(API_V1_DIR, "../../../..");
  const configPath = path.join(webRoot, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    webRoot,
    { noEmit: true },
    configPath,
  );
  return ts.createProgram({
    options: parsedConfig.options,
    rootNames: filePaths.map((filePath) => path.resolve(filePath)),
  });
}

function createRouteFixture(
  content: string,
  routePath: string,
  relatedSources: Readonly<Record<string, string>> = {},
): RouteFile {
  const fixtureDirectory = path.resolve(API_V1_DIR, "__route-contract-fixture__");
  const filePath = path.join(fixtureDirectory, "route.ts");
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noLib: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  };
  const virtualFileEntries: Array<readonly [string, string]> = [
    [filePath, content],
    ...Object.entries(relatedSources).map(
      ([relativePath, source]) => [path.resolve(fixtureDirectory, relativePath), source] as const,
    ),
  ];
  const virtualFiles = new Map(
    virtualFileEntries.map(
      ([virtualPath, source]) => [path.normalize(virtualPath).toLowerCase(), source] as const,
    ),
  );
  const host = ts.createCompilerHost(options, true);
  const originalDirectoryExists = host.directoryExists?.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const virtualSource = (candidate: string) =>
    virtualFiles.get(path.normalize(path.resolve(candidate)).toLowerCase());
  const normalizedFixtureDirectory = path.normalize(fixtureDirectory).toLowerCase();

  host.directoryExists = (candidate) =>
    path.normalize(path.resolve(candidate)).toLowerCase() === normalizedFixtureDirectory ||
    Boolean(originalDirectoryExists?.(candidate));
  host.fileExists = (candidate) =>
    virtualSource(candidate) !== undefined || originalFileExists(candidate);
  host.readFile = (candidate) => virtualSource(candidate) ?? originalReadFile(candidate);
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) =>
    virtualSource(candidate) !== undefined
      ? ts.createSourceFile(
          candidate,
          virtualSource(candidate) ?? "",
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : originalGetSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);

  const program = ts.createProgram({ host, options, rootNames: [filePath] });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);
  assert.ok(sourceFile, `Fixture source missing from TypeScript program: ${filePath}`);

  return {
    checker,
    content: [content, ...Object.values(relatedSources)].join("\n"),
    methods: exportedMethods(sourceFile, checker),
    path: filePath,
    routePath,
    sourceFile,
  };
}

function readRoutes(): RouteFile[] {
  const filePaths = collectRouteFiles(API_V1_DIR);
  const program = createRouteProgram(filePaths);
  const checker = program.getTypeChecker();

  return filePaths
    .map((filePath) => {
      const routeContent = readFileSync(filePath, "utf8");
      const sourceFile = program.getSourceFile(path.resolve(filePath));
      assert.ok(sourceFile, `Route source missing from TypeScript program: ${filePath}`);

      return {
        checker,
        content: readRouteContractSource(filePath, routeContent),
        methods: exportedMethods(sourceFile, checker),
        path: path.relative(process.cwd(), filePath).split(path.sep).join("/"),
        routePath: routePathFor(filePath),
        sourceFile,
      };
    })
    .sort((a, b) => a.routePath.localeCompare(b.routePath));
}

describe("API v1 route contract", () => {
  const routes = readRoutes();
  const routePaths = new Set(routes.map((route) => route.routePath));

  it("keeps the unauthenticated route allowlist explicit and minimal", () => {
    const unguardedRoutes = routes
      .filter((route) => !AUTH_GUARD_CALL_PATTERN.test(route.content))
      .map((route) => route.routePath);

    assert.deepEqual(unguardedRoutes, [...UNAUTHENTICATED_ROUTE_PATHS]);

    for (const routePath of UNAUTHENTICATED_ROUTE_PATHS) {
      assert.equal(
        routePaths.has(routePath),
        true,
        `Unauthenticated API route allowlist entry does not exist: ${routePath}`,
      );
    }
  });

  it("requires every authenticated route to call an auth guard", () => {
    const missingGuards = routes
      .filter((route) => !UNAUTHENTICATED_ROUTE_PATHS.has(route.routePath))
      .filter((route) => !AUTH_GUARD_CALL_PATTERN.test(route.content))
      .map((route) => route.path);

    assert.deepEqual(missingGuards, []);
  });

  it("requires mutating routes to either parse JSON centrally or be documented as bodyless", () => {
    const mutatingWithoutJsonParser = routes
      .flatMap((route) => bodylessMutatingMethodKeys(route))
      .sort();

    assert.deepEqual(mutatingWithoutJsonParser, [...BODYLESS_MUTATING_METHOD_PATHS].sort());

    for (const methodPath of BODYLESS_MUTATING_METHOD_PATHS) {
      const separator = methodPath.indexOf(" ");
      const method = methodPath.slice(0, separator);
      const routePath = methodPath.slice(separator + 1);
      const route = routes.find((candidate) => candidate.routePath === routePath);
      assert.equal(
        route?.methods.includes(method),
        true,
        `Bodyless mutating API method/path allowlist entry does not exist: ${methodPath}`,
      );
    }
  });

  it("does not bypass parseJsonBody with direct request body readers", () => {
    const rawBodyReaders = routes
      .filter((route) => RAW_REQUEST_BODY_CALL_PATTERN.test(route.content))
      .map((route) => route.path);

    assert.deepEqual(rawBodyReaders, []);
  });

  it("keeps injectable mobile route logic behind Next.js-compatible handlers", () => {
    const directlyAliasedHandlers = routes
      .filter((route) => route.routePath.startsWith("mobile/"))
      .flatMap((route) =>
        route.methods
          .filter((method) => isDirectHandlerAlias(route, method))
          .map((method) => `${method} ${route.path}`),
      );

    assert.deepEqual(directlyAliasedHandlers, []);
  });

  it("keeps exported mobile Next handlers on request/context signatures", () => {
    const invalidHandlers = routes
      .filter(({ routePath }) => routePath.startsWith("mobile/"))
      .flatMap((route) => mobileRouteHandlerIssues(route));

    assert.deepEqual(invalidHandlers, []);
  });

  it("uses registered M1 rate actions without temporary ApiRateLimitAction casts", () => {
    const uploadThingSource = readFileSync(
      path.resolve(API_V1_DIR, "../../../lib/mobile/mobile-media-uploadthing.ts"),
      "utf8",
    );
    const filesWithTemporaryCasts = routes
      .filter(({ routePath }) => M1_ROUTE_PATHS.has(routePath))
      .filter(({ content }) => /\bApiRateLimitAction\b/.test(content))
      .map(({ path: routeFile }) => routeFile);

    if (/\bApiRateLimitAction\b/.test(uploadThingSource)) {
      filesWithTemporaryCasts.push("src/lib/mobile/mobile-media-uploadthing.ts");
    }

    assert.deepEqual(filesWithTemporaryCasts, []);
  });

  it("keeps high-risk route rate-limit actions mapped to the intended method", () => {
    for (const expected of EXPECTED_RATE_LIMIT_ACTIONS) {
      const route = routes.find((candidate) => candidate.routePath === expected.routePath);
      assert.ok(route, `Missing route for ${expected.routePath}`);

      assert.ok(
        route.methods.includes(expected.method),
        `Missing ${expected.method} in ${expected.routePath}`,
      );
      assert.deepEqual(rateLimitActionsForMethod(route, expected.method), [expected.action]);
    }

    const expectedM1Mappings = EXPECTED_M1_RATE_LIMIT_MAPPINGS.map(
      ({ action, method, routePath }) => `${method} ${routePath} -> ${action}`,
    ).sort();
    const actualM1Mappings = routes
      .flatMap((route) =>
        route.methods.flatMap((method) =>
          rateLimitActionsForMethod(route, method)
            .filter(isM1RouteRateAction)
            .map((action) => `${method} ${route.routePath} -> ${action}`),
        ),
      )
      .sort();

    assert.equal(expectedM1Mappings.length, 24);
    assert.deepEqual(actualM1Mappings, expectedM1Mappings);
  });

  it("discovers exported route handlers through the TypeScript AST without comment or string decoys", () => {
    const route = createRouteFixture(
      `
        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };
        type MobileRouteDependencies = { requireUserId(): Promise<string> };
        type DependencyAlias = MobileRouteDependencies;

        const defaultDependencies: DependencyAlias = {
          async requireUserId() { return "user-1"; },
        };

        function GET(_request: Request, _context: RouteContext) {}
        export { GET };

        export function POST(_request: Request, _context: RouteContext) {}
        export const PATCH = (_request: Request, _context: DependencyAlias) => {};

        const PUT = (_request: Request, _context = defaultDependencies) => {};
        export { PUT };

        // export function DELETE(_request: Request) {}
        const decoy = "export const DELETE = (_request: Request) => undefined";
        void decoy;
      `,
      "mobile/contract-fixture",
    );

    assert.deepEqual(route.methods, ["GET", "POST", "PATCH", "PUT"]);
    assert.deepEqual(
      mobileRouteHandlerIssues(route).map((issue) => issue.split(":", 1)[0]),
      ["PATCH mobile/contract-fixture", "PUT mobile/contract-fixture"],
    );
  });

  it("checks every mutating handler body contract independently on a shared route path", () => {
    const routePath = "mobile/servers/[serverId]/contract-fixture";
    const withPatchParser = createRouteFixture(
      `
        import { parseJsonBody } from "@/lib/api";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        export function PATCH(request: Request, _context: RouteContext) {
          return parseJsonBody(request);
        }

        export function DELETE(_request: Request, _context: RouteContext) {}
      `,
      routePath,
    );
    const withoutPatchParser = createRouteFixture(
      `
        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        export function PATCH(_request: Request, _context: RouteContext) {}
        export function DELETE(_request: Request, _context: RouteContext) {}
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(withPatchParser), [`DELETE ${routePath}`]);
    assert.deepEqual(bodylessMutatingMethodKeys(withoutPatchParser), [
      `DELETE ${routePath}`,
      `PATCH ${routePath}`,
    ]);
  });

  it("does not treat arbitrary parser-like function names as the central JSON parser", () => {
    const routePath = "mobile/contract-fixture/arbitrary-parser";
    const route = createRouteFixture(
      `
        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };
        declare function parseUnsafeBody(request: Request): Promise<unknown>;

        export function PATCH(request: Request, _context: RouteContext) {
          return parseUnsafeBody(request);
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [`PATCH ${routePath}`]);
  });

  it("requires a parser wrapper to consume the exported handler request", () => {
    const routePath = "mobile/contract-fixture/missing-request";
    const route = createRouteFixture(
      `
        import { parseJsonBody } from "@/lib/api";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        function parseBody(request?: Request) {
          return request ? parseJsonBody(request) : Promise.resolve(undefined);
        }

        export function PATCH(_request: Request, _context: RouteContext) {
          return parseBody();
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [`PATCH ${routePath}`]);
  });

  it("ignores central parser calls inside uninvoked nested functions", () => {
    const routePath = "mobile/contract-fixture/uninvoked-parser";
    const route = createRouteFixture(
      `
        import { parseJsonBody } from "@/lib/api";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        export function PATCH(request: Request, _context: RouteContext) {
          function neverCalled() {
            return parseJsonBody(request);
          }

          void neverCalled;
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [`PATCH ${routePath}`]);
  });

  it("ignores central parser calls on unreachable control-flow paths", () => {
    const routePath = "mobile/contract-fixture/unreachable-parser";
    const route = createRouteFixture(
      `
        import { parseJsonBody } from "@/lib/api";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        export function PATCH(request: Request, _context: RouteContext) {
          if (false) parseJsonBody(request);
        }

        export function POST(request: Request, _context: RouteContext) {
          false && parseJsonBody(request);
        }

        export function PUT(request: Request, _context: RouteContext) {
          return undefined;
          parseJsonBody(request);
        }

        export function DELETE(request: Request, _context: RouteContext) {
          try {
            return undefined;
          } finally {
            // Cleanup only.
          }
          parseJsonBody(request);
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [
      `DELETE ${routePath}`,
      `PATCH ${routePath}`,
      `POST ${routePath}`,
      `PUT ${routePath}`,
    ]);
  });

  it("does not trust parser aliases that may be reassigned", () => {
    const routePath = "mobile/contract-fixture/reassigned-parser";
    const route = createRouteFixture(
      `
        import { parseJsonBody } from "@/lib/api";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };
        declare const condition: boolean;
        declare function localParser(request: Request): Promise<unknown>;

        export function PATCH(request: Request, _context: RouteContext) {
          let parser = parseJsonBody;
          if (condition) parser = localParser;
          return parser(request);
        }

        export function POST(request: Request, _context: RouteContext) {
          let parser = parseJsonBody;
          try {
            throw new Error("fixture");
          } catch {
            parser = localParser;
          }
          return parser(request);
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [
      `PATCH ${routePath}`,
      `POST ${routePath}`,
    ]);
  });

  it("does not trust parser dependency properties that may be reassigned", () => {
    const routePath = "mobile/contract-fixture/reassigned-parser-dependency";
    const route = createRouteFixture(
      `
        import { parseJsonBody } from "@/lib/api";

        type Request = { readonly url: string };
        type Dependencies = { parseBody(request: Request): Promise<unknown> };
        declare const condition: boolean;
        declare function localParser(request: Request): Promise<unknown>;
        const defaultDependencies: Dependencies = { parseBody: parseJsonBody };

        export function PATCH(request: Request, dependencies = defaultDependencies) {
          if (condition) dependencies.parseBody = localParser;
          return dependencies.parseBody(request);
        }

        export function POST(request: Request, dependencies = defaultDependencies) {
          try {
            throw new Error("fixture");
          } catch {
            dependencies["parseBody"] = localParser;
          }
          return dependencies.parseBody(request);
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [
      `PATCH ${routePath}`,
      `POST ${routePath}`,
    ]);
  });

  it("does not trust ambient declarations as the central JSON parser", () => {
    const routePath = "mobile/contract-fixture/ambient-parser";
    const route = createRouteFixture(
      `
        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };
        declare function parseJsonBody(request: Request): Promise<unknown>;

        export function PATCH(request: Request, _context: RouteContext) {
          return parseJsonBody(request);
        }
      `,
      routePath,
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [`PATCH ${routePath}`]);
  });

  it("keeps same-named parser helpers isolated to their source file", () => {
    const routePath = "mobile/contract-fixture/parser-source-collision";
    const route = createRouteFixture(
      `
        import { mobileRoute } from "./route-logic";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        function parseBody(request: Request) {
          return Promise.resolve(request.url);
        }

        export function PATCH(request: Request, _context: RouteContext) {
          void mobileRoute;
          return parseBody(request);
        }
      `,
      routePath,
      {
        "route-logic.ts": `
          import { parseJsonBody } from "@/lib/api";

          type Request = { readonly url: string };

          function parseBody(request: Request) {
            return parseJsonBody(request);
          }

          export function mobileRoute(request: Request) {
            return parseBody(request);
          }
        `,
      },
    );

    assert.deepEqual(bodylessMutatingMethodKeys(route), [`PATCH ${routePath}`]);
  });

  it("ignores central rate-limit calls inside uninvoked nested functions", () => {
    const route = createRouteFixture(
      `
        import { enforceApiRateLimit } from "@/lib/api-rate-limit";

        type Request = { readonly url: string };

        export function DELETE(_request: Request) {
          function neverCalled() {
            return enforceApiRateLimit("user-1", "mobile:server:delete");
          }

          void neverCalled;
        }
      `,
      "mobile/contract-fixture/uninvoked-rate-limit",
    );

    assert.deepEqual(rateLimitActionsForMethod(route, "DELETE"), []);
  });

  it("ignores central rate-limit calls on unreachable control-flow paths", () => {
    const route = createRouteFixture(
      `
        import { enforceApiRateLimit } from "@/lib/api-rate-limit";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };

        export function PATCH(_request: Request, _context: RouteContext) {
          if (false) enforceApiRateLimit("user-1", "mobile:server:update");
        }

        export function POST(_request: Request, _context: RouteContext) {
          false && enforceApiRateLimit("user-1", "mobile:server:create");
        }

        export function PUT(_request: Request, _context: RouteContext) {
          return undefined;
          enforceApiRateLimit("user-1", "mobile:server:update");
        }

        export function DELETE(_request: Request, _context: RouteContext) {
          try {
            return undefined;
          } finally {
            // Cleanup only.
          }
          enforceApiRateLimit("user-1", "mobile:server:delete");
        }
      `,
      "mobile/contract-fixture/unreachable-rate-limit",
    );

    assert.deepEqual(rateLimitActionsForMethod(route, "PATCH"), []);
    assert.deepEqual(rateLimitActionsForMethod(route, "POST"), []);
    assert.deepEqual(rateLimitActionsForMethod(route, "PUT"), []);
    assert.deepEqual(rateLimitActionsForMethod(route, "DELETE"), []);
  });

  it("does not trust rate-limit aliases that may be reassigned", () => {
    const route = createRouteFixture(
      `
        import { enforceApiRateLimit } from "@/lib/api-rate-limit";

        type Request = { readonly url: string };
        type RouteContext = { params: Promise<Record<string, string>> };
        declare const condition: boolean;
        declare function localLimiter(userId: string, action: string): Promise<void>;

        export function PATCH(_request: Request, _context: RouteContext) {
          let limiter = enforceApiRateLimit;
          if (condition) limiter = localLimiter;
          return limiter("user-1", "mobile:server:update");
        }

        export function POST(_request: Request, _context: RouteContext) {
          let limiter = enforceApiRateLimit;
          try {
            throw new Error("fixture");
          } catch {
            limiter = localLimiter;
          }
          return limiter("user-1", "mobile:server:create");
        }
      `,
      "mobile/contract-fixture/reassigned-rate-limit",
    );

    assert.deepEqual(rateLimitActionsForMethod(route, "PATCH"), []);
    assert.deepEqual(rateLimitActionsForMethod(route, "POST"), []);
  });

  it("does not trust rate-limit dependency properties that may be reassigned", () => {
    const route = createRouteFixture(
      `
        import { enforceApiRateLimit } from "@/lib/api-rate-limit";

        type Request = { readonly url: string };
        type Dependencies = {
          enforceRateLimit(userId: string, action: string): Promise<void>;
        };
        declare const condition: boolean;
        declare function localLimiter(userId: string, action: string): Promise<void>;
        const defaultDependencies: Dependencies = {
          enforceRateLimit: enforceApiRateLimit,
        };

        export function PATCH(_request: Request, dependencies = defaultDependencies) {
          if (condition) dependencies.enforceRateLimit = localLimiter;
          return dependencies.enforceRateLimit("user-1", "mobile:server:update");
        }

        export function POST(_request: Request, dependencies = defaultDependencies) {
          try {
            throw new Error("fixture");
          } catch {
            dependencies["enforceRateLimit"] = localLimiter;
          }
          return dependencies.enforceRateLimit("user-1", "mobile:server:create");
        }
      `,
      "mobile/contract-fixture/reassigned-rate-limit-dependency",
    );

    assert.deepEqual(rateLimitActionsForMethod(route, "PATCH"), []);
    assert.deepEqual(rateLimitActionsForMethod(route, "POST"), []);
  });

  it("does not trust arbitrary local rate-limit functions", () => {
    const route = createRouteFixture(
      `
        type Request = { readonly url: string };

        function enforceApiRateLimit(_userId: string, _action: string) {
          return Promise.resolve();
        }

        export function DELETE(_request: Request) {
          return enforceApiRateLimit("user-1", "mobile:server:delete");
        }
      `,
      "mobile/contract-fixture/local-rate-limit",
    );

    assert.deepEqual(rateLimitActionsForMethod(route, "DELETE"), []);
  });

  it("traces an invoked route wrapper through default dependencies to the central limiter", () => {
    const route = createRouteFixture(
      `
        import { mobileServerDeleteRoute } from "./route-logic";

        type Request = { readonly url: string };

        export function DELETE(request: Request) {
          return mobileServerDeleteRoute(request);
        }
      `,
      "mobile/contract-fixture/default-rate-limit-dependency",
      {
        "route-logic.ts": `
          import { enforceApiRateLimit } from "@/lib/api-rate-limit";

          type Request = { readonly url: string };
          type Dependencies = {
            enforceRateLimit(userId: string, action: "mobile:server:delete"): Promise<void>;
          };

          const defaultDependencies: Dependencies = {
            enforceRateLimit: enforceApiRateLimit,
          };

          export async function mobileServerDeleteRoute(
            _request: Request,
            dependencies: Dependencies = defaultDependencies,
          ) {
            await dependencies.enforceRateLimit("user-1", "mobile:server:delete");
          }
        `,
      },
    );

    assert.deepEqual(rateLimitActionsForMethod(route, "DELETE"), ["mobile:server:delete"]);
  });
});
