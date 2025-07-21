// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

/// @notice This contract is to be used for testing on a live blockchain.
/// [Comment-202508065]
/// It will return all the assets back to the `owner()` and self-destruct.
/// [/Comment-202508065]
/// @dev todo-1 I can't eliminate this contract, can I?
/// todo-1 If I am to eliminate it, remember to review numbered comments and todos, especially Comment-202503124.
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

	/// @notice Comment-202508065 applies.
	function finalizeTesting() external onlyOwner {
		// Cosmic Signature NFTs.
		// todo-1 This logic kinda makes no sense because we mint CS NFTs for bidders, not for the game itself, right?
		for (uint256 nftId_ = nft.totalSupply(); nftId_ > 0; ) {
			-- nftId_;
			address nftOwnerAddress_ = nft.ownerOf(nftId_);
			if (nftOwnerAddress_ == address(this)) {
				// todo-1 What if this reverts?
				// todo-1 Make sense to try to transfer without prior evaluating what `nft.ownerOf` returns?
				// Comment-202501145 applies.
				nft.transferFrom(address(this), owner(), nftId_);
			}
		}

		// todo-1 We don't need to return RW NFTs, right?
	
		// todo-1 This logic kinda makes no sense because we mint CSTs for bidders, not for the game itself, right?
		{
			uint256 myCstBalanceAmount_ = token.balanceOf(address(this));
			if (myCstBalanceAmount_ > 0) {
				token.transfer(owner(), myCstBalanceAmount_);
			}
		}

		// // todo-1 Donated NFTs now live in `PrizesWallet`.
		// // todo-1 So the owner can get them from there, right?
		// for (uint256 donatedNftIndex_ = nextDonatedNftIndex; donatedNftIndex_ > 0; ) {
		// 	-- donatedNftIndex_;
		// 	CosmicSignatureConstants.DonatedNft storage donatedNft_ = donatedNfts[donatedNftIndex_];
		// 	donatedNft_.nftAddress.transferFrom(address(this), owner(), donatedNft_.nftId);
		// }
	
		// This `selfdestruct`s only the proxy, and leave the implementation to stay there forever, right?
		// But `selfdestruct` really does nothing besides transferring ETH, right?
		// So maybe this is OK.
		selfdestruct(payable(owner()));
	}
}
