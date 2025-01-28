// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISecondaryPrizes } from "./interfaces/ISecondaryPrizes.sol";

// #endregion
// #region

abstract contract SecondaryPrizes is CosmicSignatureGameStorage, ISecondaryPrizes {
	// #region `getChronoWarriorEthPrizeAmount`

	function getChronoWarriorEthPrizeAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * chronoWarriorEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getRaffleTotalEthPrizeAmount`

	function getRaffleTotalEthPrizeAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * raffleTotalEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getStakingTotalEthRewardAmount`

	function getStakingTotalEthRewardAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * stakingTotalEthRewardAmountPercentage / 100;
		}
	}

	// #endregion
}

// #endregion
