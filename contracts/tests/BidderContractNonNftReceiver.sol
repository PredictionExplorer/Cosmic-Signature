// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

// /// @notice Bidder Contract that is not an `IERC721Receiver`.
// /// [Comment-202412176]
// /// We no longer have any contracts that implement `IERC721Receiver'.
// /// So both `BidderContractNonNftReceiver` and its tests should be deleted.
// /// [/Comment-202412176]
// contract BidderContractNonNftReceiver {
// 	CosmicSignatureGame public immutable cosmicSignatureGame;
// 
// 	constructor(CosmicSignatureGame cosmicSignatureGame_) {
// 		cosmicSignatureGame = cosmicSignatureGame_;
// 	}
// 
// 	receive() external payable {
// 		// Doing nothing.	
// 	}
// 
// 	function doBidWithEth() external payable {
// 		uint256 nextEthBidPrice_ = cosmicSignatureGame.getNextEthBidPrice(int256(0));
// 		cosmicSignatureGame.bidWithEth{value: nextEthBidPrice_}((-1), "non-IERC721Receiver bid");
// 	}
// 	
// 	function doClaimMainPrize() external {
// 		cosmicSignatureGame.claimMainPrize();
// 	}
// }
