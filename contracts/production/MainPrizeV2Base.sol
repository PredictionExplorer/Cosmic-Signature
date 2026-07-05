// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorageV2Base } from "./CosmicSignatureGameStorageV2Base.sol";
import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { IMainPrize1 } from "./interfaces/IMainPrize1.sol";

// #endregion
// #region

abstract contract MainPrizeV2Base is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorageV2Base,
	BiddingCommonV2,
	MainPrizeCommonV2,
	BidStatisticsV2,
	IMainPrize1 {
	// #region `claimMainPrize`

	/// @dev Comment-202411169 relates and/or applies.
	/// Comment-202411078 relates and/or applies.
	/// Comment-202605308 applies.
	function claimMainPrize() external override nonReentrant /*_onlyRoundIsActive*/ {
		// #region

		if (_msgSender() == lastBidderAddress) {
			// Comment-202411169 relates.
			// #enable_asserts assert(lastBidderAddress != address(0));

			if ( ! (block.timestamp >= mainPrizeTime) ) {
				revert CosmicSignatureErrors.MainPrizeEarlyClaim("Not enough time has elapsed.", mainPrizeTime, block.timestamp);
			}
		} else {
			// Comment-202411169 relates.
			if ( ! (lastBidderAddress != address(0)) ) {
				revert CosmicSignatureErrors.NoBidsPlacedInCurrentRound("There have been no bids in the current bidding round yet.");
			}

			int256 durationUntilOperationIsPermitted_ = getDurationUntilMainPrizeRaw() + int256(timeoutDurationToClaimMainPrize);
			if ( ! (durationUntilOperationIsPermitted_ <= int256(0)) ) {
				revert
					CosmicSignatureErrors.MainPrizeClaimDenied(
						"Only the last bidder is permitted to claim the bidding round main prize before a timeout expires.",
						lastBidderAddress,
						_msgSender(),
						uint256(durationUntilOperationIsPermitted_)
					);
			}
		}

		// Comment-202411169 applies.
		// #enable_asserts assert(block.timestamp >= roundActivationTime);

		// #endregion
		// #region

		// Comment-202605309 applies.
		_updateChampionsIfNeeded();
		_updateChronoWarriorIfNeeded(block.timestamp);

		_distributePrizes();
		_prepareNextRound();

		// #endregion
	}

	// #endregion
	// #region `_distributePrizes`

	function _distributePrizes() internal virtual;

	// #endregion
	// #region `_prepareNextRound`

	function _prepareNextRound() private {
		// Comment-202606235 relates and/or applies.
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */

		{
			// lastBidType = BidType.ETH;
			lastBidderAddress = address(0);
			lastCstBidderAddress = address(0);
			enduranceChampionAddress = address(0);

			// // Comment-202605307 applies.
			// // Comment-202501308 applies.
			// enduranceChampionStartTimeStamp = 0;

			// // Comment-202605307 applies.
			// // Comment-202501308 applies.
			// enduranceChampionDuration = 0;

			prevEnduranceChampionDuration = 0;
			chronoWarriorAddress = address(0);
			chronoWarriorDuration = uint256(int256(-1));
			++ roundNum;

			// // Comment-202501307 applies.
			// cstDutchAuctionBeginningBidPrice = nextRoundFirstCstDutchAuctionBeginningBidPrice;

			_setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds + mainPrizeTimeIncrementInMicroSeconds / mainPrizeTimeIncrementIncreaseDivisor);

			// [Comment-202606235]
			// In V2+ (but not in V1), all code in the `_prepareNextRound` method is wrapped in an `unchecked` block.
			// Realistically, nothing can overflow around here, except, potentially,
			// the math involving `delayDurationBeforeRoundActivation`.
			// The problem is with Comment-202503106. At any time, the contract owner
			// can change `delayDurationBeforeRoundActivation` to a value that will overflow and thereby disable `claimMainPrize`.
			// Then the owner would need to wait until the main prize claim timeout expires
			// and then set `delayDurationBeforeRoundActivation` to a value that will not overflow
			// and immediately call `claimMainPrize`, all in a single transaction.
			// So the aforementioned `unchecked` block eliminates this vulnerability.
			// Comment-202606264 relates.
			// [/Comment-202606235]
			_setRoundActivationTime(block.timestamp + delayDurationBeforeRoundActivation);
		}
	}

	// #endregion
	// #region `getMainEthPrizeAmount`

	function getMainEthPrizeAmount() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * mainEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getCharityEthDonationAmount`

	function getCharityEthDonationAmount() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * charityEthDonationAmountPercentage / 100;
		}
	}

	// #endregion
}

// #endregion
