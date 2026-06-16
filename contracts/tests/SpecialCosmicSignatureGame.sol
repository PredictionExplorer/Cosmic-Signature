// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { RandomNumberHelpers } from "../production/libraries/RandomNumberHelpers.sol";
import { ICosmicSignatureNft } from "../production/interfaces/ICosmicSignatureNft.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

/// @notice
/// [Comment-202606027]
/// This contract is used in tests to create special test setups.
/// [/Comment-202606027]
contract SpecialCosmicSignatureGame is CosmicSignatureGame {
	/// @dev
	/// [Comment-202606028]
	/// Issue. Random number related logic in this test contract is kinda lousy, but keeping it simple.
	/// [/Comment-202606028]
	RandomNumberHelpers.RandomNumberSeedWrapper private _entropy;

	/// @dev
	/// [Comment-202606037]
	/// Issue. This is a hack. The existence of this method silences the upgradeable contract validating logic
	/// invoked by OpenZeppelin's `deployProxy` method that would otherwise complain about
	/// missing initializer and/or missing initializer call.
	/// Despite validating this method, `deployProxy` will then call `initialize`.
	/// [/Comment-202606037]
	function dummyInitialize() external initializer() {
		revert ("This method is not intended to be called.");
		this.initialize(address(0));
	}

	function mintCosmicSignatureNft(address nftOwnerAddress_) external {
		_prepareEntropyOnce();
		unchecked { ++ _entropy.value; }
		// Using a low-level call preserves the return-data bubbling behavior described near Comment-202502043.
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

	// function depositToStakingWalletCosmicSignatureNft() external payable {
	// 	stakingWalletCosmicSignatureNft.deposit{value: msg.value}(roundNum);
	// }

	function _prepareEntropyOnce() private {
		if (_entropy.value == 0) {
			// [Comment-202606029]
			// We need this to ensure that we won't generate the same random number elsewhere.
			// [/Comment-202606029]
			uint256 salt_ = 0x4ef43c4174b24de7af520348bd0510be800121470d0d4545817fc47614f3fe91;

			_entropy.value = RandomNumberHelpers.generateRandomNumberSeed() ^ salt_;
		}
	}
}
