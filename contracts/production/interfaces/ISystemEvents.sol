// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { ICosmicSignatureNft } from "./ICosmicSignatureNft.sol";
import { IPrizesWallet } from "./IPrizesWallet.sol";
import { IStakingWalletRandomWalkNft } from "./IStakingWalletRandomWalkNft.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";

/// @title Cosmic Signature Game Configuration Events.
/// @author The Cosmic Signature Development Team.
/// @notice For each parameter marked with Comment-202411064, provides an event to be emitted when the parameter changes.
/// The logic also changes some of those variables. They are marked with Comment-202411172. And on that kind of change
/// the respective event will not necessarily be emitted.
interface ISystemEvents {
	/// @notice Emitted when `delayDurationBeforeRoundActivation` is changed.
	/// @param newValue The new value.
	event DelayDurationBeforeRoundActivationChanged(uint256 newValue);

	/// @notice Emitted when `roundActivationTime` is changed.
	/// @param newValue The new value.
	event RoundActivationTimeChanged(uint256 newValue);

	/// @notice Emitted when `ethDutchAuctionDurationDivisor` is changed.
	/// @param newValue The new value.
	event EthDutchAuctionDurationDivisorChanged(uint256 newValue);

	/// @notice Emitted when `ethDutchAuctionEndingBidPriceDivisor` is changed.
	/// @param newValue The new value.
	event EthDutchAuctionEndingBidPriceDivisorChanged(uint256 newValue);

	/// @notice Emitted when `ethBidPriceIncreaseDivisor` is changed.
	/// @param newValue The new value.
	event EthBidPriceIncreaseDivisorChanged(uint256 newValue);

	/// @notice Emitted when `ethBidRefundAmountInGasMinLimit` is changed.
	/// @param newValue The new value.
	event EthBidRefundAmountInGasMinLimitChanged(uint256 newValue);

	/// @notice Emitted when `cstDutchAuctionDurationDivisor` is changed.
	/// @param newValue The new value.
	event CstDutchAuctionDurationDivisorChanged(uint256 newValue);

	/// @notice Emitted when `cstDutchAuctionBeginningBidPriceMinLimit` is changed.
	/// @param newValue The new value.
	event CstDutchAuctionBeginningBidPriceMinLimitChanged(uint256 newValue);

	/// @notice Emitted when `bidMessageLengthMaxLimit` is changed.
	/// @param newValue The new value.
	event BidMessageLengthMaxLimitChanged(uint256 newValue);

	/// @notice Emitted when `cstRewardAmountForBidding` is changed.
	/// @param newValue The new value.
	event CstRewardAmountForBiddingChanged(uint256 newValue);

	/// @notice Emitted when `cstPrizeAmountMultiplier` is changed.
	/// @param newValue The new value.
	event CstPrizeAmountMultiplierChanged(uint256 newValue);

	/// @notice Emitted when `chronoWarriorEthPrizeAmountPercentage` is changed.
	/// @param newValue The new value.
	event ChronoWarriorEthPrizeAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `raffleTotalEthPrizeAmountForBiddersPercentage` is changed.
	/// @param newValue The new value.
	event RaffleTotalEthPrizeAmountForBiddersPercentageChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleEthPrizesForBidders` is changed.
	/// @param newValue The new value.
	event NumRaffleEthPrizesForBiddersChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleCosmicSignatureNftsForBidders` is changed.
	/// @param newValue The new value.
	event NumRaffleCosmicSignatureNftsForBiddersChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` is changed.
	/// @param newValue The new value.
	event NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged(uint256 newValue);

	/// @notice Emitted when `cosmicSignatureNftStakingTotalEthRewardAmountPercentage` is changed.
	/// @param newValue The new value.
	event CosmicSignatureNftStakingTotalEthRewardAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `initialDurationUntilMainPrizeDivisor` is changed.
	/// @param newValue The new value.
	event InitialDurationUntilMainPrizeDivisorChanged(uint256 newValue);

	/// @notice Emitted when `mainPrizeTimeIncrementInMicroSeconds` is changed.
	/// @param newValue The new value.
	event MainPrizeTimeIncrementInMicroSecondsChanged(uint256 newValue);

	/// @notice Emitted when `mainPrizeTimeIncrementIncreaseDivisor` is changed.
	/// @param newValue The new value.
	event MainPrizeTimeIncrementIncreaseDivisorChanged(uint256 newValue);

	/// @notice Emitted when `timeoutDurationToClaimMainPrize` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToClaimMainPrizeChanged(uint256 newValue);

	/// @notice Emitted when `mainEthPrizeAmountPercentage` is changed.
	/// @param newValue The new value.
	event MainEthPrizeAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `token` is changed.
	/// @param newValue The new value.
	event CosmicSignatureTokenAddressChanged(ICosmicSignatureToken indexed newValue);

	/// @notice Emitted when `randomWalkNft` is changed.
	/// @param newValue The new value.
	event RandomWalkNftAddressChanged(IRandomWalkNFT indexed newValue);

	/// @notice Emitted when `nft` is changed.
	/// @param newValue The new value.
	event CosmicSignatureNftAddressChanged(ICosmicSignatureNft indexed newValue);

	/// @notice Emitted when `prizesWallet` is changed.
	/// @param newValue The new value.
	event PrizesWalletAddressChanged(IPrizesWallet indexed newValue);

	/// @notice Emitted when `stakingWalletRandomWalkNft` is changed.
	/// @param newValue The new value.
	event StakingWalletRandomWalkNftAddressChanged(IStakingWalletRandomWalkNft indexed newValue);

	/// @notice Emitted when `stakingWalletCosmicSignatureNft` is changed.
	/// @param newValue The new value.
	event StakingWalletCosmicSignatureNftAddressChanged(IStakingWalletCosmicSignatureNft indexed newValue);

	/// @notice Emitted when `marketingWallet` is changed.
	/// @param newValue The new value.
	event MarketingWalletAddressChanged(address indexed newValue);

	/// @notice Emitted when `marketingWalletCstContributionAmount` is changed.
	/// @param newValue The new value.
	event MarketingWalletCstContributionAmountChanged(uint256 newValue);

	/// @notice Emitted when `charityAddress` is changed.
	/// @param newValue The new value.
	event CharityAddressChanged(address indexed newValue);

	/// @notice Emitted when `charityEthDonationAmountPercentage` is changed.
	/// @param newValue The new value.
	event CharityEthDonationAmountPercentageChanged(uint256 newValue);
}
