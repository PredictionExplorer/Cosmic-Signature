// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

/// @notice
/// [Comment-202606031]
/// This contract is used for testing on a live blockchain.
/// [/Comment-202606031]
/// [Comment-202508065]
/// It will return all the assets back to the `owner()` and self-destruct.
/// Correction: as per Comment-202509241, this contract is no longer self-destructible.
/// [/Comment-202508065]
contract SelfDestructibleCosmicSignatureGame is CosmicSignatureGame {
	/// @dev Comment-202606037 applies.
	function dummyInitialize() external initializer() {
		revert ("This method is not intended to be called.");
		this.initialize(address(0));
	}

	/// @notice Comment-202508065 applies.
	/// // @custom:oz-upgrades-unsafe-allow selfdestruct
	function finalizeTesting() external onlyOwner {
		// [Comment-202606032]
		// I haven't copied most of this commented code to `SelfDestructibleCosmicSignatureGameV2`.
		// [/Comment-202606032]

		// // Cosmic Signature NFTs.
		// // todo-9 This logic doesn't appear to make sense because we mint CS NFTs for bidders, not for the game itself, right?
		// for (uint256 nftId_ = nft.totalSupply(); nftId_ > 0; ) {
		// 	-- nftId_;
		// 	address nftOwnerAddress_ = nft.ownerOf(nftId_);
		// 	if (nftOwnerAddress_ == address(this)) {
		// 		// todo-9 What if this reverts?
		// 		// Comment-202501145 applies.
		// 		nft.transferFrom(address(this), _msgSender(), nftId_);
		// 	}
		// }

		// todo-9 We don't need to return any Random Walk NFTs, right?
		// todo-9 This contract can't own them, right?

		// // todo-9 This logic doesn't appear to make sense because we mint CSTs for bidders, not for the game itself, right?
		// {
		// 	uint256 myCstBalanceAmount_ = token.balanceOf(address(this));
		// 	if (myCstBalanceAmount_ > 0) {
		// 		token.transfer(_msgSender(), myCstBalanceAmount_);
		// 	}
		// }

		// // todo-9 Donated NFTs now live in `PrizesWallet`.
		// // todo-9 So the owner or maybe a bidder account controlled by the owner can get them from there.
		// for (uint256 donatedNftIndex_ = nextDonatedNftIndex; donatedNftIndex_ > 0; ) {
		// 	-- donatedNftIndex_;
		// 	CosmicSignatureConstants.DonatedNft storage donatedNft_ = donatedNfts[donatedNftIndex_];
		// 	donatedNft_.nftAddress.transferFrom(address(this), _msgSender(), donatedNft_.nftId);
		// }
	
		// // Issue. This `selfdestruct`s only the proxy, and leaves the implementation to stay there forever, right?
		// // But `selfdestruct` actually does nothing besides transferring ETH, right?
		// // So maybe that's OK.
		// // Comment-202509241 relates.
		// selfdestruct(payable(_msgSender()));

		// [Comment-202509241]
		// So instead of `selfdestruct`ing, let's explicitly do what `selfdestruct` actually does.
		// [/Comment-202509241]
		CosmicSignatureHelpers.transferEthTo(payable(_msgSender()), address(this).balance);
	}
}
