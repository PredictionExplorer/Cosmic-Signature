// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { RaffleWeightHelpers } from "../production/libraries/RaffleWeightHelpers.sol";

/// @notice A thin test-only harness over `RaffleWeightHelpers` (Comment-202608261).
/// It maintains multiple independent cumulative weight arrays, keyed by an arbitrary `arrayId`,
/// so each test case can populate and query a fresh array cheaply.
contract RaffleWeightHelpersTestHarness {
	mapping(uint256 arrayId => mapping(uint256 bidNum => uint256 cumulativeWeight)) private _cumulativeWeights;
	mapping(uint256 arrayId => uint256 numBids) private _numBids;

	function appendWeights(uint256 arrayId_, uint256[] calldata weights_) external {
		uint256 numBids_ = _numBids[arrayId_];
		for ( uint256 index_ = 0; index_ < weights_.length; ++ index_ ) {
			RaffleWeightHelpers.appendWeight(_cumulativeWeights[arrayId_], numBids_, weights_[index_]);
			++ numBids_;
		}
		_numBids[arrayId_] = numBids_;
	}

	function getNumBids(uint256 arrayId_) external view returns (uint256) {
		return _numBids[arrayId_];
	}

	function getCumulativeWeightAt(uint256 arrayId_, uint256 bidIndex_) external view returns (uint256) {
		return _cumulativeWeights[arrayId_][bidIndex_];
	}

	function getTotalWeight(uint256 arrayId_) external view returns (uint256) {
		return RaffleWeightHelpers.getTotalWeight(_cumulativeWeights[arrayId_], _numBids[arrayId_]);
	}

	function pickBidIndex(uint256 arrayId_, uint256 randomWei_) external view returns (uint256) {
		return RaffleWeightHelpers.pickBidIndex(_cumulativeWeights[arrayId_], _numBids[arrayId_], randomWei_);
	}

	function pickBidIndexMany(uint256 arrayId_, uint256[] calldata randomWeis_) external view returns (uint256[] memory bidIndexes_) {
		bidIndexes_ = new uint256[](randomWeis_.length);
		for ( uint256 index_ = 0; index_ < randomWeis_.length; ++ index_ ) {
			bidIndexes_[index_] = RaffleWeightHelpers.pickBidIndex(_cumulativeWeights[arrayId_], _numBids[arrayId_], randomWeis_[index_]);
		}
	}
}
