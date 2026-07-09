// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

interface ICosmicSignatureGameStorageV3 is ICosmicSignatureGameStorage {
	struct ChampionDurations {
		uint256 enduranceChampion;
		uint256 chronoWarrior;
	}
}
