// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { RandomNumberHelpers } from "../production/libraries/RandomNumberHelpers.sol";
import { ICosmicSignatureNft } from "../production/interfaces/ICosmicSignatureNft.sol";
import { CosmicSignatureGameV2 } from "../production/CosmicSignatureGameV2.sol";

/// @notice Comment-202606027 applies.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract SpecialCosmicSignatureGameV2 is CosmicSignatureGameV2 {
	/// @dev Comment-202606028 applies.
	RandomNumberHelpers.RandomNumberSeedWrapper private _entropy;

	function mintCosmicSignatureNft(address nftOwnerAddress_) external {
		_prepareEntropyOnce();
		unchecked { ++ _entropy.value; }
		// todo-3 Should we make a high level call here? Comment-202502043 relates.
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
			// Comment-202606029 applies.
			uint256 salt_ = 0x4ef43c4174b24de7af520348bd0510be800121470d0d4545817fc47614f3fe91;

			_entropy.value = RandomNumberHelpers.generateRandomNumberSeed() ^ salt_;
		}
	}
}
