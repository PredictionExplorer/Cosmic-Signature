// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { ICosmicSignatureNft } from "./ICosmicSignatureNft.sol";
import { IPrizesWallet } from "./IPrizesWallet.sol";
import { IStakingWalletRandomWalkNft } from "./IStakingWalletRandomWalkNft.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";

/// @title Cosmic Signature Game Configuration Management.
/// @author The Cosmic Signature Development Team.
interface ISystemManagement is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	IBiddingBase {
	/// @notice Sets `delayDurationBeforeRoundActivation`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setDelayDurationBeforeRoundActivation(uint256 newValue_) external;

	/// @notice Sets `roundActivationTime`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// @dev Comment-202411236 relates and/or applies.
	/// Comment-202411168 relates and/or applies.
	function setRoundActivationTime(uint256 newValue_) external;

	/// @notice Sets `ethDutchAuctionDurationDivisor`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setEthDutchAuctionDurationDivisor(uint256 newValue_) external;

	function setEthDutchAuctionEndingBidPriceDivisor(uint256 newValue_) external;

	/// @notice Sets `nextEthBidPriceIncreaseDivisor`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setNextEthBidPriceIncreaseDivisor(uint256 newValue_) external;

	/// @notice Sets `ethBidRefundAmountInGasMinLimit`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setEthBidRefundAmountInGasMinLimit(uint256 newValue_) external;

	/// @notice Sets `cstDutchAuctionDurationDivisor`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCstDutchAuctionDurationDivisor(uint256 newValue_) external;

	function setCstDutchAuctionBeginningBidPriceMinLimit(uint256 newValue_) external;

	/// @notice Sets `bidMessageLengthMaxLimit`.
	/// Only the contract owner is permitted to call this method.
	/// Comment-202409143 applies.
	/// @param newValue_ The new value.
	function setBidMessageLengthMaxLimit(uint256 newValue_) external;

	/// @notice Sets `cstRewardAmountForBidding`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCstRewardAmountForBidding(uint256 newValue_) external;

	/// @notice Sets `cstRewardAmountMultiplier`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCstRewardAmountMultiplier(uint256 newValue_) external;

	/// @notice Sets `chronoWarriorEthPrizeAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setChronoWarriorEthPrizeAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `raffleTotalEthPrizeAmountForBiddersPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRaffleTotalEthPrizeAmountForBiddersPercentage(uint256 newValue_) external;

	function setNumRaffleEthPrizesForBidders(uint256 newValue_) external;

	function setNumRaffleCosmicSignatureNftsForBidders(uint256 newValue_) external;

	function setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(uint256 newValue_) external;

	/// @notice Sets `cosmicSignatureNftStakingTotalEthRewardAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `initialDurationUntilMainPrizeDivisor`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setInitialDurationUntilMainPrizeDivisor(uint256 newValue_) external;

	/// @notice Sets `mainPrizeTimeIncrementInMicroSeconds`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMainPrizeTimeIncrementInMicroSeconds(uint256 newValue_) external;

	/// @notice Sets `mainPrizeTimeIncrementIncreaseDivisor`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMainPrizeTimeIncrementIncreaseDivisor(uint256 newValue_) external;

	/// @notice Sets `timeoutDurationToClaimMainPrize`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external;

	/// @notice Sets `mainEthPrizeAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMainEthPrizeAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `token`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external;

	/// @notice Sets `randomWalkNft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRandomWalkNft(IRandomWalkNFT newValue_) external;

	/// @notice Sets `nft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCosmicSignatureNft(ICosmicSignatureNft newValue_) external;

	/// @notice Sets `prizesWallet`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setPrizesWallet(IPrizesWallet newValue_) external;

	/// @notice Sets `stakingWalletRandomWalkNft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setStakingWalletRandomWalkNft(IStakingWalletRandomWalkNft newValue_) external;

	/// @notice Sets `stakingWalletCosmicSignatureNft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external;

	/// @notice Sets `marketingWallet`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMarketingWallet(address newValue_) external;

	/// @notice Sets `marketingWalletCstContributionAmount`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMarketingWalletCstContributionAmount(uint256 newValue_) external;

	/// @notice Sets `charityAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCharityAddress(address newValue_) external;

	/// @notice Sets `charityEthDonationAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCharityEthDonationAmountPercentage(uint256 newValue_) external;
}
