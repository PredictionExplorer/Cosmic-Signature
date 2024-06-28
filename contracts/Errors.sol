// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

library CosmicGameErrors {

	// System
	error SystemMode(string errStr, uint256 systemMode);

	// Bidding errors
	error BidPrice(string errStr,uint256 amountRequired, uint256 amountSent);
	error BidMessageLengthOverflow(string errStr,uint256 msgLength);
	error UsedRandomWalkNFT(string errStr,uint256 randomWalkTokenId);

	// Claim prize errors
	error EarlyClaim(string errStr,uint256 claimTime, uint256 blockTimestamp);
	error LastBidderOnly(string errStr,address lastBidder,address bidder);
	error NoLastBidder(string errStr);
	error NonExistentDonatedNFT(string errStr,uint256 num);
	error NonExistentWinner(string errStr,uint256 num);
	error NFTAlreadyClaimed(string errStr,uint256 num);

	// Game logic errors
	error CallToBusinessLogicFailed(string errStr,address businessLogicAddr,bytes4 selector);
	error ActivationTime(string errStr,uint256 activationTime, uint256 blockTimestamp);
	error PercentageValidation(string errStr,uint256 percentageSum);

	// Token-related errors
	error ERC20Mint(string errStr, address receiver, uint256 tokenAmoumnt);
	error ERC20TransferFailed(string errStr,address receiver, uint256 tokenAmount);
	error ERC721Mint(string errStr, address receiver, uint256 roundNum);
	error TokenNameLength(string errStr, uint256 len);
	error NoMintPrivileges(string errStr,address requester);
	error IncorrectERC721TokenOwner(string errStr,address contractAddr, uint256 tokenId,address sender);
	error OwnershipError(string errStr,uint256 tokenId);

	// Zero-checking
	error NonZeroValueRequired(string errStr);
	error ZeroAddress(string errStr);
	error ZeroBalance(string errStr);

	// Monetary transfers
	error FundTransferFailed(string errStr,uint256 amount, address destination);
	error DepositFromUnauthorizedSender(string errStr,address sender);

	// Staking
	error TokenAlreadyUnstaked(string errStr,uint256 actionId);
	error TokenNotUnstaked(string errStr, uint256 actionId);
	error DepositAlreadyClaimed(string errStr,uint256 actionId,uint256 depositId);
	error DepositOutsideStakingWindow(string errStr,uint256 actionId,uint256 depositId,uint256 stakeStart,uint256 stakeEnd,uint256 depositDate);
	error AccessError(string errStr,uint256 actionId,address requester);
	error EarlyUnstake(string errStr,uint256 actionId,uint256 unstakeTiemstamp,uint256 blockTimestamp);
	error InvalidActionId(string errStr,uint256 actionId);
	error InvalidDepositId(string errStr,uint256 depositId);
	error IncorrectArrayArguments(string errStr,uint256 actionsLen,uint256 depositsLen);
	error ModuloIsZero(string errStr);
	error TokenAlreadyInserted(string errStr,uint256 tokenId,uint256 actionId);
	error TokenAlreadyDeleted(string errStr,uint256 tokenId);
	error NoTokensStaked(string errStr);
}
