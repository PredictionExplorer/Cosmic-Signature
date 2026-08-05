// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

interface IMainPrizeCommon {
	function getInitialDurationUntilMainPrize() external view returns (uint256);

	/// @notice This is a "friendly" version of `getDurationUntilMainPrizeRaw` that can't return a negative value.
	/// Comments near `getDurationUntilMainPrizeRaw` apply.
	/// todo-0 Maybe eliminate this method to reduce contract size.
	/// todo-0 Rename `getDurationUntilMainPrizeRaw` to `getDurationUntilMainPrize`. It will remain `public`.
	/// todo-0 Tell Nick.
	/// todo-0 Also, to reduce contract size, make everything `unchecked`.
	function getDurationUntilMainPrize() external view returns (uint256);

	/// @notice See also: `getDurationUntilMainPrize`.
	/// @return The number of seconds until the last bidder will be permitted to claim the main prize,
	/// or a non-positive value if that time has already come.
	/// Comment-202501022 applies.
	function getDurationUntilMainPrizeRaw() external view returns (int256);

	function getMainPrizeTimeIncrement() external view returns (uint256);
}
