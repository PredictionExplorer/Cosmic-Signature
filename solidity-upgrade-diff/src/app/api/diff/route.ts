import { NextRequest, NextResponse } from "next/server";

import { buildLineDiff } from "@/lib/diff";
import { readSoliditySource } from "@/lib/sourceReader";
import { getDefaultVersionPair, getFileLabel, getLogicalFileIds, getVersion } from "@/lib/versionRegistry";
import type { DiffResponse, FileComparisonSummary, LogicalFileId, VersionDefinition } from "@/types";

export async function GET(request: NextRequest): Promise<NextResponse<DiffResponse | { error: string }>> {
  const defaults = getDefaultVersionPair();
  const baseVersion = getVersion(request.nextUrl.searchParams.get("base") ?? defaults.base.id);
  const targetVersion = getVersion(request.nextUrl.searchParams.get("target") ?? defaults.target.id);
  const selectedFileId = request.nextUrl.searchParams.get("file");

  if (baseVersion == null || targetVersion == null) {
    return NextResponse.json({ error: "Unknown version id." }, { status: 400 });
  }

  const fileIds = getLogicalFileIds(baseVersion, targetVersion);
  const files = await Promise.all(
    fileIds.map(async (fileId) => summarizeFile(fileId, baseVersion.files[fileId]?.path ?? null, targetVersion.files[fileId]?.path ?? null, getFileLabel(baseVersion.files[fileId], targetVersion.files[fileId])))
  );
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files.find((file) => file.status !== "unchanged") ?? files[0] ?? null;

  if (selectedFile == null) {
    return NextResponse.json({
      baseVersion: toVersionMeta(baseVersion),
      targetVersion: toVersionMeta(targetVersion),
      files: [],
      selectedFile: null,
      rows: []
    });
  }

  const baseSource = await readSoliditySource(selectedFile.basePath);
  const targetSource = await readSoliditySource(selectedFile.targetPath);
  const diff = buildLineDiff(baseSource, targetSource);

  return NextResponse.json({
    baseVersion: toVersionMeta(baseVersion),
    targetVersion: toVersionMeta(targetVersion),
    files,
    selectedFile,
    rows: diff.rows
  });
}

function toVersionMeta({ id, label, summary }: VersionDefinition): Pick<VersionDefinition, "id" | "label" | "summary"> {
  return { id, label, summary };
}

async function summarizeFile(id: LogicalFileId, basePath: string | null, targetPath: string | null, label: string): Promise<FileComparisonSummary> {
  const baseSource = await readSoliditySource(basePath);
  const targetSource = await readSoliditySource(targetPath);
  const diff = buildLineDiff(baseSource, targetSource);

  return {
    id,
    label,
    basePath,
    targetPath,
    status: getStatus(basePath, targetPath, diff.additions, diff.deletions),
    additions: diff.additions,
    deletions: diff.deletions
  };
}

function getStatus(basePath: string | null, targetPath: string | null, additions: number, deletions: number): FileComparisonSummary["status"] {
  if (basePath == null && targetPath != null) {
    return "added";
  }
  if (basePath != null && targetPath == null) {
    return "removed";
  }
  if (additions > 0 || deletions > 0) {
    return "modified";
  }
  return "unchanged";
}
