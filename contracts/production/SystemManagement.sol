// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { ICosmicSignatureNft, CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IRandomWalkNFT, RandomWalkNFT } from "./RandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { IStakingWalletRandomWalkNft, StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { IPrizesWallet, PrizesWallet } from "./PrizesWallet.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is
	OwnableUpgradeableWithReservedStorageGaps,
	AddressValidator,
	CosmicSignatureGameStorage,
	ISystemManagement {
	// /// @dev Replaced with `onlyInactive`.
	// modifier onlyMaintenance() {
	// 	require(
	// 		systemMode == CosmicSignatureConstants.MODE_MAINTENANCE,
	// 		CosmicSignatureErrors.SystemMode(CosmicSignatureConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
	// 	);
	// 	_;
	// }
	//
	// /// @dev Replaced with `onlyActive`.
	// modifier onlyRuntime() {
	// 	require(
	// 		systemMode < CosmicSignatureConstants.MODE_MAINTENANCE,
	// 		CosmicSignatureErrors.SystemMode(CosmicSignatureConstants.ERR_STR_MODE_RUNTIME, systemMode)
	// 	);
	// 	_;
	// }

	modifier onlyInactive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp < activationTimeCopy_,
			CosmicSignatureErrors.SystemIsActive("The current bidding round is already active.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	modifier onlyActive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp >= activationTimeCopy_,
			CosmicSignatureErrors.SystemIsInactive("The current bidding round is not active yet.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	// function prepareMaintenance() external override onlyOwner /*onlyRuntime*/ {
	// 	require(
	// 		systemMode == CosmicSignatureConstants.MODE_RUNTIME,
	// 		CosmicSignatureErrors.SystemMode("System must be in runtime mode.", systemMode)
	// 	);
	// 	systemMode = CosmicSignatureConstants.MODE_PREPARE_MAINTENANCE;
	// 	emit SystemModeChanged(systemMode);
	// }   
	//
	// function setRuntimeMode() external override onlyOwner onlyMaintenance {
	// 	systemMode = CosmicSignatureConstants.MODE_RUNTIME;
	// 	emit SystemModeChanged(systemMode);
	// }

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

	function _setActivationTime(uint256 newValue_) internal {
		activationTime = newValue_;

		// [Comment-202411168]
		// todo-0 We no longer need this. Instead, assign this on the 1st bid, which is required to be ETH.
		// One might want to ensure that this is not in the past.
		// But `activationTime` is really not supposed to be in the past.
		// So keeping it simple and effiicient.
		// [/Comment-202411168]
		lastCstBidTimeStamp = newValue_;

		emit ActivationTimeChanged(newValue_);
	}

	function setDelayDurationBeforeNextRound(uint256 newValue_) external override onlyOwner /*onlyInactive*/ {
		delayDurationBeforeNextRound = newValue_;
		emit DelayDurationBeforeNextRoundChanged(newValue_);
	}

	function setMarketingWalletCstContributionAmount(uint256 newValue_) external override onlyOwner onlyInactive {
		marketingWalletCstContributionAmount = newValue_;
		emit MarketingWalletCstContributionAmountChanged(newValue_);
	}

	function setMaxMessageLength(uint256 newValue_) external override onlyOwner onlyInactive {
		maxMessageLength = newValue_;
		emit MaxMessageLengthChanged(newValue_);
	}

	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		token = CosmicSignatureToken(address(newValue_));
		emit CosmicSignatureTokenAddressChanged(newValue_);
	}

	function setCosmicSignatureNft(ICosmicSignatureNft newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		nft = CosmicSignatureNft(address(newValue_));
		emit CosmicSignatureNftAddressChanged(newValue_);
	}

	function setRandomWalkNft(IRandomWalkNFT newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		randomWalkNft = RandomWalkNFT(address(newValue_));
		emit RandomWalkNftAddressChanged(newValue_);
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
		emit StakingWalletCosmicSignatureNftAddressChanged(newValue_);
	}

	function setStakingWalletRandomWalkNft(IStakingWalletRandomWalkNft newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		stakingWalletRandomWalkNft = StakingWalletRandomWalkNft(address(newValue_));
		emit StakingWalletRandomWalkNftAddressChanged(newValue_);
	}

	function setPrizesWallet(IPrizesWallet newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(address(newValue_)) {
		prizesWallet = PrizesWallet(address(newValue_));
		emit PrizesWalletAddressChanged(newValue_);
	}

	function setMarketingWallet(address newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(newValue_) {
		marketingWallet = newValue_;
		emit MarketingWalletAddressChanged(newValue_);
	}

	function setCharityAddress(address newValue_) external override
		onlyOwner
		onlyInactive
		providedAddressIsNonZero(newValue_) {
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function setMainPrizeTimeIncrementInMicroSeconds(uint256 newValue_) external override onlyOwner onlyInactive {
		mainPrizeTimeIncrementInMicroSeconds = newValue_;
		emit MainPrizeTimeIncrementInMicroSecondsChanged(newValue_);
	}

	function setTimeIncrease(uint256 newValue_) external override onlyOwner onlyInactive {
		timeIncrease = newValue_;
		emit TimeIncreaseChanged(newValue_);
	}

	function setInitialSecondsUntilPrize(uint256 newValue_) external override onlyOwner onlyInactive {
		initialSecondsUntilPrize = newValue_;
		emit InitialSecondsUntilPrizeChanged(newValue_);
	}

	function setRoundInitialEthBidPriceMultiplier(uint256 newValue_) external override onlyOwner onlyInactive {
		roundInitialEthBidPriceMultiplier = newValue_;
		emit RoundInitialEthBidPriceMultiplierChanged(newValue_);
	}

	function setRoundInitialEthBidPriceDivisor(uint256 newValue_) external override onlyOwner onlyInactive {
		roundInitialEthBidPriceDivisor = newValue_;
		emit RoundInitialEthBidPriceDivisorChanged(newValue_);
	}

	function setPriceIncrease(uint256 newValue_) external override onlyOwner onlyInactive {
		priceIncrease = newValue_;
		emit PriceIncreaseChanged(newValue_);
	}

	function setRoundStartCstAuctionLength(uint256 newValue_) external override onlyOwner onlyInactive {
		roundStartCstAuctionLength = newValue_;
		emit RoundStartCstAuctionLengthChanged(newValue_);
	}

	function setStartingBidPriceCSTMinLimit(uint256 newValue_) external override onlyOwner onlyInactive {
		// require(
		// 	newValue_ >= CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT,
		// 	CosmicSignatureErrors.ProvidedStartingBidPriceCSTMinLimitIsTooSmall(
		// 		// todo-9 Can I phrase this better? Maybe "starting CST bid price".
		// 		"The provided starting bid price in CST min limit is too small.",
		// 		newValue_,
		// 		CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT
		// 	)
		// );
		startingBidPriceCSTMinLimit = newValue_;
		emit StartingBidPriceCSTMinLimitChanged(newValue_);
	}

	function setTokenReward(uint256 newValue_) external override onlyOwner onlyInactive {
		tokenReward = newValue_;
		emit TokenRewardChanged(newValue_);
	}

	function setMainEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		// todo-1 Maybe remove this validation everywhere.
		uint256 percentageSum_ = newValue_ + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountPercentage + stakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		mainEthPrizeAmountPercentage = newValue_;
		emit MainEthPrizeAmountPercentageChanged(newValue_);
	}

	function setChronoWarriorEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainEthPrizeAmountPercentage + newValue_ + raffleTotalEthPrizeAmountPercentage + stakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		chronoWarriorEthPrizeAmountPercentage = newValue_;
		emit ChronoWarriorEthPrizeAmountPercentageChanged(newValue_);
	}

	function setRaffleTotalEthPrizeAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + newValue_ + stakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		raffleTotalEthPrizeAmountPercentage = newValue_;
		emit RaffleTotalEthPrizeAmountPercentageChanged(newValue_);
	}

	function setStakingTotalEthRewardAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountPercentage + newValue_ + charityEthDonationAmountPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		stakingTotalEthRewardAmountPercentage = newValue_;
		emit StakingTotalEthRewardAmountPercentageChanged(newValue_);
	}

	function setCharityEthDonationAmountPercentage(uint256 newValue_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountPercentage + stakingTotalEthRewardAmountPercentage + newValue_;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		charityEthDonationAmountPercentage = newValue_;
		emit CharityEthDonationAmountPercentageChanged(newValue_);
	}

	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external override onlyOwner onlyInactive {
		timeoutDurationToClaimMainPrize = newValue_;
		emit TimeoutDurationToClaimMainPrizeChanged(newValue_);
	}

	function setCstRewardAmountMultiplier(uint256 newValue_) external override onlyOwner onlyInactive {
		cstRewardAmountMultiplier = newValue_;
		emit CstRewardAmountMultiplierChanged(newValue_);
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
}
