// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";
import { PrizesWallet } from "./PrizesWallet.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
// import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";
// import { MarketingWallet } from "./MarketingWallet.sol";
import { ICosmicSignatureNft } from "./interfaces/ICosmicSignatureNft.sol";
import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IRandomWalkNFT } from "./interfaces/IRandomWalkNFT.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./interfaces/IStakingWalletCosmicSignatureNft.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { IStakingWalletRandomWalkNft } from "./interfaces/IStakingWalletRandomWalkNft.sol";
import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is
	OwnableUpgradeableWithReservedStorageGaps,
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
			CosmicSignatureErrors.SystemIsActive("Already active.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	modifier onlyActive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp >= activationTimeCopy_,
			CosmicSignatureErrors.SystemIsInactive("Not active yet.", activationTimeCopy_, block.timestamp)
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
		// todo-1 Think of what params are currently not adjustable, but might need to be adjustable. Such as `bidPrice`.
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
		// One might want to ensure that this is not in the past.
		// But `activationTime` is really not supposed to be in the past.
		// So keeping it simple and gas-effiicient.
		// [/Comment-202411168]
		lastCstBidTimeStamp = newValue_;

		emit ActivationTimeChanged(newValue_);
	}

	function timeUntilActivation() external view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// return (block.timestamp >= activationTime) ? 0 : (activationTime - block.timestamp);
			uint256 durationUntilActivation_ = uint256(int256(activationTime) - int256(block.timestamp));
			if(int256(durationUntilActivation_) < int256(0)) {
				durationUntilActivation_ = 0;
			}
			return durationUntilActivation_;
		}
	}

	function setDelayDurationBeforeNextRound(uint256 newValue_) external override onlyOwner /*onlyInactive*/ {
		delayDurationBeforeNextRound = newValue_;
		emit DelayDurationBeforeNextRoundChanged(newValue_);
	}

	function setMarketingReward(uint256 newValue_) external override onlyOwner onlyInactive {
		marketingReward = newValue_;
		emit MarketingRewardChanged(newValue_);
	}

	function setMaxMessageLength(uint256 _maxMessageLength) external override onlyOwner onlyInactive {
		maxMessageLength = _maxMessageLength;
		emit MaxMessageLengthChanged(_maxMessageLength);
	}

	function setPrizesWallet(IPrizesWallet newValue_) external override onlyOwner onlyInactive {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		prizesWallet = PrizesWallet(address(newValue_));
		emit PrizesWalletAddressChanged(newValue_);
	}

	function setTokenContract(ICosmicSignatureToken newValue_) external override onlyOwner onlyInactive {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		token = CosmicSignatureToken(address(newValue_));
		emit TokenContractAddressChanged(newValue_);
	}

	function setMarketingWallet(address newValue_) external override onlyOwner onlyInactive {
		require(newValue_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		marketingWallet = newValue_;
		emit MarketingWalletAddressChanged(newValue_);
	}

	function setCosmicSignatureNft(ICosmicSignatureNft newValue_) external override onlyOwner onlyInactive {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		nft = CosmicSignatureNft(address(newValue_));
		emit CosmicSignatureNftAddressChanged(newValue_);
	}

	function setRandomWalkNft(IRandomWalkNFT newValue_) external override onlyOwner onlyInactive {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		randomWalkNft = RandomWalkNFT(address(newValue_));
		emit RandomWalkNftAddressChanged(newValue_);
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external override onlyOwner onlyInactive {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
		emit StakingWalletCosmicSignatureNftAddressChanged(newValue_);
	}

	function setStakingWalletRandomWalkNft(IStakingWalletRandomWalkNft newValue_) external override onlyOwner onlyInactive {
		require(address(newValue_) != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		stakingWalletRandomWalkNft = StakingWalletRandomWalkNft(address(newValue_));
		emit StakingWalletRandomWalkNftAddressChanged(newValue_);
	}

	function setCharityAddress(address newValue_) external override onlyOwner onlyInactive {
		require(newValue_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external override onlyOwner onlyInactive {
		nanoSecondsExtra = newNanoSecondsExtra;
		emit NanoSecondsExtraChanged(newNanoSecondsExtra);
	}

	function setTimeIncrease(uint256 _timeIncrease) external override onlyOwner onlyInactive {
		timeIncrease = _timeIncrease;
		emit TimeIncreaseChanged(_timeIncrease);
	}

	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external override onlyOwner onlyInactive {
		initialSecondsUntilPrize = _initialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(_initialSecondsUntilPrize);
	}

	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external override onlyOwner onlyInactive {
		initialBidAmountFraction = newInitialBidAmountFraction;
		emit InitialBidAmountFractionChanged(initialBidAmountFraction);
	}

	function setPriceIncrease(uint256 _priceIncrease) external override onlyOwner onlyInactive {
		priceIncrease = _priceIncrease;
		emit PriceIncreaseChanged(_priceIncrease);
	}

	function setRoundStartCstAuctionLength(uint256 roundStartCstAuctionLength_) external override onlyOwner onlyInactive {
		roundStartCstAuctionLength = roundStartCstAuctionLength_;
		emit RoundStartCstAuctionLengthChanged(roundStartCstAuctionLength_);
	}

	function setStartingBidPriceCSTMinLimit(uint256 newStartingBidPriceCSTMinLimit) external override onlyOwner onlyInactive {
		// require(
		// 	newStartingBidPriceCSTMinLimit >= CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT,
		// 	CosmicSignatureErrors.ProvidedStartingBidPriceCSTMinLimitIsTooSmall(
		// 		// todo-9 Can I phrase this better? Maybe "starting CST bid price".
		// 		"The provided starting bid price in CST min limit is too small.",
		// 		newStartingBidPriceCSTMinLimit,
		// 		CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT
		// 	)
		// );
		startingBidPriceCSTMinLimit = newStartingBidPriceCSTMinLimit;
		emit StartingBidPriceCSTMinLimitChanged(newStartingBidPriceCSTMinLimit);
	}

	function setTokenReward(uint256 _tokenReward) external override onlyOwner onlyInactive {
		tokenReward = _tokenReward;
		emit TokenRewardChanged(_tokenReward);
	}

	function setMainPrizePercentage(uint256 mainPrizePercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage_ + chronoWarriorEthPrizePercentage + rafflePercentage + stakingPercentage + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		mainPrizePercentage = mainPrizePercentage_;
		emit MainPrizePercentageChanged(mainPrizePercentage_);
	}

	function setChronoWarriorEthPrizePercentage(uint256 chronoWarriorEthPrizePercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage_ + rafflePercentage + stakingPercentage + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		chronoWarriorEthPrizePercentage = chronoWarriorEthPrizePercentage_;
		emit ChronoWarriorEthPrizePercentageChanged(chronoWarriorEthPrizePercentage_);
	}

	function setRafflePercentage(uint256 rafflePercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage + rafflePercentage_ + stakingPercentage + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		rafflePercentage = rafflePercentage_;
		emit RafflePercentageChanged(rafflePercentage_);
	}

	function setStakingPercentage(uint256 stakingPercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage + rafflePercentage + stakingPercentage_ + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		stakingPercentage = stakingPercentage_;
		emit StakingPercentageChanged(stakingPercentage_);
	}

	function setCharityPercentage(uint256 charityPercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage + rafflePercentage + stakingPercentage + charityPercentage_;
		require(
			percentageSum_ < 100,
			CosmicSignatureErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		charityPercentage = charityPercentage_;
		emit CharityPercentageChanged(charityPercentage_);
	}

	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external override onlyOwner onlyInactive {
		timeoutDurationToClaimMainPrize = newValue_;
		emit TimeoutDurationToClaimMainPrizeChanged(newValue_);
	}

	function setCstRewardAmountMultiplier(uint256 newValue_) external override onlyOwner onlyInactive {
		cstRewardAmountMultiplier = newValue_;
		emit CstRewardAmountMultiplierChanged(newValue_);
	}

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external override onlyOwner onlyInactive {
		numRaffleETHWinnersBidding = newNumRaffleETHWinnersBidding;
		emit NumRaffleETHWinnersBiddingChanged(numRaffleETHWinnersBidding);
	}

	function setNumRaffleNftWinnersBidding(uint256 newNumRaffleNftWinnersBidding) external override onlyOwner onlyInactive {
		numRaffleNftWinnersBidding = newNumRaffleNftWinnersBidding;
		emit NumRaffleNftWinnersBiddingChanged(numRaffleNftWinnersBidding);
	}

	function setNumRaffleNftWinnersStakingRWalk(uint256 newNumRaffleNftWinnersStakingRWalk) external override onlyOwner onlyInactive {
		numRaffleNftWinnersStakingRWalk = newNumRaffleNftWinnersStakingRWalk;
		emit NumRaffleNftWinnersStakingRWalkChanged(numRaffleNftWinnersStakingRWalk);
	}
}
