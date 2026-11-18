// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

/// @notice The fixed game and collateral shared by a ChaosZero market and its outcome source.
interface IChaosZeroBinding {
	function game() external view returns (address);
	function cst() external view returns (address);
}

interface IChaosZeroMarket is IChaosZeroBinding {
	function source() external view returns (IChaosZeroBinding);
}
