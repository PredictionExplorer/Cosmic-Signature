// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { ICosmicToken } from "./interfaces/ICosmicToken.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

contract MarketingWallet is Ownable, IMarketingWallet {
	/// @notice Reference to the CosmicToken contract
	CosmicToken public token;

	/// @notice Initializes the MarketingWallet contract
	/// @param token_ Address of the CosmicToken contract
	/// ToDo-202408114-1 applies.
	constructor(CosmicToken token_) Ownable(msg.sender) {
		require(address(token_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = token_;
	}

	function setTokenContract(ICosmicToken addr) external override onlyOwner {
		require(address(addr) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = CosmicToken(address(addr));
		emit CosmicTokenAddressChanged(addr);
	}

	function send(uint256 amount, address to) external override onlyOwner {
		require(to != address(0), CosmicGameErrors.ZeroAddress("Recipient address cannot be zero."));
		require(amount > 0, CosmicGameErrors.NonZeroValueRequired("Amount must be greater than zero."));

		// todo-0 Do we really need to cast `token` here?
		try IERC20(token).transfer(to, amount) {
		} catch {
			revert CosmicGameErrors.ERC20TransferFailed("Transfer failed.", to, amount);
		}
		emit RewardSentEvent(to, amount);
	}
}
