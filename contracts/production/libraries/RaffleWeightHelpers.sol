// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

/// @title Weighted bidder raffle helpers.
/// @author The Cosmic Signature Development Team.
/// @notice
/// [Comment-202608261]
/// The V3+ weighted bidder raffle: a raffle ticket per wei, not per bid.
/// Up to and including V2, every bid was one raffle ticket of an equal weight, regardless of the bid price paid.
/// Near a bidding round start, when the ETH Dutch auction makes bids cheap, that sold the same expected raffle value
/// at a small fraction of its mid-round cost, so placing as many cheap bids as possible was profitable.
/// In V3+, every bid instead carries a raffle weight equal to the ETH bid price posted at the moment of the bid
/// (Comment-202608262), and a raffle winner is drawn by picking a uniformly random wei in `[0, total weight)`
/// and binary-searching the per-round cumulative weight sums for the bid that owns that wei.
/// The expected raffle return per ETH spent is then identical at every moment of the bidding round,
/// so neither splitting one bid into many nor spreading bids across multiple addresses changes anybody's odds.
/// This mechanism reads no timestamps, so it keeps working unchanged if multiple bids share a second
/// (a hypothetical zero-weight bid would own an empty wei range and would never be drawn; see `pickBidIndex`).
/// [/Comment-202608261]
/// @dev The per-round storage layout is a mapping of bid index to the cumulative sum of bid raffle weights
/// through that bid, maintained by `appendWeight`. The cumulative sums are monotonically nondecreasing
/// (strictly increasing while every weight is a nonzero, which Comment-202608262 guarantees).
library RaffleWeightHelpers {
	// #region `appendWeight`

	/// @notice Appends the given bid's raffle weight to the given per-round cumulative weight sums.
	/// @param cumulativeWeights_ The per-round cumulative weight sums.
	/// @param bidIndex_ The index of the bid being appended.
	/// The caller is required to ensure that it equals the number of already appended bids.
	/// @param weight_ The bid's raffle weight. Comment-202608262 applies.
	function appendWeight(
		mapping(uint256 bidNum => uint256 cumulativeWeight) storage cumulativeWeights_,
		uint256 bidIndex_,
		uint256 weight_
	) internal {
		// This addition is deliberately checked. An overflow is unreachable with real amounts of ETH,
		// but if it ever happened it would have to revert rather than corrupt the raffle.
		uint256 newCumulativeWeight_ = ((bidIndex_ > 0) ? cumulativeWeights_[bidIndex_ - 1] : 0) + weight_;

		cumulativeWeights_[bidIndex_] = newCumulativeWeight_;
	}

	// #endregion
	// #region `getTotalWeight`

	/// @notice Returns the total raffle weight of the given per-round cumulative weight sums,
	/// which is the last cumulative sum, or zero if no bids have been appended.
	/// @param numBids_ The number of appended bids.
	function getTotalWeight(
		mapping(uint256 bidNum => uint256 cumulativeWeight) storage cumulativeWeights_,
		uint256 numBids_
	) internal view returns (uint256) {
		return (numBids_ > 0) ? cumulativeWeights_[numBids_ - 1] : 0;
	}

	// #endregion
	// #region `pickBidIndex`

	/// @notice Finds the bid that owns the given random wei: the first bid whose cumulative weight sum
	/// exceeds `randomWei_`. Comment-202608261 applies.
	/// Bid `bidIndex_` owns the wei range `[cumulativeWeights_[bidIndex_ - 1], cumulativeWeights_[bidIndex_])`
	/// (with an implicit zero before the first bid), so each bid is drawn with a probability proportional
	/// to its raffle weight, and a zero-weight bid, whose range is empty, is never drawn.
	/// @param numBids_ The number of appended bids. The caller is required to ensure that it's a nonzero.
	/// @param randomWei_ A uniformly random wei. The caller is required to ensure that
	/// it's less than `getTotalWeight(cumulativeWeights_, numBids_)`.
	/// @return The index of the bid that owns `randomWei_`.
	/// @dev This is a classic lower-bound binary search over the monotonically nondecreasing cumulative sums.
	/// It makes `ceil(log2(numBids_))` storage reads, so even a bidding round with millions of bids
	/// resolves a draw in a few dozen reads.
	function pickBidIndex(
		mapping(uint256 bidNum => uint256 cumulativeWeight) storage cumulativeWeights_,
		uint256 numBids_,
		uint256 randomWei_
	) internal view returns (uint256) {
		// #enable_asserts assert(numBids_ > 0);
		// #enable_asserts assert(randomWei_ < getTotalWeight(cumulativeWeights_, numBids_));

		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 lowBidIndex_ = 0;
			uint256 highBidIndex_ = numBids_ - 1;

			// Loop invariants:
			//    * `cumulativeWeights_[highBidIndex_] > randomWei_`
			//      (initially guaranteed by the `randomWei_` precondition).
			//    * `lowBidIndex_ == 0 || cumulativeWeights_[lowBidIndex_ - 1] <= randomWei_`.
			// So on exit, `lowBidIndex_ == highBidIndex_` is the first index whose cumulative sum
			// exceeds `randomWei_`.
			while (lowBidIndex_ < highBidIndex_) {
				uint256 middleBidIndex_ = (lowBidIndex_ + highBidIndex_) >> 1;
				if (cumulativeWeights_[middleBidIndex_] > randomWei_) {
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
