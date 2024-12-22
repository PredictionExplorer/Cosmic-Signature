// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";

/// @title Marketer reward wallet.
/// @author The Cosmic Signature Development Team.
/// @notice This wallet holds and manages CST rewards to be paid to people for marketing the project on social media.
/// Eventually, the project founders will transfer this wallet ownership to the DAO.
/// @dev
/// [ToDo-202411182-1]
/// We mint CST for this wallet on each bid, which I dislike.
/// One problem is that a lot of gas is wasted.
/// This needs a redesign.
///
/// ---Parameters:
/// ---   Amount to pay for marketing effort, such as 50 CST.
/// ---   Max allowed rewards that are available to be paid immediately, such as 5.
/// ---   Frequency to create 1 reward, such as 1 a day. Do not create a reward if the max is already available.
/// ---   A collection of addresses to be paid to. Some might need to wait until a reward becomes available.
/// ---      The owner can add any number of addresses to it.
/// ---Then a person will withdraw their reward when it becomes available. The withdrawal involves minting for `msg.sender`.
/// ---Then the game won't need to store an address of this in its storage.
/// 
/// No, the above is not necessarily a good idea.
/// Better simply send all CST bids to marketing wallet, or in case it already has enough, just burn any new received amounts.
/// [/ToDo-202411182-1]
interface IMarketingWallet is IAddressValidator {
	/// @notice Emitted when `token` is changed.
	/// @param newValue The new value.
	event CosmicSignatureTokenAddressChanged(ICosmicSignatureToken newValue);

	/// @notice Emitted when a CST reward is paid to a marketer.
	/// @param marketerAddress Recipient address.
	/// @param amount Amount paid.
	event RewardPaid(address indexed marketerAddress, uint256 amount);

	/// @notice Sets `token`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// todo-1 Maybe eliminate this method and declare `token` `immutable`.
	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external;

	/// @notice Pays a CST reward to a marketer.
	/// Only the contract owner is permitted to call this method.
	/// @param marketerAddress_ Recipient address.
	/// @param amount_ Amount to pay.
	/// @dev todo-1 Do we need a method to transfer to multiple addresses?
	function payReward(address marketerAddress_, uint256 amount_) external;
}
