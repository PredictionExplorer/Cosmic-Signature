// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

/// @notice ETH donations serve 2 purposes:
/// 1. Allow the project founders to seed the game with some money.
/// 2. Allow people to advertise things.
/// As Comment-202409215 says, we do not enforce a minimum donation in the logic running on the blockchain,
/// but we do so at higher levels in the stack.
interface IEthDonations is ICosmicSignatureGameStorage {
	/// @notice Emitted when someone donates ETH.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param amount The amount donated.
	event EthDonated(uint256 indexed roundNum, address indexed donorAddress, uint256 amount);

	/// @notice Emitted when someone donates ETH and provides additional information.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param amount The amount donated.
	/// @param ethDonationWithInfoRecordIndex The newly created `ethDonationWithInfoRecords` item index.
	/// @dev Issue. Yuriy would prefer to include the provided data in this event and not store anything in the contract state.
	/// But Nick prefers the things to be the way they are.
	event EthDonatedWithInfo(uint256 indexed roundNum, address indexed donorAddress, uint256 amount, uint256 indexed ethDonationWithInfoRecordIndex);

	/// @notice This method allows anybody to donate ETH without placing a bid.
	/// It's OK if `msg.value` is zero.
	/// See also: `donateEthWithInfo`, `ICosmicSignatureGame.receive`.
	function donateEth() external payable;

	/// @notice In addition to what `donateEth` does, this method allows the caller to provide additional information.
	/// @param data_ Additional info in JSON format.
	function donateEthWithInfo(string calldata data_) external payable;

	function numEthDonationWithInfoRecords() external view returns (uint256);
}
