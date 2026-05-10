"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { SolidityCode } from "@/components/SolidityCode";
import type { DiffResponse, DiffRow, VersionsResponse } from "@/types";

type LoadState = "idle" | "loading" | "ready" | "error";
type VisibleDiffItem =
  | { kind: "row"; row: DiffRow }
  | { kind: "gap"; id: string; firstBaseLine: number | null; lastBaseLine: number | null; firstTargetLine: number | null; lastTargetLine: number | null; rows: DiffRow[] };

const CONTEXT_LINES = 4;

export function DiffExplorer(): ReactElement {
  const [versions, setVersions] = useState<VersionsResponse | null>(null);
  const [baseId, setBaseId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [fileId, setFileId] = useState<string>("");
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string>("");
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/versions")
      .then((response) => response.json() as Promise<VersionsResponse>)
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setVersions(data);
        setBaseId(data.defaultBaseId);
        setTargetId(data.defaultTargetId);
      })
      .catch((unknownError: unknown) => {
        if (!isMounted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : "Unable to load versions.");
        setLoadState("error");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (baseId.length === 0 || targetId.length === 0) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ base: baseId, target: targetId });
    if (fileId.length > 0) {
      params.set("file", fileId);
    }

    setLoadState("loading");
    fetch(`/api/diff?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Unable to load diff.");
        }
        return response.json() as Promise<DiffResponse>;
      })
      .then((data) => {
        setDiff(data);
        setFileId(data.selectedFile?.id ?? "");
        setExpandedGaps(new Set());
        setLoadState("ready");
      })
      .catch((unknownError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : "Unable to load diff.");
        setLoadState("error");
      });

    return () => {
      controller.abort();
    };
  }, [baseId, targetId, fileId]);

  const changedFiles = useMemo(() => diff?.files.filter((file) => file.status !== "unchanged").length ?? 0, [diff]);

  if (versions == null && loadState === "error") {
    return <ErrorPanel message={error} />;
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Solidity upgrade review</p>
          <h1>Compare contract versions without test noise.</h1>
          <p className="heroCopy">
            Pick any two configured Solidity versions and inspect only the contract source changes. The registry can grow from original to V2, V3, V4, and beyond.
          </p>
        </div>
        <div className="summaryCard">
          <span className="summaryValue">{changedFiles}</span>
          <span className="summaryLabel">changed Solidity files</span>
        </div>
      </section>

      <section className="controls" aria-label="Diff controls">
        <label>
          Base version
          <select value={baseId} onChange={(event) => setBaseId(event.target.value)}>
            {versions?.versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target version
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {versions?.versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loadState === "error" ? <ErrorPanel message={error} /> : null}

      {diff != null ? (
        <section className={isFilePanelOpen ? "workspace" : "workspace filesCollapsed"}>
          {isFilePanelOpen ? (
          <aside className="fileList" aria-label="Changed Solidity files">
            <div className="fileListHeader">
              <div>
                <h2>Solidity files</h2>
                <span>{diff.files.length} configured files</span>
              </div>
              <button type="button" className="sidebarToggle" aria-label="Hide Solidity files panel" onClick={() => setIsFilePanelOpen(false)}>
                ‹
              </button>
            </div>
            {diff.files.map((file) => (
              <button key={file.id} className={file.id === diff.selectedFile?.id ? "fileItem active" : "fileItem"} onClick={() => setFileId(file.id)}>
                <span className={`statusDot ${file.status}`} />
                <span className="fileMeta">
                  <span className="fileLabel">{file.label}</span>
                  <span className="filePath">{file.targetPath ?? file.basePath}</span>
                </span>
                <span className="changeCount">
                  +{file.additions} -{file.deletions}
                </span>
              </button>
            ))}
          </aside>
          ) : (
            <button type="button" className="sidebarRail" aria-label="Show Solidity files panel" onClick={() => setIsFilePanelOpen(true)}>
              <span>›</span>
              <strong>Files</strong>
            </button>
          )}

          <section className="diffPanel" aria-label="Solidity diff">
            <div className="diffHeader">
              <div>
                <h2>{diff.selectedFile?.label ?? "No file selected"}</h2>
                <p>
                  {diff.baseVersion.label} → {diff.targetVersion.label}
                  {diff.selectedFile != null ? ` · +${diff.selectedFile.additions} -${diff.selectedFile.deletions}` : ""}
                </p>
              </div>
              {loadState === "loading" ? <span className="loading">Updating…</span> : null}
            </div>
            <DiffTable diff={diff} expandedGaps={expandedGaps} onExpandedGapsChange={setExpandedGaps} />
          </section>
        </section>
      ) : (
        <div className="loadingPanel">Loading Solidity versions…</div>
      )}
    </main>
  );
}

function DiffTable({
  diff,
  expandedGaps,
  onExpandedGapsChange
}: {
  diff: DiffResponse;
  expandedGaps: Set<string>;
  onExpandedGapsChange: (expandedGaps: Set<string>) => void;
}): ReactElement {
  const visibleItems = useMemo(() => buildVisibleDiffItems(diff.rows, expandedGaps), [diff.rows, expandedGaps]);
  const gapIds = useMemo(() => buildVisibleDiffItems(diff.rows, new Set()).filter((item): item is Extract<VisibleDiffItem, { kind: "gap" }> => item.kind === "gap").map((item) => item.id), [diff.rows]);
  const allGapsExpanded = gapIds.length > 0 && gapIds.every((gapId) => expandedGaps.has(gapId));

  function toggleGap(gapId: string): void {
    const next = new Set(expandedGaps);
    if (next.has(gapId)) {
      next.delete(gapId);
    } else {
      next.add(gapId);
    }
    onExpandedGapsChange(next);
  }

  function toggleAllGaps(): void {
    onExpandedGapsChange(allGapsExpanded ? new Set() : new Set(gapIds));
  }

  return (
    <div className="diffTableShell">
      <div className="diffToolbar">
        <span>Showing changed sections with {CONTEXT_LINES} context lines.</span>
        {gapIds.length > 0 ? (
          <button type="button" onClick={toggleAllGaps}>
            {allGapsExpanded ? "Collapse unchanged lines" : "Expand all unchanged lines"}
          </button>
        ) : null}
      </div>
      <div className="diffTable" role="table" aria-label="Side-by-side Solidity code diff">
        <span className="diffHeadCell">Base</span>
        <span className="diffHeadCell">Original source</span>
        <span className="diffHeadCell">Target</span>
        <span className="diffHeadCell">Updated source</span>
        {visibleItems.map((item) =>
          item.kind === "gap" ? <DiffGap key={item.id} gap={item} onToggle={() => toggleGap(item.id)} /> : <DiffTableRow key={item.row.id} row={item.row} />
        )}
      </div>
    </div>
  );
}

function DiffTableRow({ row }: { row: DiffRow }): ReactElement {
  return (
    <Fragment>
      <span className={`diffCell lineNumber ${row.type}`}>{row.baseLineNumber ?? ""}</span>
      <code className={`diffCell codeCell ${row.type}`}>{row.baseText.length > 0 ? <SolidityCode line={row.baseText} /> : <span className="syntaxEmpty">&nbsp;</span>}</code>
      <span className={`diffCell lineNumber ${row.type}`}>{row.targetLineNumber ?? ""}</span>
      <code className={`diffCell codeCell ${row.type}`}>{row.targetText.length > 0 ? <SolidityCode line={row.targetText} /> : <span className="syntaxEmpty">&nbsp;</span>}</code>
    </Fragment>
  );
}

function DiffGap({ gap, onToggle }: { gap: Extract<VisibleDiffItem, { kind: "gap" }>; onToggle: () => void }): ReactElement {
  return (
    <button type="button" className="diffGap" onClick={onToggle}>
      <span>{formatRange(gap.firstBaseLine, gap.lastBaseLine)}</span>
      <strong>Expand {gap.rows.length} unchanged lines</strong>
      <span>{formatRange(gap.firstTargetLine, gap.lastTargetLine)}</span>
    </button>
  );
}

function buildVisibleDiffItems(rows: DiffRow[], expandedGaps: Set<string>): VisibleDiffItem[] {
  const changedIndexes = rows.flatMap((row, index) => (row.type === "equal" ? [] : [index]));
  if (changedIndexes.length === 0) {
    return rows.map((row) => ({ kind: "row", row }));
  }

  const visibleIndexes = new Set<number>();
  for (const changedIndex of changedIndexes) {
    const start = Math.max(0, changedIndex - CONTEXT_LINES);
    const end = Math.min(rows.length - 1, changedIndex + CONTEXT_LINES);
    for (let index = start; index <= end; index += 1) {
      visibleIndexes.add(index);
    }
  }

  const items: VisibleDiffItem[] = [];
  let index = 0;
  while (index < rows.length) {
    if (visibleIndexes.has(index)) {
      items.push({ kind: "row", row: rows[index] });
      index += 1;
      continue;
    }

    const start = index;
    while (index < rows.length && !visibleIndexes.has(index)) {
      index += 1;
    }
    const hiddenRows = rows.slice(start, index);
    const gapId = `gap-${start}-${index - 1}`;
    if (expandedGaps.has(gapId)) {
      items.push(...hiddenRows.map((row) => ({ kind: "row" as const, row })));
    } else {
      items.push({
        kind: "gap",
        id: gapId,
        rows: hiddenRows,
        firstBaseLine: firstLine(hiddenRows, "baseLineNumber"),
        lastBaseLine: lastLine(hiddenRows, "baseLineNumber"),
        firstTargetLine: firstLine(hiddenRows, "targetLineNumber"),
        lastTargetLine: lastLine(hiddenRows, "targetLineNumber")
      });
    }
  }

  return items;
}

function firstLine(rows: DiffRow[], key: "baseLineNumber" | "targetLineNumber"): number | null {
  return rows.find((row) => row[key] != null)?.[key] ?? null;
}

function lastLine(rows: DiffRow[], key: "baseLineNumber" | "targetLineNumber"): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const lineNumber = rows[index][key];
    if (lineNumber != null) {
      return lineNumber;
    }
  }
  return null;
}

function formatRange(first: number | null, last: number | null): string {
  if (first == null || last == null) {
    return "—";
  }
  return first === last ? `line ${first}` : `lines ${first}-${last}`;
}

function ErrorPanel({ message }: { message: string }): ReactElement {
  return (
    <div className="errorPanel" role="alert">
      {message}
    </div>
  );
}
