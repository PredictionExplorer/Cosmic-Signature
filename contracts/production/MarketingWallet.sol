// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MarketingWallet - A wallet for managing CST rewards for marketing efforts
/// @author Cosmic Game Development Team
/// @notice This wallet holds CST rewards for marketing the project on social media.
/// @dev Eventually, the founders of the project will transfer this wallet ownership to the DAO.
contract MarketingWallet is Ownable {
	/// @notice Reference to the CosmicToken contract
	CosmicToken public token;

	/// @notice Emitted when a reward is sent to a marketer
	/// @param marketer Address of the reward recipient
	/// @param amount Amount of CST tokens sent as reward
	event RewardSentEvent(address indexed marketer, uint256 amount);

	/// @notice Emitted when the CosmicToken contract address is changed
	/// @param newCosmicToken Address of the new CosmicToken contract
	event CosmicTokenAddressChanged(address newCosmicToken);

	/// @notice Initializes the MarketingWallet contract
	/// @param token_ Address of the CosmicToken contract
	/// ToDo-202408114-1 applies.
	constructor(CosmicToken token_) Ownable(msg.sender) {
		require(address(token_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = token_;
	}

	/// @notice Sends CST tokens as a reward to a marketer
	/// @dev Only callable by the contract owner
	/// @param amount Amount of CST tokens to send
	/// @param to Address of the reward recipient
	function send(uint256 amount, address to) external onlyOwner {
		require(to != address(0), CosmicGameErrors.ZeroAddress("Recipient address cannot be zero."));
		require(amount > 0, CosmicGameErrors.NonZeroValueRequired("Amount must be greater than zero."));

		(bool success, ) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
		require(success, CosmicGameErrors.ERC20TransferFailed("Transfer failed.", to, amount));
		emit RewardSentEvent(to, amount);
	}

	/// @notice Updates the address of the CosmicToken contract
	/// @dev Only callable by the contract owner
	/// @param addr Address of the new CosmicToken contract
	function setTokenContract(address addr) external onlyOwner {
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = CosmicToken(addr);
		emit CosmicTokenAddressChanged(addr);
	}
}
