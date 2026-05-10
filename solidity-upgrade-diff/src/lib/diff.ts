import type { DiffRow } from "@/types";

export type BuiltDiff = {
  rows: DiffRow[];
  additions: number;
  deletions: number;
};

export function buildLineDiff(baseSource: string | null, targetSource: string | null): BuiltDiff {
  const baseLines = splitLines(baseSource ?? "");
  const targetLines = splitLines(targetSource ?? "");
  const table = buildLongestCommonSubsequenceTable(baseLines, targetLines);

  const rows: DiffRow[] = [];
  let baseIndex = 0;
  let targetIndex = 0;
  let additions = 0;
  let deletions = 0;

  while (baseIndex < baseLines.length || targetIndex < targetLines.length) {
    if (baseIndex < baseLines.length && targetIndex < targetLines.length && baseLines[baseIndex] === targetLines[targetIndex]) {
      rows.push({
        id: `equal-${baseIndex}-${targetIndex}`,
        type: "equal",
        baseLineNumber: baseIndex + 1,
        targetLineNumber: targetIndex + 1,
        baseText: baseLines[baseIndex],
        targetText: targetLines[targetIndex]
      });
      baseIndex += 1;
      targetIndex += 1;
    } else if (
      targetIndex < targetLines.length &&
      (baseIndex === baseLines.length || table[baseIndex][targetIndex + 1] >= table[baseIndex + 1][targetIndex])
    ) {
      additions += 1;
      rows.push({
        id: `add-${baseIndex}-${targetIndex}`,
        type: "add",
        baseLineNumber: null,
        targetLineNumber: targetIndex + 1,
        baseText: "",
        targetText: targetLines[targetIndex]
      });
      targetIndex += 1;
    } else {
      deletions += 1;
      rows.push({
        id: `remove-${baseIndex}-${targetIndex}`,
        type: "remove",
        baseLineNumber: baseIndex + 1,
        targetLineNumber: null,
        baseText: baseLines[baseIndex],
        targetText: ""
      });
      baseIndex += 1;
    }
  }

  return { rows, additions, deletions };
}

function splitLines(source: string): string[] {
  if (source.length === 0) {
    return [];
  }
  return source.replace(/\r\n/g, "\n").split("\n");
}

function buildLongestCommonSubsequenceTable(baseLines: string[], targetLines: string[]): number[][] {
  const table = Array.from({ length: baseLines.length + 1 }, () => Array<number>(targetLines.length + 1).fill(0));

  for (let baseIndex = baseLines.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let targetIndex = targetLines.length - 1; targetIndex >= 0; targetIndex -= 1) {
      table[baseIndex][targetIndex] =
        baseLines[baseIndex] === targetLines[targetIndex]
          ? table[baseIndex + 1][targetIndex + 1] + 1
          : Math.max(table[baseIndex + 1][targetIndex], table[baseIndex][targetIndex + 1]);
    }
  }

  return table;
}
