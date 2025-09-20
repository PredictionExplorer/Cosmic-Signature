// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

/// @title Events.
/// @author The Cosmic Signature Development Team.
/// @notice This library contains events used by the Cosmic Signature contracts.
/// See also: `CosmicSignatureErrors`.
library CosmicSignatureEvents {
	// #region Charity

	/// @notice Emitted after a donation has been transferred to charity.
	/// This is used only for ETH.
	/// @param charityAddress Charity address.
	/// @param amount Amount transferred to charity.
	/// It can potentially be zero.
	event FundsTransferredToCharity(address indexed charityAddress, uint256 amount);

	// #endregion
	// #region Arbitrum

	/// @notice Emitted after a call to an Arbitrum precompiled contract fails.
	/// @param errStr Description of the error.
	event ArbitrumError(string errStr);

	// #endregion
	// #region Monetary Transfers

	/// @notice This is similar to `CosmicSignatureErrors.FundTransferFailed`.
	event FundTransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	// #endregion
}

// #endregion
