// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./ISystemManagement.sol";

interface IETHDonations is ICosmicSignatureGameStorage, ISystemManagement {
	/// @notice Emitted when a donation is made
	/// @param donor Donor address
	/// @param amount The amount donated
	/// @param round The current round number // todo-0 Should we make it indexed?
	event DonationEvent(address indexed donor, uint256 amount, uint256 round);

	/// @notice Emitted when a donation with additional information is made
	/// @param donor Donor address
	/// @param amount The amount donated
	/// @param recordId Donation record ID // todo-0 Should we make it indexed?
	/// @param round The current round number // todo-0 Should we make it indexed?
	event DonationWithInfoEvent(address indexed donor, uint256 amount, uint256 recordId, uint256 round);

	/// @notice This function allows a user to donate ETH without placing a bid
	/// todo-1 I've seen a `receive` function that is equivalent to placing a bid. So this is similar, right? Maybe cross-reference them?
	function donate() external payable;

	/// @notice This function is similar to `donate`. In addition, it allows to provide additional information
	/// @param _data Additional information, such as a message or data
	function donateWithInfo(string calldata _data) external payable;
}
