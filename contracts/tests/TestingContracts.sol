// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
// import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
// import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
// import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
// import { IPrizesWallet } from "../production/interfaces/IPrizesWallet.sol";
// import { StakingWalletRandomWalkNft } from "../production/StakingWalletRandomWalkNft.sol";
// import { StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

// todo-0 Move each contract to a separate file.

// todo-0 Delete this. Use `BrokenEthReceiver` instead.
// /// @notice Used to test `revert` statements for charity deposits.
// contract BrokenCharity {
// 	// uint256 private _counter;
//
// 	receive() external payable {
// 		require(false, "Test deposit failed.");
// 	}
// }

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

	// /// @notice returns all the assets to the creator of the contract and self-destroys
	// /// todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
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

// contract TestStakingWalletCosmicSignatureNft is StakingWalletCosmicSignatureNft {
// 	constructor(CosmicSignatureNft nft_, address game_) StakingWalletCosmicSignatureNft(nft_, game_) {}
//
// 	// function doInsertToken(uint256 _nftId, uint256 stakeActionId_) external {
// 	// 	// This method no longer exists.
// 	// 	_insertToken(_nftId, stakeActionId_);
// 	// }
//
// 	// function doRemoveToken(uint256 _nftId) external {
// 	// 	// This method no longer exists.
// 	// 	_removeToken(_nftId);
// 	// }
// }

// contract TestStakingWalletRandomWalkNft is StakingWalletRandomWalkNft {
// 	constructor(RandomWalkNFT nft_) StakingWalletRandomWalkNft(nft_) {}
//
// 	// function doInsertToken(uint256 _nftId, uint256 stakeActionId_) external {
// 	// 	// This method no longer exists.
// 	// 	_insertToken(_nftId, stakeActionId_);
// 	// }
//
// 	// function doRemoveToken(uint256 _nftId) external {
// 	// 	// This method no longer exists.
// 	// 	_removeToken(_nftId);
// 	// }
// }
