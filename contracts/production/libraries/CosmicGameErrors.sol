// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

/// @title CosmicGameErrors - Custom error library for the Cosmic Game
/// @author Cosmic Game Development Team
/// @notice This library contains custom errors used throughout the Cosmic Game contracts
/// @dev Use these errors to provide more detailed and gas-efficient error handling
library CosmicGameErrors {
	// #region Common Errors

	error UnknownError(string errStr);

	/// @notice Thrown when an operation is not possible in the current contract state.
	/// @param errStr Description of the error
	/// @dev In .NET, `InvalidOperationException` serves the same purpose.
	error InvalidOperationInCurrentState(string errStr);

	// #endregion
	// #region System Errors

	/// @notice Thrown when an action is attempted in an incorrect system mode
	/// @param errStr Description of the error
	/// @param systemMode The current system mode
	error SystemMode(string errStr, uint256 systemMode);

	// #endregion
	// #region Bidding Errors

	/// @notice Thrown when the bid price is incorrect
	/// @param errStr Description of the error
	/// @param amountRequired The required bid amount
	/// @param amountSent The amount actually sent
	error BidPrice(string errStr, uint256 amountRequired, uint256 amountSent);

	/// @notice Thrown when the bid message length exceeds the maximum allowed
	/// @param errStr Description of the error
	/// @param msgLength The length of the provided message
	error BidMessageLengthOverflow(string errStr, uint256 msgLength);

	/// @notice Thrown when attempting to use an already used RandomWalk NFT
	/// @param errStr Description of the error
	/// @param randomWalkTokenId The ID of the RandomWalk NFT
	error UsedRandomWalkNFT(string errStr, uint256 randomWalkTokenId);

	/// @notice Thrown when an attempt is made to set Starting Bid Price in CST Minimum Limit to a too small value.
	/// @param errStr Description of the error
	/// @param providedValue The actual provided value
	/// @param valueMinLimit The required minimum limit imposed on the value (that's a min limit on another min limit)
	error ProvidedStartingBidPriceCSTMinLimitIsTooSmall(string errStr, uint256 providedValue, uint256 valueMinLimit);

	// /// @notice Thrown when the bidder has insufficient CST balance
	// /// @param errStr Description of the error
	// /// @param requiredAmount The required CST amount
	// /// @param senderBalance The actual balance of the sender
	// error InsufficientCSTBalance(string errStr, uint256 requiredAmount, uint256 senderBalance);

	/// @notice Thrown when an invalid bidder query offset is provided
	/// @param errStr Description of the error
	/// @param providedRoundNum The round number provided
	/// @param providedOffset The offset provided
	/// @param numParticipants The number of participants in the round
	error InvalidBidderQueryOffset(
		string errStr,
		uint256 providedRoundNum,
		uint256 providedOffset,
		uint256 numParticipants
	);

	/// @notice Thrown when an invalid bidder query round number is provided.
	/// @param errStr Description of the error.
	/// @param providedRoundNum The provided round number.
	/// @param currentRoundNum The current round number.
	error InvalidBidderQueryRoundNum(string errStr, uint256 providedRoundNum, uint256 currentRoundNum);

	/// @notice Thrown when the bidder query offset overflows
	/// @param errStr Description of the error
	/// @param providedOffset The offset provided
	/// @param offsetFromStart The offset from the start
	error BidderQueryOffsetOverflow(string errStr, uint256 providedOffset, uint256 offsetFromStart);

	/// @notice Thrown when querying bidders for a round with no bids yet
	/// @param errStr Description of the error
	/// @param providedRoundNum The round number provided
	error BidderQueryNoBidsYet(string errStr, uint256 providedRoundNum);

	// #endregion
	// #region Claim Prize Errors

	/// @notice Thrown when attempting to claim a prize too early
	/// @param errStr Description of the error
	/// @param claimTime The time when claiming is allowed
	/// @param blockTimestamp The current block timestamp
	error EarlyClaim(string errStr, uint256 claimTime, uint256 blockTimestamp);

	/// @notice Thrown when someone other than the last bidder attempts to claim the prize
	/// @param errStr Description of the error
	/// @param lastBidder The address of the last bidder
	/// @param bidder The address of the caller
	/// @param timeToWait The time left to wait before claiming is allowed
	error LastBidderOnly(string errStr, address lastBidder, address bidder, uint256 timeToWait);

	/// @notice Thrown when there is no last bidder
	/// @param errStr Description of the error
	error NoLastBidder(string errStr);

	/// @notice Thrown when attempting to claim a non-existent donated NFT
	/// @param errStr Description of the error
	/// @param index The index of the non-existent NFT
	error InvalidDonatedNFTIndex(string errStr, uint256 index);

	/// @notice Thrown when a non-existent winner attempts to claim a prize
	/// @param errStr Description of the error
	/// @param index The index of the donated token
	error NonExistentWinner(string errStr, uint256 index);

	/// @notice Thrown when attempting to claim an already claimed NFT
	/// @param errStr Description of the error
	/// @param index The index of the already claimed NFT
	error NFTAlreadyClaimed(string errStr, uint256 index);

	// #endregion
	// #region Game Logic Errors

	/// @notice Thrown when a call to the business logic contract fails
	/// @param errStr Description of the error
	/// @param businessLogicAddr The address of the business logic contract
	/// @param selector The function selector that failed
	error CallToBusinessLogicFailed(string errStr, address businessLogicAddr, bytes4 selector);

	/// @notice Thrown when an action is attempted before the activation time
	/// @param errStr Description of the error
	/// @param activationTime The activation time of the game
	/// @param blockTimestamp The current block timestamp
	error ActivationTime(string errStr, uint256 activationTime, uint256 blockTimestamp);

	/// @notice Thrown when percentage validation fails
	/// @param errStr Description of the error
	/// @param percentageSum The sum of percentages (should be 100)
	error PercentageValidation(string errStr, uint256 percentageSum);

	// #endregion
	// #region Token-Related Errors

	// /// @notice Thrown when ERC20 token minting fails
	// /// @param errStr Description of the error
	// /// @param receiver The intended receiver of the tokens
	// /// @param tokenAmount The amount of tokens to mint
	// error ERC20Mint(string errStr, address receiver, uint256 tokenAmount);

	/// @notice Thrown when an ERC20 token transfer fails
	/// See also: `CosmicGameEvents.ERC20TransferFailed`
	/// @param errStr Description of the error
	/// @param destinationAddress The intended receiver of the tokens
	/// @param amount The amount of tokens to transfer
	error ERC20TransferFailed(string errStr, address destinationAddress, uint256 amount);

	/// @notice Thrown when ERC721 token minting fails
	/// @param errStr Description of the error
	/// @param receiver The intended receiver of the token
	/// @param roundNum The round number for the token
	error ERC721Mint(string errStr, address receiver, uint256 roundNum);

	/// @notice Thrown when the token name length is invalid
	/// @param errStr Description of the error
	/// @param len The length of the token name
	error TokenNameLength(string errStr, uint256 len);

	/// @notice Thrown when an address without minting privileges attempts to mint
	/// @param errStr Description of the error
	/// @param requester The address attempting to mint
	error NoMintPrivileges(string errStr, address requester);

	/// @notice Thrown when the token owner is incorrect
	/// @param errStr Description of the error
	/// @param contractAddr The address of the token contract
	/// @param nftId The ID of the token
	/// @param sender The address of the sender
	error IncorrectERC721TokenOwner(string errStr, address contractAddr, uint256 nftId, address sender);

	/// @notice Thrown when there's an ownership error for a token
	/// @param errStr Description of the error
	/// @param nftId The ID of the token
	error OwnershipError(string errStr, uint256 nftId);

	// #endregion
	// #region Zero Checking Errors

	/// @notice Thrown when a non-zero value is required but zero is provided
	/// @param errStr Description of the error
	error NonZeroValueRequired(string errStr);

	/// @notice Thrown when a non-zero address is required but the zero address is provided
	/// @param errStr Description of the error
	error ZeroAddress(string errStr);

	/// @notice Thrown when a non-zero balance is required but the balance is zero
	/// @param errStr Description of the error
	error ZeroBalance(string errStr);

	// #endregion
	// #region Monetary Transfer Errors

	/// @notice Thrown when a fund transfer fails
	/// See also: `CosmicGameEvents.FundTransferFailed`
	/// @param errStr Description of the error
	/// @param destinationAddress The intended destination of the funds
	/// @param amount The amount that failed to transfer
	error FundTransferFailed(string errStr, address destinationAddress, uint256 amount);

	/// @notice Thrown when a deposit is attempted from an unauthorized sender
	/// @param errStr Description of the error
	/// @param sender The address of the unauthorized sender
	error DepositFromUnauthorizedSender(string errStr, address sender);

	// #endregion
	// #region NFT Staking Errors

	/// @notice Thrown when attempting to unstake an already unstaked NFT
	/// @param errStr Description of the error
	/// @param stakeActionId NFT stake action ID
	error NftAlreadyUnstaked(string errStr, uint256 stakeActionId);

	/// @notice Thrown when attempting to claim a reward for a token that hasn't been unstaked
	/// @param errStr Description of the error
	/// @param stakeActionId NFT stake action ID
	error NftNotUnstaked(string errStr, uint256 stakeActionId);

	// /// @notice Thrown when attempting to claim an already claimed deposit
	// /// @param errStr Description of the error
	// /// @param stakeActionId NFT stake action ID
	// /// @param depositId The ID of the deposit
	// error DepositAlreadyClaimed(string errStr, uint256 stakeActionId, uint256 depositId);

	// error NftStakingRewardAlreadyPaid(string errStr, uint256 stakeActionId);

	// /// @notice Thrown when a deposit is outside the staking window
	// /// @param errStr Description of the error
	// /// @param stakeActionId NFT stake action ID
	// /// @param depositId The ID of the deposit
	// /// @param stakeStart The start time of the stake
	// /// @param stakeEnd The end time of the stake
	// /// @param depositDate The date of the deposit
	// error DepositOutsideStakingWindow(
	// 	string errStr,
	// 	uint256 stakeActionId,
	// 	uint256 depositId,
	// 	uint256 stakeStart,
	// 	uint256 stakeEnd,
	// 	uint256 depositDate
	// );

	/// @notice Thrown when an unauthorized address attempts to access a function
	/// @param errStr Description of the error
	/// @param stakeActionId The ID of the action
	/// @param requester The address of the requester
	error NftStakeActionAccessDenied(string errStr, uint256 stakeActionId, address requester);

	/// @notice Thrown when an invalid NFT stake action ID is provided
	/// @param errStr Description of the error
	/// @param stakeActionId The invalid value
	error NftStakeActionInvalidId(string errStr, uint256 stakeActionId);

	// /// @notice Thrown when an invalid deposit ID is provided
	// /// @param errStr Description of the error
	// /// @param depositId The invalid deposit ID
	// error EthDepositInvalidId(string errStr, uint256 depositId);

	// /// @notice Thrown when the lengths of action and deposit arrays do not match
	// /// @param errStr Description of the error
	// /// @param actionsLen The length of the actions array
	// /// @param depositsLen The length of the deposits array
	// error IncorrectArrayArguments(string errStr, uint256 actionsLen, uint256 depositsLen);

	// /// @notice Thrown when attempting to insert an already inserted token
	// /// @param errStr Description of the error
	// /// @param nftId The ID of the token
	// /// @param stakeActionId The ID of the action
	// error TokenAlreadyInserted(string errStr, uint256 nftId, uint256 stakeActionId);

	// /// @notice Thrown when attempting to delete an already deleted token
	// /// @param errStr Description of the error
	// /// @param nftId The ID of the token
	// error TokenAlreadyDeleted(string errStr, uint256 nftId);

	/// @notice Thrown when there are no staked NFTs
	/// @param errStr Description of the error
	error NoStakedNfts(string errStr);

	/// @notice Thrown when attempting to stake an NFT more than once
	/// @param errStr Description of the error
	/// @param nftId The ID of the token
	error NftOneTimeStaking(string errStr, uint256 nftId);

	// /// @notice Thrown when attempting to set address that have already been set
	// /// @param errStr Description of the error
	// /// @param addr Address value to be set
	// error AddressAlreadySet(string errStr, address addr);

	error NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange(string errStr, uint256 numEthDepositsToEvaluateMaxLimit);

	// #endregion
}
