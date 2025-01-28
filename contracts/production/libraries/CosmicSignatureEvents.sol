// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

/// @title Events.
/// @author The Cosmic Signature Development Team.
/// @notice This library contains events used throughout the Cosmic Signature contracts.
/// See also: `CosmicSignatureErrors`.
/// @dev todo-1 Everywhere, review which events params need to be declared `indexed`.
library CosmicSignatureEvents {
	// #region Charity

	/// @notice Emitted after a donation has been transferred to charity.
	/// This is used only for ETH.
	/// @param charityAddress Charity address.
	/// @param amount Amount transferred to charity.
	event FundsTransferredToCharity(address indexed charityAddress, uint256 amount);

	// #endregion
	// #region Monetary Transfers

	/// @notice This is similar to `CosmicSignatureErrors.FundTransferFailed`.
	/// @dev todo-1 +++ Make sure we use this. Otherwie comment this out.
	event FundTransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	// #endregion
}

// #endregion
