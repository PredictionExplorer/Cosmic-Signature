// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { ICosmicSignatureGameStorage } from "../interfaces/ICosmicSignatureGameStorage.sol";

// #endregion
// #region

/// @title Bid raffle weight helpers.
/// @author The Cosmic Signature Development Team.
/// @notice
/// [Comment-202609098]
/// In V2-, every bid was one raffle ticket of an equal weight, regardless of the bid price paid.
/// In V3+, each bid's raffle weight is the ETH bid price without the late-bid premium at the time of the bid.
/// This is the undiscounted price for an ETH + Random Walk NFT bid and the concurrent price for a CST bid.
/// [/Comment-202609098]
library BidRaffleWeightHelpers {
	// #region `saveForNextBid`

	/// @notice Saves the cumulative raffle weight for the bid that will be appended next.
	/// @param bidRaffleWeight_ Given Comment-202609098 and Comment-202503162, it's nonzero.
	/// This guarantees that a nonempty bidding round has a nonzero total raffle weight,
	/// which is used as a divisor when a raffle winner is picked.
	function saveForNextBid(
		ICosmicSignatureGameStorage.RoundStats storage roundStats_,
		uint256 bidRaffleWeight_
	) internal {
		// #enable_asserts assert(bidRaffleWeight_ > 0);
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 bidRaffleCumulativeWeight_ = bidRaffleWeight_;
			uint256 bidIndex_ = roundStats_.numBids;
			if (bidIndex_ > 0) {
				uint256 prevBidRaffleCumulativeWeight_ = roundStats_.bidsInfo[bidIndex_ - 1].raffleCumulativeWeight;
				bidRaffleCumulativeWeight_ += prevBidRaffleCumulativeWeight_;
			}
			roundStats_.bidsInfo[bidIndex_].raffleCumulativeWeight = bidRaffleCumulativeWeight_;
		}
	}

	// #endregion
	// #region `getTotalWeight`

	/// @return The total raffle weight, or zero if there are no bids.
	function getTotalWeight(ICosmicSignatureGameStorage.RoundStats storage roundStats_) internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return (roundStats_.numBids > 0) ? roundStats_.bidsInfo[roundStats_.numBids - 1].raffleCumulativeWeight : 0;
		}
	}

	// #endregion
	// #region `findBidIndex`

	/// @return
	/// [Comment-202609094]
	/// The first bid whose cumulative weight exceeds `targetCumulativeWeight_`.
	/// [/Comment-202609094]
	function findBidIndex(
		ICosmicSignatureGameStorage.RoundStats storage roundStats_,
		uint256 targetCumulativeWeight_
	) internal view returns (uint256) {
		// #enable_asserts assert(roundStats_.numBids > 0);
		// #enable_asserts assert(targetCumulativeWeight_ < getTotalWeight(roundStats_));
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 lowBidIndex_ = 0;
			uint256 highBidIndex_ = roundStats_.numBids - 1;
			while (lowBidIndex_ < highBidIndex_) {
				uint256 middleBidIndex_ = (lowBidIndex_ + highBidIndex_) >> 1;
				if (roundStats_.bidsInfo[middleBidIndex_].raffleCumulativeWeight > targetCumulativeWeight_) {
					highBidIndex_ = middleBidIndex_;
				} else {
					lowBidIndex_ = middleBidIndex_ + 1;
				}
			}
			return lowBidIndex_;
		}
	}

	// #endregion
}

// #endregion
