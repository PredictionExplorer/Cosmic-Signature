// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Custom errors.
/// @author Cosmic Signature Development Team.
/// @notice This library contains custom errors used throughout the Cosmic Signature contracts.
/// @dev Use these errors to provide more detailed and gas-efficient error handling.
library CosmicGameErrors {
	// #region Common Errors

	error UnknownError(string errStr);

	/// @notice Thrown when an operation is not possible in the current contract state.
	/// @param errStr Description of the error
	/// @dev In .NET, `InvalidOperationException` serves the same purpose.
	error InvalidOperationInCurrentState(string errStr);

	/// @notice Thrown when an unauthorized caller calls a privileged method.
	/// @param errStr Description of the error.
	/// @param callerAddress Caller address.
	error CallDenied(string errStr, address callerAddress);

	// #endregion
	// #region System Errors

	// /// @notice Thrown when an action is attempted in an incorrect system mode.
	// /// @param errStr Description of the error.
	// /// @param systemMode The current system mode.
	// error SystemMode(string errStr, uint256 systemMode);

	/// @notice Thrown when an action is attempted before the bidding round activation time.
	/// @param errStr Description of the error.
	/// @param activationTime The activation time.
	/// @param blockTimeStamp The current block timestamp.
	error SystemIsInactive(string errStr, uint256 activationTime, uint256 blockTimeStamp);

	/// @notice Thrown when an action is attempted at or after the bidding round activation time.
	/// @param errStr Description of the error.
	/// @param activationTime The activation time.
	/// @param blockTimeStamp The current block timestamp.
	error SystemIsActive(string errStr, uint256 activationTime, uint256 blockTimeStamp);

	/// @notice Thrown when an action is attempted that is not allowed after someone has already placed a bid
	/// in the current bidding round.
	/// @param errStr Description of the error.
	error BidHasBeenPlacedInCurrentRound(string errStr);

	// /// @notice Thrown when an attempt is made to set Starting Bid Price in CST Minimum Limit to a too small value.
	// /// @param errStr Description of the error
	// /// @param providedValue The actual provided value
	// /// @param valueHardMinLimit The required minimum limit imposed on the value (that's a min limit on another min limit)
	// error ProvidedStartingBidPriceCSTMinLimitIsTooSmall(string errStr, uint256 providedValue, uint256 valueHardMinLimit);

	/// @notice Thrown when percentage validation fails
	/// @param errStr Description of the error
	/// @param percentageSum The sum of percentages (should be 100)
	error PercentageValidation(string errStr, uint256 percentageSum);

	// #endregion
	// #region Bidding Errors

	/// @notice Thrown when the bid price is incorrect
	/// todo-1 Incorrect or too low? Rename to make it clear? Fix the comment too.
	/// @param errStr Description of the error
	/// @param amountRequired The required bid amount
	/// @param amountSent The amount actually sent
	error BidPrice(string errStr, uint256 amountRequired, uint256 amountSent);

	/// @notice Thrown when the bid message length exceeds the maximum allowed
	/// @param errStr Description of the error
	/// @param msgLength The length of the provided message
	/// @dev todo-1 I dislike the word `Overflow`.
	error BidMessageLengthOverflow(string errStr, uint256 msgLength);

	/// @notice Thrown when attempting to use an already used RandomWalk NFT
	/// @param errStr Description of the error
	/// @param randomWalkTokenId The ID of the RandomWalk NFT
	error UsedRandomWalkNFT(string errStr, uint256 randomWalkTokenId);

	// /// @notice Thrown when the bidder has insufficient CST balance
	// /// @param errStr Description of the error
	// /// @param requiredAmount The required CST amount
	// /// @param senderBalance The actual balance of the sender
	// error InsufficientCSTBalance(string errStr, uint256 requiredAmount, uint256 senderBalance);

	/// @notice Thrown when an invalid bidder query offset is provided
	/// @param errStr Description of the error
	/// @param providedRoundNum The provided bidding round number.
	/// @param providedOffset The offset provided
	/// @param numParticipants The number of participants in the round
	error InvalidBidderQueryOffset(
		string errStr,
		uint256 providedRoundNum,
		uint256 providedOffset,
		uint256 numParticipants
	);

	/// @notice Thrown when an invalid bidder query bidding round number is provided.
	/// @param errStr Description of the error.
	/// @param providedRoundNum The provided bidding round number.
	/// @param currentRoundNum The current bidding round number.
	error InvalidBidderQueryRoundNum(string errStr, uint256 providedRoundNum, uint256 currentRoundNum);

	/// @notice Thrown when the bidder query offset overflows
	/// @param errStr Description of the error
	/// @param providedOffset The offset provided
	/// @param offsetFromStart The offset from the start
	/// @dev todo-1 I dislike the word `Overflow`.
	error BidderQueryOffsetOverflow(string errStr, uint256 providedOffset, uint256 offsetFromStart);

	/// @notice Thrown when querying bidders for a round with no bids yet
	/// @param errStr Description of the error
	/// @param providedRoundNum The provided bidding round number.
	error BidderQueryNoBidsYet(string errStr, uint256 providedRoundNum);

	// #endregion
	// #region Claim Prize Errors

	/// @notice Thrown when attempting to claim a bidding round main prize too early.
	/// See also: `EarlyWithdrawal`.
	/// @param errStr Description of the error.
	/// @param claimTime The time when claiming is allowed.
	/// todo-1 Name it better. It should be named like the respective storage variable. Or see how I named this in `EarlyWithdrawal`.
	/// @param blockTimeStamp The current block timestamp.
	/// @dev todo-1 Rename to `RoundMainPrizeEarlyClaim`.
	error EarlyClaim(string errStr, uint256 claimTime, uint256 blockTimeStamp);

	/// @notice Thrown when someone other than the last bidder attempts to claim the prize
	/// @param errStr Description of the error
	/// @param lastBidderAddress Last bidder address.
	/// @param beneficiaryAddress The address that attempted to claim the prize.
	/// @param timeToWait The time left to wait before claiming is allowed
	/// todo-1 Rename the param to `durationToWait`. Or how the function to calculate it is named?
	error LastBidderOnly(string errStr, address lastBidderAddress, address beneficiaryAddress, uint256 timeToWait);

	/// @notice Thrown when there is no last bidder
	/// @param errStr Description of the error
	error NoLastBidder(string errStr);

	// /// @notice Thrown when the provided bidding round number is invalid.
	// /// @param errStr Description of the error.
	// /// @param roundNum Provided bidding round number.
	// error InvalidRoundNum(string errStr, uint256 roundNum);

	/// @notice Thrown when attempting to withdraw a prize or whatever too early.
	/// See also: `EarlyClaim`.
	/// @param errStr Description of the error.
	/// @param operationAllowedTime The time when this operation will be allowed.
	/// @param blockTimeStamp The current block timestamp.
	error EarlyWithdrawal(string errStr, uint256 operationAllowedTime, uint256 blockTimeStamp);

	/// @notice Thrown when someone attempts to claim an ERC-20 token donation, but is not permitted to do so.
	/// @param errStr Description of the error.
	/// @param roundNum Bidding round number.
	/// @param beneficiaryAddress The address that attempted to claim the donation.
	/// @param tokenAddress The ERC-20 contract address.
	error DonatedTokenClaimDenied(string errStr, uint256 roundNum, address beneficiaryAddress, IERC20 tokenAddress);

	/// @notice Thrown when someone attempts to claim a donated NFT, but is not permitted to do so.
	/// @param errStr Description of the error.
	/// @param beneficiaryAddress The address that attempted to claim the donation.
	/// @param index Donated NFT index in an array.
	error DonatedNftClaimDenied(string errStr, address beneficiaryAddress, uint256 index);

	/// @notice Thrown when attempting to claim a non-existent donated NFT.
	/// @param errStr Description of the error.
	/// @param index `donatedNfts` non-existent item index.
	error InvalidDonatedNftIndex(string errStr, uint256 index);

	/// @notice Thrown when attempting to claim an already claimed donated NFT.
	/// @param errStr Description of the error.
	/// @param index `donatedNfts` item index.
	error DonatedNftAlreadyClaimed(string errStr, uint256 index);

	// #endregion
	// #region Game Logic Errors

	// /// @notice Thrown when a call to the business logic contract fails
	// /// @param errStr Description of the error
	// /// @param businessLogicAddress The address of the business logic contract
	// /// @param selector The function selector that failed
	// error CallToBusinessLogicFailed(string errStr, address businessLogicAddress, bytes4 selector);

	// #endregion
	// #region Token-Related Errors

	// /// @notice Thrown when ERC20 token minting fails
	// /// @param errStr Description of the error
	// /// @param receiverAddress The intended receiver of the tokens
	// /// @param tokenAmount The amount of tokens to mint
	// error ERC20Mint(string errStr, address receiverAddress, uint256 tokenAmount);

	/// @notice Thrown when an ERC20 token transfer fails
	/// See also: `CosmicGameEvents.ERC20TransferFailed`
	/// @param errStr Description of the error
	/// @param destinationAddress The intended receiver of the tokens
	/// @param amount The amount of tokens to transfer
	error ERC20TransferFailed(string errStr, address destinationAddress, uint256 amount);

	/// @notice Thrown when ERC721 token minting fails
	/// @param errStr Description of the error
	/// @param receiverAddress The intended receiver of the token
	/// @param roundNum The bidding round number for the token.
	/// todo-1 Reorder `roundNum` to after `errStr`?
	error ERC721Mint(string errStr, address receiverAddress, uint256 roundNum);

	/// @notice Thrown when the token name length is invalid
	/// @param errStr Description of the error
	/// @param len The length of the token name
	error TokenNameLength(string errStr, uint256 len);

	/// @notice Thrown when an address without minting privileges attempts to mint
	/// @param errStr Description of the error
	/// @param requesterAddress The address attempting to mint
	error NoMintPrivileges(string errStr, address requesterAddress);

	/// @notice Thrown when the token owner is incorrect
	/// @param errStr Description of the error
	/// @param nftAddress NFT contract address.
	/// @param nftId The ID of the token
	/// @param senderAddress The address of the sender
	error IncorrectERC721TokenOwner(string errStr, address nftAddress, uint256 nftId, address senderAddress);

	/// @notice Thrown when there's an ownership error for an NFT.
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
	/// todo-1 Explain better what it attempts to access.
	/// @param errStr Description of the error
	/// @param stakeActionId The ID of the action
	/// @param requesterAddress The address of the requester
	error NftStakeActionAccessDenied(string errStr, uint256 stakeActionId, address requesterAddress);

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
	// /// @param newValue Address value to be set
	// error AddressAlreadySet(string errStr, address newValue);

	error NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange(string errStr, uint256 numEthDepositsToEvaluateMaxLimit);

	// #endregion
}
