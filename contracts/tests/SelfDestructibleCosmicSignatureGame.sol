// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

/// todo-1 Revisit this.
/// @notice This contract will return all the assets before selfdestruct transaction,
/// required for testing on the MainNet (Arbitrum) (prior to launch).
contract SelfDestructibleCosmicSignatureGame is CosmicSignatureGame {
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() CosmicSignatureGame() {
		// Doing nothing.	
	}

	/// @dev Comment-202503124 relates and/or applies.
	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("4 initialize");
		_initialize(ownerAddress_);
	}

	// /// todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
	// /// @notice returns all the assets to the creator of the contract and self-destroys
	// function finalizeTesting() external onlyOwner {
	// 	// Cosmic Signature NFTs.
	// 	uint256 nftTotalSupply = nft.totalSupply();
	// 	for (uint256 i = 0; i < nftTotalSupply; i++) {
	// 		address nftOwnerAddress_ = nft.ownerOf(i);
	// 		if (nftOwnerAddress_ == address(this)) {
	// 			// Comment-202501145 applies.
	// 			nft.transferFrom(address(this), owner(), i);
	// 		}
	// 	}
	//
	// 	uint256 myCstBalanceAmount_ = token.balanceOf(address(this));
	// 	token.transfer(owner(), myCstBalanceAmount_);
	//
	// 	for (uint256 i = 0; i < nextDonatedNftIndex; i++) {
	// 		// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 		CosmicSignatureConstants.DonatedNft memory dnft = donatedNfts[i];
	// 		dnft.nftAddress.transferFrom(address(this), owner(), dnft.nftId);
	// 	}
	//
	// 	// This `selfdestruct`s only the proxy, right?
	// 	// But `selfdestruct` does nothing besides transferring ETH, so maybe this is OK.
	// 	selfdestruct(payable(owner()));
	// }
}
