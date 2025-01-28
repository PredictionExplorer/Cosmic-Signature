// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IRandomWalkNFT, RandomWalkNFT } from "./RandomWalkNFT.sol";
import { ICosmicSignatureNft, CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IPrizesWallet, PrizesWallet } from "./PrizesWallet.sol";
import { IStakingWalletRandomWalkNft, StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is
	OwnableUpgradeableWithReservedStorageGaps,
	AddressValidator,
	CosmicSignatureGameStorage,
	BiddingBase,
	ISystemManagement {
	function setDelayDurationBeforeNextRound(uint256 newValue_) external override onlyOwner /*onlyInactive*/ {
		delayDurationBeforeNextRound = newValue_;
		emit DelayDurationBeforeNextRoundChanged(newValue_);
	}

	function setActivationTime(uint256 newValue_) external override onlyOwner /*onlyInactive*/ {
		// [Comment-202411236]
		// Imposing this requirement instead of `onlyInactive`.
		// This design leaves the door open for the admin to change `activationTime` to a point in the future
		// and then change some parameters.
		// todo-1 The backend and frontend must expect that activation time changes.
		// todo-1 Think of what params are currently not adjustable, but might need to be adjustable. Such as `nextEthBidPrice`.
		// [/Comment-202411236]
		require(
			lastBidderAddress == address(0),
			CosmicSignatureErrors.BidHasBeenPlacedInCurrentRound("A bid has already been placed in the current bidding round.")
		);

		_setActivationTime(newValue_);
	}

	function setEthDutchAuctionDurationDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		ethDutchAuctionDurationDivisor = newValue_;
		emit EthDutchAuctionDurationDivisorChanged(newValue_);
	}

	function setEthDutchAuctionEndingBidPriceDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		ethDutchAuctionEndingBidPriceDivisor = newValue_;
		emit EthDutchAuctionEndingBidPriceDivisorChanged(newValue_);
	}

	function setNextEthBidPriceIncreaseDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		nextEthBidPriceIncreaseDivisor = newValue_;
		emit NextEthBidPriceIncreaseDivisorChanged(newValue_);
	}

	function setCstDutchAuctionDurationDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		cstDutchAuctionDurationDivisor = newValue_;
		emit CstDutchAuctionDurationDivisorChanged(newValue_);
	}

	function setCstDutchAuctionBeginningBidPriceMinLimit(uint256 newValue_) external override onlyOwner onlyInactive {
		// require(
		// 	newValue_ >= CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT,
		// 	CosmicSignatureErrors.ProvidedStartingBidPriceCstMinLimitIsTooSmall(
		// 		// todo-9 Can I phrase this better? Maybe "starting CST bid price".
		// 		"The provided starting bid price in CST min limit is too small.",
		// 		newValue_,
		// 		CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT
		// 	)
		// );
		cstDutchAuctionBeginningBidPriceMinLimit = newValue_;
		emit CstDutchAuctionBeginningBidPriceMinLimitChanged(newValue_);
	}

	function setMaxMessageLength(uint256 newValue_) external override onlyOwner onlyInactive {
		maxMessageLength = newValue_;
		emit MaxMessageLengthChanged(newValue_);
	}

	function setTokenReward(uint256 newValue_) external override onlyOwner onlyInactive {
		tokenReward = newValue_;
		emit TokenRewardChanged(newValue_);
	}

	function setInitialDurationUntilMainPrizeDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		initialDurationUntilMainPrizeDivisor = newValue_;
		emit InitialDurationUntilMainPrizeDivisorChanged(newValue_);
	}

	function setMainPrizeTimeIncrementInMicroSeconds(uint256 newValue_) external override onlyOwner onlyInactive {
		mainPrizeTimeIncrementInMicroSeconds = newValue_;
		emit MainPrizeTimeIncrementInMicroSecondsChanged(newValue_);
	}

	function setMainPrizeTimeIncrementIncreaseDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		mainPrizeTimeIncrementIncreaseDivisor = newValue_;
		emit MainPrizeTimeIncrementIncreaseDivisorChanged(newValue_);
	}

	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external override onlyOwner onlyInactive {
		timeoutDurationToClaimMainPrize = newValue_;
		emit TimeoutDurationToClaimMainPrizeChanged(newValue_);
	}

	function setMainEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		// // Comment-202409215 applies.
		// uint256 prizePercentageSum_ = newValue_ + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountPercentage + stakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage;
		// require(
		// 	prizePercentageSum_ < 100,
		// 	CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", prizePercentageSum_)
		// );

		mainEthPrizeAmountPercentage = newValue_;
		emit MainEthPrizeAmountPercentageChanged(newValue_);
	}

	function setCstRewardAmountMultiplier(uint256 newValue_) external override onlyOwner onlyInactive {
		cstRewardAmountMultiplier = newValue_;
		emit CstRewardAmountMultiplierChanged(newValue_);
	}

	function setChronoWarriorEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		// // Comment-202409215 applies.
		// uint256 prizePercentageSum_ = mainEthPrizeAmountPercentage + newValue_ + raffleTotalEthPrizeAmountPercentage + stakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage;
		// require(
		// 	prizePercentageSum_ < 100,
		// 	CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", prizePercentageSum_)
		// );

		chronoWarriorEthPrizeAmountPercentage = newValue_;
		emit ChronoWarriorEthPrizeAmountPercentageChanged(newValue_);
	}

	function setRaffleTotalEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		// // Comment-202409215 applies.
		// uint256 prizePercentageSum_ = mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + newValue_ + stakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage;
		// require(
		// 	prizePercentageSum_ < 100,
		// 	CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", prizePercentageSum_)
		// );

		raffleTotalEthPrizeAmountPercentage = newValue_;
		emit RaffleTotalEthPrizeAmountPercentageChanged(newValue_);
	}

	function setNumRaffleEthPrizesForBidders(uint256 newValue_) external override onlyOwner onlyInactive {
		numRaffleEthPrizesForBidders = newValue_;
		emit NumRaffleEthPrizesForBiddersChanged(newValue_);
	}

	function setNumRaffleCosmicSignatureNftsForBidders(uint256 newValue_) external override onlyOwner onlyInactive {
		numRaffleCosmicSignatureNftsForBidders = newValue_;
		emit NumRaffleCosmicSignatureNftsForBiddersChanged(newValue_);
	}

	function setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(uint256 newValue_) external override onlyOwner onlyInactive {
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers = newValue_;
		emit NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged(newValue_);
	}

	function setStakingTotalEthRewardAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		// // Comment-202409215 applies.
		// uint256 prizePercentageSum_ = mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountPercentage + newValue_ + charityEthDonationAmountPercentage;
		// require(
		// 	prizePercentageSum_ < 100,
		// 	CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", prizePercentageSum_)
		// );

		stakingTotalEthRewardAmountPercentage = newValue_;
		emit StakingTotalEthRewardAmountPercentageChanged(newValue_);
	}

	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		token = CosmicSignatureToken(address(newValue_));
		emit CosmicSignatureTokenAddressChanged(newValue_);
	}

	function setRandomWalkNft(IRandomWalkNFT newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		randomWalkNft = RandomWalkNFT(address(newValue_));
		emit RandomWalkNftAddressChanged(newValue_);
	}

	function setCosmicSignatureNft(ICosmicSignatureNft newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		nft = CosmicSignatureNft(address(newValue_));
		emit CosmicSignatureNftAddressChanged(newValue_);
	}

	function setPrizesWallet(IPrizesWallet newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		prizesWallet = PrizesWallet(address(newValue_));
		emit PrizesWalletAddressChanged(newValue_);
	}

	function setStakingWalletRandomWalkNft(IStakingWalletRandomWalkNft newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		stakingWalletRandomWalkNft = StakingWalletRandomWalkNft(address(newValue_));
		emit StakingWalletRandomWalkNftAddressChanged(newValue_);
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
		emit StakingWalletCosmicSignatureNftAddressChanged(newValue_);
	}

	function setMarketingWallet(address newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(newValue_) {
		marketingWallet = newValue_;
		emit MarketingWalletAddressChanged(newValue_);
	}

	function setMarketingWalletCstContributionAmount(uint256 newValue_) external override onlyOwner onlyInactive {
		marketingWalletCstContributionAmount = newValue_;
		emit MarketingWalletCstContributionAmountChanged(newValue_);
	}

	function setCharityAddress(address newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(newValue_) {
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function setCharityEthDonationAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		// // Comment-202409215 applies.
		// uint256 prizePercentageSum_ = mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountPercentage + stakingTotalEthRewardAmountPercentage + newValue_;
		// require(
		// 	prizePercentageSum_ < 100,
		// 	CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", prizePercentageSum_)
		// );

		charityEthDonationAmountPercentage = newValue_;
		emit CharityEthDonationAmountPercentageChanged(newValue_);
	}
}
