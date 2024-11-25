// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

library CosmicSignatureEvents {
	/// @notice This is similar to `CosmicSignatureErrors.FundTransferFailed`.
	/// @dev todo-1 Make sure we use this. Otherwie comment this out.
	event FundTransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	/// @notice This is similar to `CosmicSignatureErrors.ERC20TransferFailed`.
	/// @dev todo-1 Make sure we use this. Otherwie comment this out.
	event ERC20TransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	/// @notice Emitted after a fund transfer to charity.
	/// @param charityAddress Charity address.
	/// @param amount Amount transferred to charity.
	/// @dev ToDo-202409212-1 relates.
	event FundsTransferredToCharity(address indexed charityAddress, uint256 amount);
}
