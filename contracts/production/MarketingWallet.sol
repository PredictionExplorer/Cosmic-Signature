// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { ICosmicToken } from "./interfaces/ICosmicToken.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

contract MarketingWallet is Ownable, IMarketingWallet {
	/// @notice `CosmicToken` contract address.
	/// Comment-202411064 applies.
	CosmicToken public token;

	/// @notice Constructor.
	/// @param token_ `CosmicToken` contract address.
	/// ToDo-202408114-1 applies.
	constructor(CosmicToken token_) Ownable(msg.sender) {
		require(address(token_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = token_;
	}

	function setTokenContract(ICosmicToken newValue_) external override onlyOwner {
		require(address(newValue_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = CosmicToken(address(newValue_));
		emit TokenContractAddressChanged(newValue_);
	}

	function payReward(address marketerAddress_, uint256 amount_) external override onlyOwner {
		// // `token.transfer` will validate this.
		// require(marketerAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));

		// // Comment-202409215 applies.
		// require(amount_ > 0, CosmicGameErrors.NonZeroValueRequired("Amount is zero."));

		// try
		token.transfer(marketerAddress_, amount_);
		// {
		// } catch {
		// 	revert CosmicGameErrors.ERC20TransferFailed("Transfer failed.", marketerAddress_, amount_);
		// }
		emit RewardPaid(marketerAddress_, amount_);
	}
}
