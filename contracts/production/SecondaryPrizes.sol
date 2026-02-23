// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.33;

// #endregion
// #region

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISecondaryPrizes } from "./interfaces/ISecondaryPrizes.sol";

// #endregion
// #region

/// @title SecondaryPrizes
/// @author Cosmic Signature Team
/// @notice Provides view functions to calculate secondary prize amounts.
/// @dev Secondary prizes are distributed alongside the main prize and include:
/// - Chrono-Warrior ETH prize (for the longest-reigning Endurance Champion).
/// - Raffle ETH prizes for random bidders.
/// - ETH rewards for Cosmic Signature NFT stakers.
abstract contract SecondaryPrizes is CosmicSignatureGameStorage, ISecondaryPrizes {
	// #region `getChronoWarriorEthPrizeAmount`

	/// @inheritdoc ISecondaryPrizes
	function getChronoWarriorEthPrizeAmount() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// #enable_asserts assert(chronoWarriorEthPrizeAmountPercentage <= 100);
			return address(this).balance * chronoWarriorEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getRaffleTotalEthPrizeAmountForBidders`

	/// @inheritdoc ISecondaryPrizes
	function getRaffleTotalEthPrizeAmountForBidders() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * raffleTotalEthPrizeAmountForBiddersPercentage / 100;
		}
	}

	// #endregion
	// #region `getCosmicSignatureNftStakingTotalEthRewardAmount`

	/// @inheritdoc ISecondaryPrizes
	function getCosmicSignatureNftStakingTotalEthRewardAmount() public view override returns (uint256) {
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
