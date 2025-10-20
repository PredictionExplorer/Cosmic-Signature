// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IRandomWalkNFT, RandomWalkNFT } from "./RandomWalkNFT.sol";
import { ICosmicSignatureNft, CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IPrizesWallet, PrizesWallet } from "./PrizesWallet.sol";
import { IStakingWalletRandomWalkNft, StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is
	OwnableUpgradeableWithReservedStorageGaps,
	AddressValidator,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	ISystemManagement {
	function setDelayDurationBeforeRoundActivation(uint256 newValue_) external override onlyOwner /*_onlyRoundIsInactive*/ {
		delayDurationBeforeRoundActivation = newValue_;
		emit DelayDurationBeforeRoundActivationChanged(newValue_);
	}

	function setRoundActivationTime(uint256 newValue_) external override onlyOwner /*_onlyRoundIsInactive*/ _onlyBeforeBidPlacedInRound {
		_setRoundActivationTime(newValue_);
	}

	function setEthDutchAuctionDurationDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		_setEthDutchAuctionDurationDivisor(newValue_);
	}

	function setEthDutchAuctionEndingBidPriceDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		_setEthDutchAuctionEndingBidPriceDivisor(newValue_);
	}

	function setEthBidPriceIncreaseDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		ethBidPriceIncreaseDivisor = newValue_;
		emit EthBidPriceIncreaseDivisorChanged(newValue_);
	}

	function setEthBidRefundAmountInGasToSwallowMaxLimit(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		ethBidRefundAmountInGasToSwallowMaxLimit = newValue_;
		emit EthBidRefundAmountInGasToSwallowMaxLimitChanged(newValue_);
	}

	function setCstDutchAuctionDurationDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cstDutchAuctionDurationDivisor = newValue_;
		emit CstDutchAuctionDurationDivisorChanged(newValue_);
	}

	function setCstDutchAuctionBeginningBidPriceMinLimit(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cstDutchAuctionBeginningBidPriceMinLimit = newValue_;
		emit CstDutchAuctionBeginningBidPriceMinLimitChanged(newValue_);
	}

	function setBidMessageLengthMaxLimit(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		bidMessageLengthMaxLimit = newValue_;
		emit BidMessageLengthMaxLimitChanged(newValue_);
	}

	function setCstRewardAmountForBidding(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cstRewardAmountForBidding = newValue_;
		emit CstRewardAmountForBiddingChanged(newValue_);
	}

	function setCstPrizeAmount(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cstPrizeAmount = newValue_;
		emit CstPrizeAmountChanged(newValue_);
	}

	function setChronoWarriorEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		chronoWarriorEthPrizeAmountPercentage = newValue_;
		emit ChronoWarriorEthPrizeAmountPercentageChanged(newValue_);
	}

	function setRaffleTotalEthPrizeAmountForBiddersPercentage(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		raffleTotalEthPrizeAmountForBiddersPercentage = newValue_;
		emit RaffleTotalEthPrizeAmountForBiddersPercentageChanged(newValue_);
	}

	function setNumRaffleEthPrizesForBidders(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		numRaffleEthPrizesForBidders = newValue_;
		emit NumRaffleEthPrizesForBiddersChanged(newValue_);
	}

	function setNumRaffleCosmicSignatureNftsForBidders(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		numRaffleCosmicSignatureNftsForBidders = newValue_;
		emit NumRaffleCosmicSignatureNftsForBiddersChanged(newValue_);
	}

	function setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers = newValue_;
		emit NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged(newValue_);
	}

	function setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage = newValue_;
		emit CosmicSignatureNftStakingTotalEthRewardAmountPercentageChanged(newValue_);
	}

	function setInitialDurationUntilMainPrizeDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		initialDurationUntilMainPrizeDivisor = newValue_;
		emit InitialDurationUntilMainPrizeDivisorChanged(newValue_);
	}

	function setMainPrizeTimeIncrementInMicroSeconds(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		_setMainPrizeTimeIncrementInMicroSeconds(newValue_);
	}

	function setMainPrizeTimeIncrementIncreaseDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		mainPrizeTimeIncrementIncreaseDivisor = newValue_;
		emit MainPrizeTimeIncrementIncreaseDivisorChanged(newValue_);
	}

	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		timeoutDurationToClaimMainPrize = newValue_;
		emit TimeoutDurationToClaimMainPrizeChanged(newValue_);
	}

	function setMainEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		mainEthPrizeAmountPercentage = newValue_;
		emit MainEthPrizeAmountPercentageChanged(newValue_);
	}

	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(address(newValue_)) {
		token = CosmicSignatureToken(address(newValue_));
		emit CosmicSignatureTokenAddressChanged(newValue_);
	}

	function setRandomWalkNft(IRandomWalkNFT newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(address(newValue_)) {
		randomWalkNft = RandomWalkNFT(address(newValue_));
		emit RandomWalkNftAddressChanged(newValue_);
	}

	function setCosmicSignatureNft(ICosmicSignatureNft newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(address(newValue_)) {
		nft = CosmicSignatureNft(address(newValue_));
		emit CosmicSignatureNftAddressChanged(newValue_);
	}

	function setPrizesWallet(IPrizesWallet newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(address(newValue_)) {
		prizesWallet = PrizesWallet(address(newValue_));
		emit PrizesWalletAddressChanged(newValue_);
	}

	function setStakingWalletRandomWalkNft(IStakingWalletRandomWalkNft newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(address(newValue_)) {
		stakingWalletRandomWalkNft = StakingWalletRandomWalkNft(address(newValue_));
		emit StakingWalletRandomWalkNftAddressChanged(newValue_);
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(address(newValue_)) {
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
		emit StakingWalletCosmicSignatureNftAddressChanged(newValue_);
	}

	function setMarketingWallet(address newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(newValue_) {
		marketingWallet = newValue_;
		emit MarketingWalletAddressChanged(newValue_);
	}

	function setMarketingWalletCstContributionAmount(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		marketingWalletCstContributionAmount = newValue_;
		emit MarketingWalletCstContributionAmountChanged(newValue_);
	}

	function setCharityAddress(address newValue_) external override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(newValue_) {
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function setCharityEthDonationAmountPercentage(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		charityEthDonationAmountPercentage = newValue_;
		emit CharityEthDonationAmountPercentageChanged(newValue_);
	}
}
