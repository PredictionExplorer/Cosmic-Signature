// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

contract MarketingWallet is Ownable, AddressValidator, IMarketingWallet {
	/// @notice The `CosmicSignatureToken` contract address.
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	/// @notice Constructor.
	/// @param token_ The `CosmicSignatureToken` contract address.
	constructor(CosmicSignatureToken token_)
		Ownable(msg.sender)
		providedAddressIsNonZero(address(token_)) {
		token = token_;
	}

	function setTokenContract(ICosmicSignatureToken newValue_) external override
		onlyOwner
		providedAddressIsNonZero(address(newValue_)) {
		token = CosmicSignatureToken(address(newValue_));
		emit TokenContractAddressChanged(newValue_);
	}

	function payReward(address marketerAddress_, uint256 amount_) external override onlyOwner {
		// Not validating that `marketerAddress_` is a nonzero. `token.transfer` will do it.

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
