// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

/// @notice ETH donations to the Game contract serve the following purposes:
/// 1. Allow the project founders to seed the Game with some money.
/// 2. Allow people to advertise things.
interface IEthDonations is ICosmicSignatureGameStorage {
	/// @notice Emitted when someone donates ETH.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param amount The amount donated.
	/// It can be zero.
	/// Comment-202503113 applies.
	event EthDonated(uint256 indexed roundNum, address indexed donorAddress, uint256 amount);

	/// @notice Emitted when someone donates ETH and provides additional information.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param amount The amount donated.
	/// It can be zero.
	/// Comment-202503113 applies.
	/// @param ethDonationWithInfoRecordIndex The newly created `ethDonationWithInfoRecords` item index.
	/// @dev
	/// [Comment-202503111]
	/// Issue. One might want to eliminate all the parameters except `ethDonationWithInfoRecordIndex`,
	/// given that everything is anyway saved into an `ethDonationWithInfoRecords` item.
	/// Alternatively, one might want to add the `data` parameter
	/// and eliminate `ethDonationWithInfoRecords` and `EthDonationWithInfoRecord`.
	/// But Nick prefers the current design.
	/// [/Comment-202503111]
	event EthDonatedWithInfo(uint256 indexed roundNum, address indexed donorAddress, uint256 amount, uint256 indexed ethDonationWithInfoRecordIndex);

	/// @notice This method allows anybody to donate ETH without placing a bid.
	/// It's OK if `msg.value` is zero.
	/// [Comment-202503113]
	/// As per the Comment-202409215 preference, the logic running on the blockchain doesn't enforce a minimum donation.
	/// The enforcement is done at higher levels in the stack.
	/// [/Comment-202503113]
	/// See also: `donateEthWithInfo`, `IBidding.receive`.
	function donateEth() external payable;

	/// @notice This method is similar to `donateEth`.
	/// Comments there apply.
	/// In addition, it allows the caller to provide additional information.
	/// @param data_ Additional info in JSON format.
	/// It's OK if it's empty.
	/// We do not limit this string length, but the frontend will truncate a too long message.
	function donateEthWithInfo(string calldata data_) external payable;

	/// @return `ethDonationWithInfoRecords.length`.
	function numEthDonationWithInfoRecords() external view returns (uint256);
}
