// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { ISecondaryPrizes } from "./ISecondaryPrizes.sol";

/// @notice This contract supports claiming bidding round main prize.
interface IMainPrize is
	ICosmicSignatureGameStorage,
	IBiddingBase,
	IMainPrizeBase,
	IBidStatistics,
	ISecondaryPrizes {
	/// @notice Emitted when the main prize is claimed.
	/// This event indicates that the bidding round has ended.
	/// @param roundNum The current bidding round number.
	/// @param beneficiaryAddress The address receiving the prize.
	/// [Comment-202411254]
	/// It will be different from the main prize actual winner if the latter forgot to claim the prize
	/// within a timeout and someone else has claimed it instead.
	/// It's possible to find out from other events who is the actual winner.
	/// Comment-202411285 relates.
	/// Comment-202501249 relates.
	/// [/Comment-202411254]
	/// @param ethPrizeAmount Main ETH prize amount.
	/// It can potentially be zero.
	/// @param prizeCosmicSignatureNftId The ID of the Cosmic Signature NFT minted and awarded.
	/// @param timeoutTimeToWithdrawSecondaryPrizes The ended bidding round's timeout time to withdraw prizes
	/// from `PrizesWallet`.
	event MainPrizeClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		uint256 ethPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId,
		uint256 timeoutTimeToWithdrawSecondaryPrizes
	);

	/// @notice Claims the current bidding round main prize.
	/// This method distributes main and secondary, a.k.a. special (non-main) prizes
	/// and updates the Game contract state to start another bidding round.
	/// Only the last bidder is permitted to call this method after `mainPrizeTime` comes,
	/// but after a timeout expires anybody is welcomed to.
	function claimMainPrize() external;

	/// @return The current main ETH prize amount, in Wei.
	/// It can potentially be zero.
	function getMainEthPrizeAmount() external view returns (uint256);

	/// @return The current charity ETH donation amount, in Wei.
	/// It can potentially be zero.
	/// @dev This probably doesn't belong to `ISecondaryPrizes`.
	/// One might want to move this to a yet another separate interface and respective contract, but let's keep it simple.
	function getCharityEthDonationAmount() external view returns (uint256);
}
