// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { RandomNumberHelpers } from "../production/libraries/RandomNumberHelpers.sol";
import { ICosmicSignatureNft } from "../production/interfaces/ICosmicSignatureNft.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

/// @notice This contract is used in tests to create special test setups.
contract SpecialCosmicSignatureGame is CosmicSignatureGame {
	/// @dev Issue. Random number related logic in this test contract is kinda lousy, but keeping it simple.
	RandomNumberHelpers.RandomNumberSeedWrapper private _entropy;

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() CosmicSignatureGame() {
		// Doing nothing.
	}

	/// @dev Comment-202503124 relates and/or applies.
	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("3 initialize");
		_initialize(ownerAddress_);
	}

	function mintCosmicSignatureNft(address nftOwnerAddress_) external {
		_prepareEntropyOnce();
		unchecked { ++ _entropy.value; }
		// todo-2 Should we make a high level call here? Comment-202502043 relates.
		(bool isSuccess_, ) = address(nft).call(abi.encodeWithSelector(ICosmicSignatureNft.mint.selector, roundNum, nftOwnerAddress_, _entropy.value));
		if ( ! isSuccess_ ) {
			assembly {
				let returnDataSize_ := returndatasize()
				let freeMemoryPointer_ := mload(0x40)
				returndatacopy(freeMemoryPointer_, 0, returnDataSize_)
				revert (freeMemoryPointer_, returnDataSize_)
			}
		}
	}

	function depositToStakingWalletCosmicSignatureNft() external payable {
		// #region // Old Version

		// // todo-9 Should we make a high level call here? Comment-202502043 relates.
		// (bool isSuccess_, ) =
		// 	address(stakingWalletCosmicSignatureNft).call{value: msg.value}(
		// 		abi.encodeWithSelector(IStakingWalletCosmicSignatureNft.deposit.selector)
		// 	);
		// if ( ! isSuccess_ ) {
		// 	assembly {
		// 		let returnDataSize_ := returndatasize()
		// 		let freeMemoryPointer_ := mload(0x40)
		// 		returndatacopy(freeMemoryPointer_, 0, returnDataSize_)
		// 		revert (freeMemoryPointer_, returnDataSize_)
		// 	}
		// }

		// #endregion
		// #region New Version

		stakingWalletCosmicSignatureNft.deposit{value: msg.value}(roundNum);

		// #endregion
	}

	function _prepareEntropyOnce() private {
		if (_entropy.value == 0) {
			// We need this to ensure that we won't generate the same random number elsewhere.
			uint256 salt_ = 0x4ef43c4174b24de7af520348bd0510be800121470d0d4545817fc47614f3fe91;

			_entropy.value = RandomNumberHelpers.generateRandomNumberSeed() ^ salt_;
		}
	}
}
