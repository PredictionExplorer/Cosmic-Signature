// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

library CosmicGameEvents {
	/// @notice This is similar to `CosmicGameErrors.FundTransferFailed`
	/// @dev todo-1 Here and in `CosmicGameErrors.FundTransferFailed`, maybe swap `amount` and `destination`.
	/// todo-1 Make sure we use this. Otherwie comment this out.
	/// @dev todo-1 Consider swapping `amount` and `destination`.
	event FundTransferFailed(string errStr, uint256 amount, address indexed destination);

	/// @notice Emitted after a fund transfer to charity
	/// @param amount Amount transferred to charity
	/// @param charityAddress Charity address
	/// @dev todo-1 Consider swapping `amount` and `charityAddress`.
	/// todo-1 Do we really need the word "Event" at the end? If we do all events should be named like this.
	/// ToDo-202409212-1 relates.
	event FundsTransferredToCharityEvent(uint256 amount, address indexed charityAddress);

	/// @notice This is similar to `CosmicGameErrors.ERC20TransferFailed`
	/// @dev todo-1 Make sure we use this. Otherwie comment this out.
	event ERC20TransferFailed(string errStr, address indexed receiver, uint256 tokenAmount);
}
