// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISecondaryPrizes } from "./interfaces/ISecondaryPrizes.sol";

// #endregion
// #region

abstract contract SecondaryPrizes is CosmicSignatureGameStorage, ISecondaryPrizes {
	// #region `getChronoWarriorEthPrizeAmount`

	function getChronoWarriorEthPrizeAmount() public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018d0000, 1037618708877) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018d0001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018d0004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * chronoWarriorEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getRaffleTotalEthPrizeAmountForBidders`

	function getRaffleTotalEthPrizeAmountForBidders() public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01900000, 1037618708880) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01900001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01900004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * raffleTotalEthPrizeAmountForBiddersPercentage / 100;
		}
	}

	// #endregion
	// #region `getCosmicSignatureNftStakingTotalEthRewardAmount`

	function getCosmicSignatureNftStakingTotalEthRewardAmount() public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01940000, 1037618708884) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01940001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01940004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100;
		}
	}

	// #endregion
}

// #endregion
