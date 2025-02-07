// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";

/// @title Marketer reward wallet.
/// @author The Cosmic Signature Development Team.
/// @notice This wallet holds and manages CST rewards to be paid to people for marketing the project on social media
/// and to fund whatever other marketing activities. The Game contract mints a configurable CST amount to this wallet
/// on main prize claim.
/// Eventually, the project founders will transfer this wallet ownership to a treasurer appointed by the DAO.
///
/// @dev todo-1 +++ Taras dislikes the idea to eliminate this contract.
///
/// todo-1 Develop a test in which the DAO changes the owner of the marketing wallet.
/// todo-1 Ask Nick if he was able to do it with the Tally app.
/// todo-1 Discussion: https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735434912738329?thread_ts=1731872794.061669&cid=C02EDDE5UF8
/// todo-1 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735434239454529?thread_ts=1733769207.177129&cid=C02EDDE5UF8
interface IMarketingWallet is IAddressValidator {
	// /// @notice Emitted when `token` is changed.
	// /// @param newValue The new value.
	// event CosmicSignatureTokenAddressChanged(ICosmicSignatureToken indexed newValue);

	/// @notice Emitted when a CST reward is paid to a marketer.
	/// @param marketerAddress Recipient address.
	/// @param amount Amount paid.
	event RewardPaid(address indexed marketerAddress, uint256 amount);

	// /// @notice Sets `token`.
	// /// Only the contract owner is permitted to call this method.
	// /// @param newValue_ The new value.
	// function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external;

	/// @notice Pays a CST reward to a marketer.
	/// Only the contract owner is permitted to call this method.
	/// @param marketerAddress_ Recipient address.
	/// @param amount_ Amount to pay.
	/// It's OK if it's zero.
	function payReward(address marketerAddress_, uint256 amount_) external;

	/// @notice Pays CST rewards to zero or more marketers.
	/// Only the contract owner is permitted to call this method.
	/// @param marketerAddresses_ Recipient addresses.
	/// @param amount_ Amount to pay to each recipient.
	/// It's OK if it's zero.
	function payManyRewards(address[] calldata marketerAddresses_, uint256 amount_) external;

	/// @notice Pays CST rewards to zero or more marketers.
	/// Only the contract owner is permitted to call this method.
	/// @param specs_ Payment specs.
	function payManyRewards(ICosmicSignatureToken.MintSpec[] calldata specs_) external;
}
