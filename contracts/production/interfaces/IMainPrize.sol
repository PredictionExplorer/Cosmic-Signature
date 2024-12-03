// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./ISystemManagement.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

interface IMainPrize is ICosmicSignatureGameStorage, ISystemManagement, IBidStatistics {
	/// @notice Emitted when a bidding round main prize is claimed.
	/// This event indicates that the round has ended.
	/// @param roundNum The current bidding round number.
	/// @param beneficiaryAddress The address receiving the prize.
	/// [Comment-202411254]
	/// It will be different from the bidding round main prize actual winner if the winner has failed to claim the prize
	/// within a timeout and someone else claimed it instead.
	/// It's possible to find out from other events who is the actual winner.
	/// Comment-202411285 relates.
	/// [/Comment-202411254]
	/// @param ethPrizeAmount ETH prize amount.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	/// @dev todo-1 Rename to `RoundMainPrizeClaimed`. Actully leave it alone.
	event MainPrizeClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		uint256 ethPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId
	);

	// /// @notice Emitted when the Stellar Spender receives their prize.
	// /// @param stellarSpender Stellar Spender address.
	// /// @param roundNum The bidding round number.
	// /// todo-1 Make sense to reorder `roundNum` to the beginning?
	// /// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	// /// @param cstPrizeAmount The amount of CosmicSignature Tokens minted and awarded.
	// /// @param totalSpentCst The total CST amount spent by the winner.
	// /// ---param winnerIndex Winner index.
	// /// todo-1 What is this `winnerIndex` thing? We do need it for raffle winners, but not here. Commented out.
	// event StellarSpenderPrizePaid(
	// 	address indexed stellarSpender,
	// 	uint256 indexed roundNum,
	// 	uint256 indexed prizeCosmicSignatureNftId,
	// 	uint256 cstPrizeAmount,
	// 	uint256 totalSpentCst
	// 	// uint256 winnerIndex
	// );

	/// @notice Emitted when the last CST bidder receives their prize.
	/// @param roundNum The bidding round number.
	/// @param lastCstBidderAddress The last CST bidder address.
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	/// @param cstPrizeAmount The amount of CosmicSignature Tokens minted and awarded.
	event LastCstBidderPrizePaid(
		uint256 indexed roundNum,
		address indexed lastCstBidderAddress,
		uint256 indexed prizeCosmicSignatureNftId,
		uint256 cstPrizeAmount
	);

	/// @dev todo-0 I renamed this and changed params. Tell Nick.
	/// @notice Emitted when the Endurance Champion receives their prize.
	/// @param enduranceChampion Endurance Champion address.
	/// @param roundNum The bidding round number.
	/// todo-1 Make sense to reorder `roundNum` to the beginning?
	/// @param prizeCosmicSignatureNftId The ID of the CosmicSignature NFT minted and awarded.
	/// @param cstPrizeAmount The amount of CosmicSignature Tokens minted and awarded.
	/// ---param winnerIndex Winner index.
	/// todo-1 What is this `winnerIndex` thing? We do need it for raffle winners, but not here. Commented out.
	event EnduranceChampionPrizePaid(
		address indexed enduranceChampion,
		uint256 indexed roundNum,
		uint256 indexed prizeCosmicSignatureNftId,
		uint256 cstPrizeAmount
		// uint256 winnerIndex
	);

	/// @notice Emitted when the Chrono-Warrior receives their prize. The prize ETH is transferred to `EthPrizesWalet`.
	/// @param chronoWarrior Chrono-Warrior address.
	/// @param roundNum The bidding round number.
	/// @param ethPrizeAmount The ETH amount awarded.
	event ChronoWarriorPrizePaid(
		address indexed chronoWarrior,
		uint256 indexed roundNum,
		uint256 ethPrizeAmount
	);

	/// @notice Emitted when an ETH raffle winner is selected
	/// @param winnerAddress The address of the winner
	/// @param roundNum The bidding round number.
	/// todo-1 Make sense to reorder `roundNum` and `winnerIndex` to the beginning?
	/// @param winnerIndex The index of the winner
	/// @param amount ETH amount.
	/// @dev todo-1 Name this better. Remove the word "Event".
	event RaffleETHWinnerEvent(address indexed winnerAddress, uint256 indexed roundNum, uint256 winnerIndex, uint256 amount);

	/// @notice Emitted when an NFT raffle winner is selected
	/// @param winnerAddress The address of the winner
	/// @param roundNum The bidding round number.
	/// todo-1 Make sense to reorder `roundNum` and `winnerIndex` to the beginning?
	/// @param nftId The ID of the NFT won
	/// todo-1 Rename the above param to `prizeCosmicSignatureNftId`.
	/// @param winnerIndex The index of the winner
	/// @param isStaker Whether the winner is a staker
	/// todo-1 Should the above param type be an enum?
	/// @param isRWalk Whether the NFT is a RandomWalk NFT
	/// todo-1 Rename the above param to `isRandomWalkNft`.
	/// todo-1 Actually the above param always equals `isStaker`, right? So remove it.
	/// @dev todo-1 Name this better. Remove the word "Event". Maybe `RaffleNftPrizeMinted`.
	event RaffleNftWinnerEvent(
		address indexed winnerAddress,
		uint256 indexed roundNum,
		uint256 indexed nftId,
		uint256 winnerIndex,
		bool isStaker,
		bool isRWalk
	);

	/// @notice Claim the prize for the current round
	/// @dev This function distributes prizes, updates game state, and starts a new round
	/// todo-1 Rename to `claimMainPrize`.
	/// todo-1 Specify prize type everywhere: claim(?:.(?!main))*?prize
	function claimPrize() external;

	/// @return The current main prize amount, in Wei.
	/// todo-1 Rename this to `getMainEthPrizeAmount`.
	function mainPrizeAmount() external view returns(uint256);

	/// @return The current Chrono-Warrior ETH prize amount, in Wei.
	/// todo-1 Rename this to `getChronoWarriorEthPrizeAmount`.
	function chronoWarriorEthPrizeAmount() external view returns(uint256);

	/// @return The current raffle amount, in Wei.
	/// todo-1 Rename this to `getRaffleEthPrizeAmount`.
	function raffleAmount() external view returns(uint256);

	/// @return The current staking amount, in Wei.
	/// todo-1 Rename this to `getStakingEthRewardAmount`.
	function stakingAmount() external view returns(uint256);

	/// @return The current charity amount, in Wei.
	/// todo-1 Rename this to `getCharityEthAmount`.
	function charityAmount() external view returns(uint256);

	/// @notice Get the time until the next prize can be claimed
	/// @return The number of seconds until the prize can be claimed, or 0 if claimable now
	/// todo-1 Rename this to `getDurationUntilMainPrize`.
	function timeUntilPrize() external view returns(uint256);

	/// @return The given bidding round main prize winner address,
	/// or zero if `roundNum_` is invalid or the round has not ended yet.
	/// @param roundNum_ The bidding round number.
	/// @dev todo-1 Eliminate this method?
	function tryGetRoundMainPrizeWinnerAddress(uint256 roundNum_) external view returns(address);
}
