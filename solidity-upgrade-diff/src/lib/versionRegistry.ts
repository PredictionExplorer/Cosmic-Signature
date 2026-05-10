import type { LogicalFileId, VersionDefinition, VersionFile, VersionId } from "@/types";

export const versionRegistry: VersionDefinition[] = [
  {
    id: "original",
    label: "Original",
    summary: "The deployed pre-upgrade game implementation with fixed 100 CST per bid.",
    files: {
      game: {
        label: "Game implementation",
        path: "contracts/production/CosmicSignatureGame.sol"
      },
      bidding: {
        label: "Bidding module",
        path: "contracts/production/Bidding.sol"
      }
    }
  },
  {
    id: "v2-sqrt-emission",
    label: "V2 sqrt emission",
    summary: "The UUPS upgrade that replaces fixed bid rewards with sqrt(3 * elapsedSeconds).",
    files: {
      game: {
        label: "Game implementation",
        path: "contracts/production/CosmicSignatureGameV2.sol"
      },
      bidding: {
        label: "Bidding module",
        path: "contracts/production/BiddingV2.sol"
      },
      biddingV2Interface: {
        label: "Bidding V2 interface",
        path: "contracts/production/interfaces/IBiddingV2.sol"
      },
      gameV2Interface: {
        label: "Game V2 interface",
        path: "contracts/production/interfaces/ICosmicSignatureGameV2.sol"
      },
      cstRewardCalculator: {
        label: "CST reward calculator",
        path: "contracts/production/libraries/CstRewardCalculator.sol"
      }
    }
  }
];

export function getVersion(versionId: VersionId): VersionDefinition | null {
  return versionRegistry.find((version) => version.id === versionId) ?? null;
}

export function getDefaultVersionPair(): { base: VersionDefinition; target: VersionDefinition } {
  const [base, target] = versionRegistry;
  if (base == null || target == null) {
    throw new Error("At least two Solidity versions must be configured.");
  }
  return { base, target };
}

export function getLogicalFileIds(base: VersionDefinition, target: VersionDefinition): LogicalFileId[] {
  return Array.from(new Set([...Object.keys(base.files), ...Object.keys(target.files)])).sort((a, b) => {
    const labelA = getFileLabel(base.files[a], target.files[a]);
    const labelB = getFileLabel(base.files[b], target.files[b]);
    return labelA.localeCompare(labelB);
  });
}

export function getFileLabel(baseFile: VersionFile | undefined, targetFile: VersionFile | undefined): string {
  return targetFile?.label ?? baseFile?.label ?? "Unknown Solidity file";
}
