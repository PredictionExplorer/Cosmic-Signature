// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

/// @notice Functionality that handles claiming and paying bidding round main prize,
/// as well as distributing other (secondary) prizes.
interface IMainPrize is ICosmicSignatureGameStorage, IBiddingBase, IMainPrizeBase, IBidStatistics {
	/// @notice Emitted when a bidding round main prize is claimed.
	/// This event indicates that the round has ended.
	/// @param roundNum The current bidding round number.
	/// @param beneficiaryAddress The address receiving the prize.
	/// [Comment-202411254]
	/// It will be different from the bidding round main prize actual winner if the winner has failed to claim the prize
	/// within a timeout and someone else has claimed it instead.
	/// It's possible to find out from other events who is the actual winner.
	/// Comment-202411285 relates.
	/// [/Comment-202411254]
	/// @param ethPrizeAmount ETH prize amount.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	event MainPrizeClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		uint256 ethPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

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

	/// @notice Emitted when a raffle winner ETH prize becomes available to be withdrawn.
	/// The prize ETH is transferred to `prizesWallet`.
	/// @param roundNum The current bidding round number.
	/// @param winnerIndex Winner index.
	/// @param winnerAddress Winner address.
	/// @param ethPrizeAmount The ETH amount awarded.
	/// @dev Comment-202412189 applies.
	event RaffleWinnerEthPrizeAllocated(
		uint256 indexed roundNum,
		uint256 winnerIndex,
		address indexed winnerAddress,
		uint256 ethPrizeAmount
	);

	/// @notice Emitted when a raffle winner receives their CosmicSignature NFT prize.
	/// @param roundNum The current bidding round number.
	/// @param winnerIsRandomWalkNftStaker Whether the winner is a RandomWalk NFT staker or a bidder.
	/// @param winnerIndex Winner index.
	/// @param winnerAddress Winner address.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	event RaffleWinnerCosmicSignatureNftAwarded(
		uint256 indexed roundNum,
		bool winnerIsRandomWalkNftStaker,
		uint256 winnerIndex,
		address indexed winnerAddress,
		uint256 indexed prizeCosmicSignatureNftId
	);

	/// @notice Claims the current bidding round main prize.
	/// This method distributes main and secondary prizes, updates game state, and prepares to start a new bidding round.
	/// todo-1 Specify prize type in all names: claim(?:.(?!main))*?prize
	function claimMainPrize() external;

	/// @return The current main ETH prize amount, in Wei.
	function getMainEthPrizeAmount() external view returns(uint256);

	/// @return The current Chrono-Warrior ETH prize amount, in Wei.
	function getChronoWarriorEthPrizeAmount() external view returns(uint256);

	/// @return The current raffle total ETH prize amount, in Wei.
	function getRaffleTotalEthPrizeAmount() external view returns(uint256);

	/// @return The current staking total ETH reward amount, in Wei.
	function getStakingTotalEthRewardAmount() external view returns(uint256);

	/// @return The current charity ETH donation amount, in Wei.
	function getCharityEthDonationAmount() external view returns(uint256);

	// /// @return The given bidding round main prize winner address,
	// /// or zero if `roundNum_` is invalid or the round has not ended yet.
	// /// @param roundNum_ The bidding round number.
	// /// @dev Don't use this. Instead, use `prizesWallet.mainPrizeWinnerAddresses`.
	// function tryGetMainPrizeWinnerAddress(uint256 roundNum_) external view returns(address);
}
