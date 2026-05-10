export type VersionId = string;

export type LogicalFileId = string;

export type VersionFile = {
  label: string;
  path: string;
};

export type VersionDefinition = {
  id: VersionId;
  label: string;
  summary: string;
  files: Record<LogicalFileId, VersionFile>;
};

export type FileComparisonSummary = {
  id: LogicalFileId;
  label: string;
  basePath: string | null;
  targetPath: string | null;
  status: "added" | "removed" | "modified" | "unchanged";
  additions: number;
  deletions: number;
};

export type DiffRow = {
  id: string;
  type: "equal" | "add" | "remove";
  baseLineNumber: number | null;
  targetLineNumber: number | null;
  baseText: string;
  targetText: string;
};

export type VersionsResponse = {
  versions: Array<Pick<VersionDefinition, "id" | "label" | "summary">>;
  defaultBaseId: VersionId;
  defaultTargetId: VersionId;
};

export type DiffResponse = {
  baseVersion: Pick<VersionDefinition, "id" | "label" | "summary">;
  targetVersion: Pick<VersionDefinition, "id" | "label" | "summary">;
  files: FileComparisonSummary[];
  selectedFile: FileComparisonSummary | null;
  rows: DiffRow[];
};
