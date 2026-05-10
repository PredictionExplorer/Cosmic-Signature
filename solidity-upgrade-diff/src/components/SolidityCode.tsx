"use client";

import type { ReactElement } from "react";

const KEYWORDS = new Set([
  "abstract",
  "as",
  "break",
  "catch",
  "constructor",
  "contract",
  "continue",
  "delete",
  "do",
  "else",
  "emit",
  "enum",
  "error",
  "event",
  "external",
  "for",
  "from",
  "function",
  "if",
  "immutable",
  "import",
  "interface",
  "internal",
  "is",
  "library",
  "mapping",
  "memory",
  "modifier",
  "new",
  "override",
  "payable",
  "pragma",
  "private",
  "public",
  "pure",
  "return",
  "returns",
  "revert",
  "storage",
  "struct",
  "try",
  "unchecked",
  "using",
  "view",
  "virtual"
]);

const BUILT_INS = new Set([
  "address",
  "assert",
  "block",
  "bool",
  "bytes",
  "calldata",
  "false",
  "int",
  "msg",
  "require",
  "string",
  "super",
  "this",
  "true",
  "tx",
  "uint"
]);

const TOKEN_PATTERN =
  /(\/\/.*|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|0x[a-fA-F0-9]+|\b\d[\d_]*\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b|[{}()[\].,;:+\-*/%<>=!&|^~?]+)/g;

export function SolidityCode({ line }: { line: string }): ReactElement {
  if (line.length === 0) {
    return <span className="syntaxEmpty">&nbsp;</span>;
  }

  const parts: ReactElement[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`plain-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>);
    }

    const token = match[0];
    parts.push(
      <span key={`${match.index}-${token}`} className={getTokenClassName(token)}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(<span key={`plain-${lastIndex}`}>{line.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

function getTokenClassName(token: string): string {
  if (token.startsWith("//") || token.startsWith("/*")) {
    return "syntaxComment";
  }
  if (token.startsWith("\"") || token.startsWith("'")) {
    return "syntaxString";
  }
  if (/^(?:0x[a-fA-F0-9]+|\d[\d_]*)$/.test(token)) {
    return "syntaxNumber";
  }
  if (KEYWORDS.has(token)) {
    return "syntaxKeyword";
  }
  if (BUILT_INS.has(token) || /^u?int(?:8|16|32|64|128|256)?$/.test(token) || /^bytes(?:[1-9]|[12]\d|3[0-2])?$/.test(token)) {
    return "syntaxBuiltin";
  }
  if (/^[{}()[\].,;:+\-*/%<>=!&|^~?]+$/.test(token)) {
    return "syntaxPunctuation";
  }
  return "syntaxIdentifier";
}
