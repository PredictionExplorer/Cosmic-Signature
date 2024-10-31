// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { ICosmicToken } from "./ICosmicToken.sol";

/// @title A wallet for managing CST rewards for marketing efforts
/// @author Cosmic Game Development Team
/// @notice This wallet holds CST rewards for marketing the project on social media
/// Eventually, the founders of the project will transfer this wallet ownership to the DAO
/// @dev
/// [ToDo-202411182-1]
/// We mint CST for this wallet on each bid, which I dislike.
/// One problem is that a lot of gas is wasted.
/// This needs a redesign.
/// Parameters:
///    Amount to pay for marketing effort, such as 50 CST.
///    Max allowed rewards that are available to be paid immediately, such as 5.
///    Frequency to create 1 reward, such as 1 a day. Do not create a reward if the max is already available.
///    A collection of addresses to be paid to. Some might need to wait until a reward becomes available.
///       The owner can add any number of addresses to it.
/// Then a peson will withdraw their reward when it becomes available. The withdrawal involves minting for `msg.sender`.
/// [/ToDo-202411182-1]

	/// todo-1 Would it be better to mint this amount multiplied by the number of bids only on main prize claim? It would save gas.
	/// todo-1 Although the practice of minting per bid is questionable. The number of bids per round can vary.
	/// todo-1 Would it be better to mint a fixed amount per a period of time?
	/// todo-1 But I would redesign marketing wallet to mint the funds for the given address, with some time constraints,
	/// todo-1 like no more than 100 tokens per day.
	/// todo-1 Or marketing wallet can reproduce the current minting logic by evaluating game state.

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
