// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

contract MarketingWallet is Ownable, IMarketingWallet {
	/// @notice The `CosmicSignatureToken` contract address.
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	/// @notice Constructor.
	/// @param token_ The `CosmicSignatureToken` contract address.
	/// ToDo-202408114-1 applies.
	constructor(CosmicSignatureToken token_) Ownable(msg.sender) {
		require(address(token_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		token = token_;
	}

	function setTokenContract(ICosmicSignatureToken newValue_) external override onlyOwner {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		token = CosmicSignatureToken(address(newValue_));
		emit TokenContractAddressChanged(newValue_);
	}

	function payReward(address marketerAddress_, uint256 amount_) external override onlyOwner {
		// // `token.transfer` will validate this.
		// require(marketerAddress_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));

		// // Comment-202409215 applies.
		// require(amount_ > 0, CosmicSignatureErrors.NonZeroValueRequired("Amount is zero."));

		// try
		token.transfer(marketerAddress_, amount_);
		// {
		// } catch {
		// 	revert CosmicSignatureErrors.ERC20TransferFailed("Transfer failed.", marketerAddress_, amount_);
		// }
		emit RewardPaid(marketerAddress_, amount_);
	}
}
