// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

/// @title Events.
/// @author The Cosmic Signature Development Team.
/// @notice This library contains events used by the Cosmic Signature contracts.
/// See also: `CosmicSignatureErrors`.
library CosmicSignatureEvents {
	// #region Charity

	/// @notice This is similar to `CosmicSignatureErrors.EthTransferToCharityFailed`.
	event EthTransferToCharityFailed(address indexed charityAddress, uint256 amount);

	/// @notice Emitted after a donation has been transferred to charity.
	/// This is used only for ETH.
	/// @param charityAddress Charity address.
	/// @param amount Amount transferred to charity.
	/// It can potentially be zero.
	/// @dev
	/// [Comment-202609146]
	/// One might want to rename `Fund` to `Eth`.
	/// But this is used in some already deployed contracts, so Comment-202609134 applies.
	/// Comment-202609144 relates.
	/// [/Comment-202609146]
	event FundsTransferredToCharity(address indexed charityAddress, uint256 amount);

	// #endregion
	// #region Monetary Transfers

	/// @notice This is similar to `CosmicSignatureErrors.FundTransferFailed`.
	/// @dev Comment-202609144 applies.
	event FundTransferFailed(string errStr, address indexed destinationAddress, uint256 amount);

	// #endregion
}

// #endregion
