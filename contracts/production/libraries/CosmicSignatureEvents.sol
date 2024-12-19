// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @dev todo-1 Everywhere, review which events params need to be declared `indexed`.
library CosmicSignatureEvents {
	/// @notice This is similar to `CosmicSignatureErrors.FundTransferFailed`.
	/// @dev todo-1 Make sure we use this. Otherwie comment this out.
	event FundTransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	// /// @notice This is similar to `CosmicSignatureErrors.ERC20TransferFailed`.
	// event ERC20TransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	/// @notice Emitted after a fund transfer to charity.
	/// @param charityAddress Charity address.
	/// @param amount Amount transferred to charity.
	/// @dev ToDo-202409212-1 relates.
	event FundsTransferredToCharity(address indexed charityAddress, uint256 amount);
}
