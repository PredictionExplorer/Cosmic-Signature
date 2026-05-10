import { promises as fs } from "node:fs";
import path from "node:path";

const APP_ROOT = process.cwd();
const REPO_ROOT = path.resolve(APP_ROOT, "..");

export async function readSoliditySource(relativePath: string | null): Promise<string | null> {
  if (relativePath == null) {
    return null;
  }
  assertSafeSolidityPath(relativePath);

  const absolutePath = path.resolve(REPO_ROOT, relativePath);
  if (!absolutePath.startsWith(REPO_ROOT + path.sep)) {
    throw new Error(`Refusing to read outside the repository: ${relativePath}`);
  }

  return fs.readFile(absolutePath, "utf8");
}

function assertSafeSolidityPath(relativePath: string): void {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Expected a relative Solidity path, received: ${relativePath}`);
  }
  if (!relativePath.endsWith(".sol")) {
    throw new Error(`Only Solidity files can be compared, received: ${relativePath}`);
  }
  if (relativePath.split(/[\\/]/).includes("tests")) {
    throw new Error(`Test Solidity files are intentionally excluded: ${relativePath}`);
  }
}
