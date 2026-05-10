import { NextResponse } from "next/server";

import type { VersionsResponse } from "@/types";
import { getDefaultVersionPair, versionRegistry } from "@/lib/versionRegistry";

export function GET(): NextResponse<VersionsResponse> {
  const defaults = getDefaultVersionPair();

  return NextResponse.json({
    versions: versionRegistry.map(({ id, label, summary }) => ({ id, label, summary })),
    defaultBaseId: defaults.base.id,
    defaultTargetId: defaults.target.id
  });
}
