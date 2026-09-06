// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { BidRaffleWeightHelpers } from "../production/libraries/BidRaffleWeightHelpers.sol";
import { ICosmicSignatureGameStorage } from "../production/interfaces/ICosmicSignatureGameStorage.sol";

/// @notice A test-only harness for `BidRaffleWeightHelpers`.
contract BidRaffleWeightHelpersTestHarness {
	mapping(uint256 arrayId => ICosmicSignatureGameStorage.BidsInfo bidsInfo) private _bidsInfo;

	function appendWeights(uint256 arrayId_, uint256[] calldata weights_) external {
		ICosmicSignatureGameStorage.BidsInfo storage bidsInfo_ = _bidsInfo[arrayId_];
		for ( uint256 index_ = 0; index_ < weights_.length; ++ index_ ) {
			BidRaffleWeightHelpers.saveForNextBid(bidsInfo_, weights_[index_]);
			++ bidsInfo_.numItems;
		}
	}

	function getNumBids(uint256 arrayId_) external view returns (uint256) {
		return _bidsInfo[arrayId_].numItems;
	}

	function getCumulativeWeightAt(uint256 arrayId_, uint256 bidIndex_) external view returns (uint256) {
		return _bidsInfo[arrayId_].items[bidIndex_].raffleCumulativeWeight;
	}

	function getTotalWeight(uint256 arrayId_) external view returns (uint256) {
		return BidRaffleWeightHelpers.getTotalWeight(_bidsInfo[arrayId_]);
	}

	function findBidIndex(uint256 arrayId_, uint256 targetCumulativeWeight_) external view returns (uint256) {
		return BidRaffleWeightHelpers.findBidIndex(_bidsInfo[arrayId_], targetCumulativeWeight_);
	}

	function findBidIndexMany(
		uint256 arrayId_,
		uint256[] calldata targetCumulativeWeights_
	) external view returns (uint256[] memory bidIndexes_) {
		bidIndexes_ = new uint256[](targetCumulativeWeights_.length);
		for ( uint256 index_ = 0; index_ < targetCumulativeWeights_.length; ++ index_ ) {
			bidIndexes_[index_] = BidRaffleWeightHelpers.findBidIndex(_bidsInfo[arrayId_], targetCumulativeWeights_[index_]);
		}
	}
}
