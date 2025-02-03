// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

/// @title Secondary (non-main) prizes.
interface ISecondaryPrizes is ICosmicSignatureGameStorage {
	/// @notice Emitted when the last CST bidder receives their prize.
	/// @param roundNum The current bidding round number.
	/// @param lastCstBidderAddress The last CST bidder address.
	/// @param cstPrizeAmount The amount of CosmicSignature Tokens minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	event LastCstBidderPrizePaid(
		uint256 indexed roundNum,
		address indexed lastCstBidderAddress,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @notice Emitted when the Endurance Champion receives their prize.
	/// @param roundNum The current bidding round number.
	/// @param enduranceChampionAddress Endurance Champion address.
	/// @param cstPrizeAmount The amount of CosmicSignature Tokens minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	event EnduranceChampionPrizePaid(
		uint256 indexed roundNum,
		address indexed enduranceChampionAddress,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @notice Emitted when the Chrono-Warrior ETH prize becomes available to be withdrawn.
	/// The prize ETH is transferred to `prizesWallet`.
	/// @param roundNum The current bidding round number.
	/// @param chronoWarriorAddress Chrono-Warrior address.
	/// @param ethPrizeAmount The ETH amount awarded.
	/// @dev
	/// [Comment-202412189]
	/// Using the word "Allocated" instead of something like "Paid" because we transfer the ETH to `prizesWallet`,
	/// rather than to the winner directly.
	/// [/Comment-202412189]
	event ChronoWarriorPrizeAllocated(
		uint256 indexed roundNum,
		address indexed chronoWarriorAddress,
		uint256 ethPrizeAmount
	);

	/// @notice Emitted when a raffle winner among bidders ETH prize becomes available to be withdrawn.
	/// The prize ETH is transferred to `prizesWallet`.
	/// @param roundNum The current bidding round number.
	/// @param winnerIndex Winner index.
	/// @param winnerAddress Winner address.
	/// @param ethPrizeAmount The ETH amount awarded.
	/// @dev Comment-202412189 applies.
	event RaffleWinnerBidderEthPrizeAllocated(
		uint256 indexed roundNum,
		uint256 winnerIndex,
		address indexed winnerAddress,
		uint256 ethPrizeAmount
	);

	/// @notice Emitted when a raffle winner receives their CosmicSignature NFT prize.
	/// @param roundNum The current bidding round number.
	/// @param winnerIsRandomWalkNftStaker Whether the winner is a RandomWalk NFT staker or a bidder.
	/// @param winnerIndex Winner index.
	/// Issue. Should it be declared `indexed`? But there are already 3 params like that.
	/// @param winnerAddress Winner address.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	event RaffleWinnerCosmicSignatureNftAwarded(
		uint256 indexed roundNum,
		bool winnerIsRandomWalkNftStaker,
		uint256 winnerIndex,
		address indexed winnerAddress,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @return The current Chrono-Warrior ETH prize amount, in Wei.
	function getChronoWarriorEthPrizeAmount() external view returns(uint256);

	/// @return The current raffle total ETH prize amount for bidders, in Wei.
	function getRaffleTotalEthPrizeAmountForBidders() external view returns(uint256);

	/// @return The current Cosmic Signature NFT staking total ETH reward amount, in Wei.
	function getCosmicSignatureNftStakingTotalEthRewardAmount() external view returns(uint256);
}
