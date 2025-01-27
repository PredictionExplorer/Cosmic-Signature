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
interface ISystemEvents {
	/// @notice Emitted when `activationTime` is changed.
	/// @param newValue The new value.
	event ActivationTimeChanged(uint256 newValue);

	/// @notice Emitted when `delayDurationBeforeNextRound` is changed.
	/// @param newValue The new value.
	event DelayDurationBeforeNextRoundChanged(uint256 newValue);

	/// @notice Emitted when `marketingWalletCstContributionAmount` is changed.
	/// @param newValue The new value.
	event MarketingWalletCstContributionAmountChanged(uint256 newValue);

	/// @notice Emitted when `maxMessageLength` is changed.
	/// @param newValue The new value.
	event MaxMessageLengthChanged(uint256 newValue);

	/// @notice Emitted when `token` is changed.
	/// @param newValue The new value.
	event CosmicSignatureTokenAddressChanged(ICosmicSignatureToken newValue);

	/// @notice Emitted when `randomWalkNft` is changed.
	/// @param newValue The new value.
	event RandomWalkNftAddressChanged(IRandomWalkNFT newValue);

	/// @notice Emitted when `nft` is changed.
	/// @param newValue The new value.
	event CosmicSignatureNftAddressChanged(ICosmicSignatureNft newValue);

	/// @notice Emitted when `prizesWallet` is changed.
	/// @param newValue The new value.
	event PrizesWalletAddressChanged(IPrizesWallet newValue);

	/// @notice Emitted when `stakingWalletRandomWalkNft` is changed.
	/// @param newValue The new value.
	event StakingWalletRandomWalkNftAddressChanged(IStakingWalletRandomWalkNft newValue);

	/// @notice Emitted when `stakingWalletCosmicSignatureNft` is changed.
	/// @param newValue The new value.
	event StakingWalletCosmicSignatureNftAddressChanged(IStakingWalletCosmicSignatureNft newValue);

	/// @notice Emitted when `marketingWallet` is changed.
	/// @param newValue The new value.
	event MarketingWalletAddressChanged(address newValue);

	/// @notice Emitted when `charityAddress` is changed.
	/// @param newValue The new value.
	event CharityAddressChanged(address indexed newValue);

	/// @notice Emitted when `initialDurationUntilMainPrizeDivisor` is changed.
	/// @param newValue The new value.
	event InitialDurationUntilMainPrizeDivisorChanged(uint256 newValue);

	/// @notice Emitted when `mainPrizeTimeIncrementInMicroSeconds` is changed.
	/// @param newValue The new value.
	event MainPrizeTimeIncrementInMicroSecondsChanged(uint256 newValue);

	/// @notice Emitted when `mainPrizeTimeIncrementIncreaseDivisor` is changed.
	/// @param newValue The new value.
	event MainPrizeTimeIncrementIncreaseDivisorChanged(uint256 newValue);

	/// @notice Emitted when `ethDutchAuctionDurationDivisor` is changed.
	/// @param newValue The new value.
	event EthDutchAuctionDurationDivisorChanged(uint256 newValue);

	/// @notice Emitted when `ethDutchAuctionEndingBidPriceDivisor` is changed.
	/// @param newValue The new value.
	event EthDutchAuctionEndingBidPriceDivisorChanged(uint256 newValue);

	/// @notice Emitted when `nextEthBidPriceIncreaseDivisor` is changed.
	/// @param newValue The new value.
	event NextEthBidPriceIncreaseDivisorChanged(uint256 newValue);

	/// @notice Emitted when `cstDutchAuctionDurationDivisor` is changed.
	/// @param newValue The new value.
	event CstDutchAuctionDurationDivisorChanged(uint256 newValue);

	/// @notice Emitted when `cstDutchAuctionBeginningBidPriceMinLimit` is changed.
	/// @param newValue The new value.
	event CstDutchAuctionBeginningBidPriceMinLimitChanged(uint256 newValue);

	/// @notice Emitted when `tokenReward` is changed.
	/// @param newValue The new value.
	event TokenRewardChanged(uint256 newValue);

	/// @notice Emitted when `mainEthPrizeAmountPercentage` is changed.
	/// @param newValue The new value.
	event MainEthPrizeAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `chronoWarriorEthPrizeAmountPercentage` is changed.
	/// @param newValue The new value.
	event ChronoWarriorEthPrizeAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `raffleTotalEthPrizeAmountPercentage` is changed.
	/// @param newValue The new value.
	event RaffleTotalEthPrizeAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `stakingTotalEthRewardAmountPercentage` is changed.
	/// @param newValue The new value.
	event StakingTotalEthRewardAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `charityEthDonationAmountPercentage` is changed.
	/// @param newValue The new value.
	event CharityEthDonationAmountPercentageChanged(uint256 newValue);

	/// @notice Emitted when `timeoutDurationToClaimMainPrize` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToClaimMainPrizeChanged(uint256 newValue);

	/// @notice Emitted when `cstRewardAmountMultiplier` is changed.
	/// @param newValue The new value.
	event CstRewardAmountMultiplierChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleEthPrizesForBidders` is changed.
	/// @param newValue The new value.
	event NumRaffleEthPrizesForBiddersChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleCosmicSignatureNftsForBidders` is changed.
	/// @param newValue The new value.
	event NumRaffleCosmicSignatureNftsForBiddersChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` is changed.
	/// @param newValue The new value.
	event NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged(uint256 newValue);
}
