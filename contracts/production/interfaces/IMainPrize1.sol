// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @notice Comment-202607102 applies.
interface IMainPrize1 {
	/// @notice Claims the current bidding round main prize.
	/// This method distributes main and secondary prizes
	/// and updates the Game contract state to begin another bidding round.
	/// The prizes are documented in `${workspaceFolder}/docs/cosmic-signature-game-prizes.md`.
	/// Only the last bidder is permitted to call this method after `mainPrizeTime` comes,
	/// but after a timeout expires anybody is welcomed to.
	function claimMainPrize() external;

	/// @return The current main ETH prize amount.
	/// It can potentially be zero.
	function getMainEthPrizeAmount() external view returns (uint256);

	/// @return The current charity ETH donation amount.
	/// It can potentially be zero.
	/// @dev I feel, this doesn't belong to `ISecondaryPrizes`.
	/// One might want to move this to a yet another separate interface and respective contract, but let's keep it simple.
	function getCharityEthDonationAmount() external view returns (uint256);
}
