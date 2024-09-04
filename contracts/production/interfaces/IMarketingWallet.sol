// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { ICosmicToken } from "./ICosmicToken.sol";

/// @title A wallet for managing CST rewards for marketing efforts
/// @author Cosmic Game Development Team
/// @notice This wallet holds CST rewards for marketing the project on social media
/// @dev Eventually, the founders of the project will transfer this wallet ownership to the DAO
interface IMarketingWallet {
	/// @notice Emitted when the CosmicToken contract address is changed
	/// @param newCosmicToken Address of the new CosmicToken contract
	event CosmicTokenAddressChanged(ICosmicToken newCosmicToken);

	/// @notice Emitted when a reward is sent to a marketer
	/// @param marketer Address of the reward recipient
	/// @param amount Amount of CST tokens sent as reward
	event RewardSentEvent(address indexed marketer, uint256 amount);

	/// @notice Updates the address of the CosmicToken contract
	/// @dev Only callable by the contract owner
	/// @param addr Address of the new CosmicToken contract
	function setTokenContract(ICosmicToken addr) external;

	/// @notice Sends CST tokens as a reward to a marketer
	/// @dev Only callable by the contract owner
	/// @param amount Amount of CST tokens to send
	/// @param to Address of the reward recipient
	function send(uint256 amount, address to) external;
}
