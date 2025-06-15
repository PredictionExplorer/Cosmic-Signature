// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// #endregion
// #region

/// @title Custom errors.
/// @author The Cosmic Signature Development Team.
/// @notice This library contains custom errors used by the Cosmic Signature contracts.
/// See also: `CosmicSignatureEvents`.
/// @dev Using these custom errors to implement more detailed and gas-efficient error reporting.
library CosmicSignatureErrors {
	// #region Bidding

	/// @notice Thrown when an action is attempted before the current bidding round activation time.
	/// @param errStr Description of the error.
	/// @param roundActivationTime The current bidding round activation time.
	/// @param blockTimeStamp The current block timestamp.
	error RoundIsInactive(string errStr, uint256 roundActivationTime, uint256 blockTimeStamp);

	/// @notice Thrown when an action is attempted at or after the current bidding round activation time.
	/// @param errStr Description of the error.
	/// @param roundActivationTime The current bidding round activation time.
	/// @param blockTimeStamp The current block timestamp.
	error RoundIsActive(string errStr, uint256 roundActivationTime, uint256 blockTimeStamp);

	/// @notice Thrown when an action is attempted that is not allowed before someone places a bid
	/// in the current bidding round.
	/// @param errStr Description of the error.
	error NoBidsPlacedInCurrentRound(string errStr);

	/// @notice Thrown when an action is attempted that is not allowed after someone has already placed a bid
	/// in the current bidding round.
	/// @param errStr Description of the error.
	error BidHasBeenPlacedInCurrentRound(string errStr);

	/// @notice Thrown when someone attempts to place a bid of a type that is not currently allowed.
	/// @param errStr Description of the error.
	error WrongBidType(string errStr);

	/// @notice Thrown when the amount received for a bid is less than the current bid price.
	/// This is used for both ETH and CST bids.
	/// @param errStr Description of the error.
	/// @param bidPrice The current bid price.
	/// @param receivedAmount The amount the bidder transferred to us.
	/// It can potentially be zero.
	error InsufficientReceivedBidAmount(string errStr, uint256 bidPrice, uint256 receivedAmount);

	/// @notice Thrown when the provided bid message length exceeds the maximum allowed.
	/// See also: `TooLongNftName`.
	/// @param errStr Description of the error.
	/// @param messageLength The provided message length.
	/// Comment-202409143 relates.
	error TooLongBidMessage(string errStr, uint256 messageLength);

	/// @notice Thrown when attempting to use an already used Random Walk NFT.
	/// See also: `NftHasAlreadyBeenStaked`.
	/// @param errStr Description of the error.
	/// @param randomWalkNftId Random Walk NFT ID.
	error UsedRandomWalkNft(string errStr, uint256 randomWalkNftId);

	/// @notice Thrown when the caller is not the given NFT owner.
	/// See also: `CallerIsNotAuthorizedToManageNft`.
	/// @param errStr Description of the error.
	/// @param nftAddress NFT contract address.
	/// @param nftId NFT ID.
	/// @param callerAddress Caller address.
	error CallerIsNotNftOwner(string errStr, IERC721 nftAddress, uint256 nftId, address callerAddress);

	// #endregion
	// #region Main Prize

	/// @notice Thrown when attempting to claim the main prize too early.
	/// See also: `EarlyWithdrawal`.
	/// @param errStr Description of the error.
	/// @param mainPrizeTime The time when this operation will be permitted.
	/// @param blockTimeStamp The current block timestamp.
	error MainPrizeEarlyClaim(string errStr, uint256 mainPrizeTime, uint256 blockTimeStamp);

	/// @notice Thrown when someone other than the last bidder attempts to claim the main prize before a timeout expires.
	/// See also: `DonatedTokenClaimDenied`, `DonatedNftClaimDenied`.
	/// @param errStr Description of the error.
	/// @param lastBidderAddress The last bidder address.
	/// @param beneficiaryAddress The address that attempted to claim the prize.
	/// @param durationUntilOperationIsPermitted The duration until this operation will be permitted.
	error MainPrizeClaimDenied(string errStr, address lastBidderAddress, address beneficiaryAddress, uint256 durationUntilOperationIsPermitted);

	// #endregion
	// #region Cosmic Signature NFT

	// /// @notice Thrown when the caller is not authorized to manage or spend an NFT.
	// /// See also: `CallerIsNotNftOwner`.
	// /// @param errStr Description of the error.
	// /// @param nftId NFT ID.
	// /// @dev I have eliminated this error and instead calling the `ERC721._checkAuthorized` method,
	// /// which can throw the `IERC721Errors.ERC721InsufficientApproval` error.
	// error CallerIsNotAuthorizedToManageNft(string errStr, uint256 nftId);

	/// @notice Thrown when the provided NFT name length exceeds the maximum allowed.
	/// See also: `TooLongBidMessage`.
	/// @param errStr Description of the error.
	/// @param nftNameLength The NFT name length.
	/// Comment-202409143 relates.
	error TooLongNftName(string errStr, uint256 nftNameLength);

	// #endregion
	// #region Prizes Wallet

	/// @notice Thrown when attempting to withdraw a prize or whatever too early.
	/// See also: `MainPrizeEarlyClaim`.
	/// @param errStr Description of the error.
	/// @param operationPermittedTime The time when this operation will be permitted.
	/// @param blockTimeStamp The current block timestamp.
	error EarlyWithdrawal(string errStr, uint256 operationPermittedTime, uint256 blockTimeStamp);

	/// @notice Thrown when someone attempts to claim an ERC-20 token donation, but is not permitted to do so.
	/// See also: `MainPrizeClaimDenied`, `DonatedNftClaimDenied`.
	/// @param errStr Description of the error.
	/// @param roundNum Bidding round number.
	/// @param beneficiaryAddress The address that attempted to claim the donation.
	/// @param tokenAddress The ERC-20 contract address.
	error DonatedTokenClaimDenied(string errStr, uint256 roundNum, address beneficiaryAddress, IERC20 tokenAddress);

	/// @notice Thrown when attempting to claim a non-existent donated NFT.
	/// @param errStr Description of the error.
	/// @param index `donatedNfts` non-existent item index.
	error InvalidDonatedNftIndex(string errStr, uint256 index);

	/// @notice Thrown when someone attempts to claim a donated NFT, but is not permitted to do so.
	/// See also: `MainPrizeClaimDenied`, `DonatedTokenClaimDenied`.
	/// @param errStr Description of the error.
	/// @param beneficiaryAddress The address that attempted to claim the donation.
	/// @param index `donatedNfts` item index.
	error DonatedNftClaimDenied(string errStr, address beneficiaryAddress, uint256 index);

	/// @notice Thrown when attempting to claim an already claimed donated NFT.
	/// @param errStr Description of the error.
	/// @param index `donatedNfts` item index.
	error DonatedNftAlreadyClaimed(string errStr, uint256 index);

	// #endregion
	// #region NFT Staking

	// todo-1 +++ Keep commented.
	// /// @notice Thrown when there are no staked NFTs.
	// /// @param errStr Description of the error.
	// error NoStakedNfts(string errStr);

	/// @notice Thrown when there are still staked NFTs.
	/// @param errStr Description of the error.
	error ThereAreStakedNfts(string errStr);

	/// @notice Thrown when attempting to stake an NFT that has already been staked in the past.
	/// See also: `UsedRandomWalkNft`.
	/// @param errStr Description of the error.
	/// @param nftId NFT ID.
	error NftHasAlreadyBeenStaked(string errStr, uint256 nftId);

	// todo-1 +++ Keep commented.
	// /// @notice Thrown when attempting to claim a staking reward for an NFT that hasn't been unstaked.
	// /// @param errStr Description of the error.
	// /// @param stakeActionId NFT stake action ID.
	// error NftNotUnstaked(string errStr, uint256 stakeActionId);

	// todo-1 +++ Keep commented.
	// /// @notice Thrown when attempting to unstake an already unstaked NFT.
	// /// @param errStr Description of the error.
	// /// @param stakeActionId NFT stake action ID.
	// error NftAlreadyUnstaked(string errStr, uint256 stakeActionId);

	/// @notice Thrown when an invalid NFT stake action ID is provided.
	/// @param errStr Description of the error.
	/// @param stakeActionId The invalid value.
	error NftStakeActionInvalidId(string errStr, uint256 stakeActionId);

	/// @notice Thrown when an unauthorized caller attempts to access an NFT stake action.
	/// @param errStr Description of the error.
	/// @param stakeActionId NFT stake action ID.
	/// @param callerAddress Caller address.
	error NftStakeActionAccessDenied(string errStr, uint256 stakeActionId, address callerAddress);

	// #endregion
	// #region Security

	/// @notice Thrown when an unauthorized caller attempts to call a restricted method.
	/// @param errStr Description of the error.
	/// @param callerAddress Caller address.
	/// @dev todo-1 +++ We don't have any other errors of this kind, right? If I find any, try to eliminate them.
	error UnauthorizedCaller(string errStr, address callerAddress);

	// #endregion
	// #region Monetary Transfers

	/// @notice Thrown when a fund transfer fails.
	/// This is used only for ETH.
	/// See also: `CosmicSignatureEvents.FundTransferFailed`.
	/// @param errStr Description of the error.
	/// @param destinationAddress The intended destination of the funds.
	/// @param amount The amount to transfer.
	/// It can potentially be zero.
	error FundTransferFailed(string errStr, address destinationAddress, uint256 amount);

	// #endregion
	// #region Zero Checking

	/// @notice Thrown when a nonzero address is required, but zero is observed.
	/// @param errStr Description of the error.
	error ZeroAddress(string errStr);

	// /// @notice Thrown when a nonzero value is required, but zero is observed.
	// /// @param errStr Description of the error.
	// error ZeroValue(string errStr);

	// /// @notice Thrown when a nonzero balance amount is required, but zero is observed.
	// /// @param errStr Description of the error.
	// /// todo-9 Rename this to `ZeroBalanceAmount`.
	// error ZeroBalance(string errStr);

	// #endregion
	// #region Common

	// error UnknownError(string errStr);

	// /// @notice Thrown when an operation is not possible in the current contract state.
	// /// @param errStr Description of the error.
	// /// @dev In .NET, `InvalidOperationException` serves the same purpose.
	// error InvalidOperationInCurrentState(string errStr);

	/// @notice Thrown when percentage values exceed the maximum allowed.
	/// @param errStr Description of the error.
	/// @param percentageSum The sum of percentages that exceeds the limit.
	error PercentageValidation(string errStr, uint256 percentageSum);

	// #endregion
}

// #endregion
