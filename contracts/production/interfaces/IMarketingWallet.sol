// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";

/// @title Marketing Wallet.
/// @author The Cosmic Signature Development Team.
/// @notice This wallet holds and facilitates the distribution of CST funds used to fund marketing activities,
/// including rewarding people for marketing the project on social media.
/// The `CosmicSignatureGame` contract mints a configurable CST amount for this wallet at the end of each bidding round.
///
/// @dev todo-1 +++ Taras dislikes the idea to eliminate this contract.
///
/// todo-1 +++ Develop a test in which the DAO changes `MarketingWallet.treasurerAddress`.
interface IMarketingWallet is IAddressValidator {
	/// @notice Emitted when `treasurerAddress` is changed.
	/// @param newValue The new value.
	event TreasurerAddressChanged(address indexed newValue);

	/// @notice Emitted when a CST reward is paid to a marketer.
	/// @param marketerAddress Recipient address.
	/// @param amount Amount paid.
	/// It can potentially be zero.
	event RewardPaid(address indexed marketerAddress, uint256 amount);

	/// @notice Sets `treasurerAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTreasurerAddress(address newValue_) external;

	/// @notice Pays a CST reward to a marketer.
	/// Only the treasurer is permitted to call this method.
	/// @param marketerAddress_ Recipient address.
	/// @param amount_ Amount to pay.
	/// It's OK if it's zero.
	function payReward(address marketerAddress_, uint256 amount_) external;

	/// @notice Pays CST rewards to zero or more marketers.
	/// Only the treasurer is permitted to call this method.
	/// @param marketerAddresses_ Recipient addresses.
	/// @param amount_ Amount to pay to each recipient.
	/// It's OK if it's zero.
	function payManyRewards(address[] calldata marketerAddresses_, uint256 amount_) external;

	/// @notice Pays CST rewards to zero or more marketers.
	/// Only the treasurer is permitted to call this method.
	/// @param specs_ Payment specs.
	function payManyRewards(ICosmicSignatureToken.MintSpec[] calldata specs_) external;
}
