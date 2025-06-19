// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// todo-0 Can I delete this file?

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
// import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
// import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
// import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
// import { IPrizesWallet } from "../production/interfaces/IPrizesWallet.sol";
// import { StakingWalletRandomWalkNft } from "../production/StakingWalletRandomWalkNft.sol";
// import { StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
// import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

// todo-0 Delete this. Use `BrokenEthReceiver` instead.
// /// @notice Used to test `revert` statements for charity deposits.
// contract BrokenCharity {
// 	// uint256 private _counter;
//
// 	receive() external payable {
// 		require(false, "Test deposit failed.");
// 	}
// }

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
