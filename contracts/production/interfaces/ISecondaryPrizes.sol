// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

/// @title Secondary Prizes.
interface ISecondaryPrizes is ICosmicSignatureGameStorage {
	/// @notice Emitted when the last CST bidder receives their prize.
	/// @param roundNum The current bidding round number.
	/// @param lastCstBidderAddress The last CST bidder address.
	/// @param cstPrizeAmount The amount of the Cosmic Signature Token minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the Cosmic Signature NFT minted and awarded.
	event LastCstBidderPrizePaid(
		uint256 indexed roundNum,
		address indexed lastCstBidderAddress,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @notice Emitted when Endurance Champion receives their prize.
	/// @param roundNum The current bidding round number.
	/// @param enduranceChampionAddress Endurance Champion address.
	/// @param cstPrizeAmount The amount of the Cosmic Signature Token minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the Cosmic Signature NFT minted and awarded.
	event EnduranceChampionPrizePaid(
		uint256 indexed roundNum,
		address indexed enduranceChampionAddress,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @notice Emitted when Chrono-Warrior receives their prize.
	/// The ETH is transferred to `prizesWallet`.
	/// @param roundNum The current bidding round number.
	/// @param winnerIndex Winner index.
	/// [Comment-202511097]
	/// It's unique per round across `ChronoWarriorPrizePaid` and `RaffleWinnerBidderEthPrizeAllocated` events --
	/// to act as `PrizesWallet` ETH deposit ID that `PrizesWallet` will echo with its `EthReceived` event.
	/// [/Comment-202511097]
	/// @param chronoWarriorAddress Chrono-Warrior address.
	/// @param ethPrizeAmount The ETH prize amount.
	/// It can potentially be zero.
	/// @param cstPrizeAmount The amount of the Cosmic Signature Token minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the Cosmic Signature NFT minted and awarded.
	event ChronoWarriorPrizePaid(
		uint256 indexed roundNum,
		uint256 winnerIndex,
		address indexed chronoWarriorAddress,
		uint256 ethPrizeAmount,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @notice Emitted when a raffle winner among bidders ETH prize becomes available to be withdrawn.
	/// The ETH is transferred to `prizesWallet`.
	/// @param roundNum The current bidding round number.
	/// @param winnerIndex Winner index.
	/// Comment-202511097 applies.
	/// @param winnerAddress Winner address.
	/// @param ethPrizeAmount The ETH prize amount.
	/// It can potentially be zero.
	/// @dev Using the word "Allocated" instead of something like "Paid" because we transfer the ETH to `prizesWallet`,
	/// rather than to the winner directly.
	event RaffleWinnerBidderEthPrizeAllocated(
		uint256 indexed roundNum,
		uint256 winnerIndex,
		address indexed winnerAddress,
		uint256 ethPrizeAmount
	);

	/// @notice Emitted when a raffle winner receives their prize.
	/// @param roundNum The current bidding round number.
	/// @param winnerIsRandomWalkNftStaker Whether the winner is a Random Walk NFT staker or a bidder.
	/// @param winnerIndex Winner index.
	/// Unique among all events of this type per unique combination of `roundNum` and `winnerIsRandomWalkNftStaker`.
	/// Comment-202511097 does not apply.
	/// @param winnerAddress Winner address.
	/// @param cstPrizeAmount The amount of the Cosmic Signature Token minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the Cosmic Signature NFT minted and awarded.
	event RaffleWinnerPrizePaid(
		uint256 indexed roundNum,
		bool winnerIsRandomWalkNftStaker,
		uint256 winnerIndex,
		address indexed winnerAddress,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @return The current Chrono-Warrior ETH prize amount, in Wei.
	/// It can potentially be zero.
	function getChronoWarriorEthPrizeAmount() external view returns (uint256);

	/// @return The current raffle total ETH prize amount for bidders, in Wei.
	/// It can potentially be zero.
	function getRaffleTotalEthPrizeAmountForBidders() external view returns (uint256);

	/// @return The current Cosmic Signature NFT staking total ETH reward amount, in Wei.
	/// It can potentially be zero.
	function getCosmicSignatureNftStakingTotalEthRewardAmount() external view returns (uint256);
}
