// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./ISystemManagement.sol";

/// todo-1 Are these donations intended for the project owner to seed the game with some money?
/// todo-1 Comment.
interface IEthDonations is ICosmicSignatureGameStorage, ISystemManagement {
	/// @notice Emitted when a donation is made
	/// @param donorAddress Donor address
	/// @param amount The amount donated
	/// @param roundNum The current bidding round number. // todo-0 Should we reorder it to be the 1st param and make it indexed?
	/// todo-1 Reorder `roundNum` to the beginning.
	/// todo-1 Rename this to `EthDonated`.
	event DonationEvent(address indexed donorAddress, uint256 amount, uint256 roundNum);

	/// @notice Emitted when a donation with additional information is made
	/// @param donorAddress Donor address
	/// @param amount The amount donated
	/// @param recordId Donation record ID
	/// todo-1 Rename the above param to `recordIndex`.
	/// @param roundNum The current bidding round number.
	/// todo-1 Reorder `roundNum` to the beginning.
	/// todo-1 Rename this to `EthDonatedWithInfo`.
	event DonationWithInfoEvent(address indexed donorAddress, uint256 amount, uint256 recordId, uint256 roundNum);

	/// @notice This function allows a user to donate ETH without placing a bid
	/// todo-1 I've seen a `receive` function that is equivalent to placing a bid. So this is similar, right? Maybe cross-reference them?
	/// todo-1 Rename this to `donateEth`.
	function donate() external payable;

	/// @notice This function is similar to `donate`. In addition, it allows to provide additional information
	/// @param _data Additional information, such as a message or data
	/// todo-1 Rename the above param to `info_`.
	/// todo-1 Rename this to `donateEthWithInfo`.
	function donateWithInfo(string calldata _data) external payable;
}
