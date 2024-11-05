// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

// import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { IEthPrizesWallet } from "./interfaces/IEthPrizesWallet.sol";
import { EthPrizesWallet } from "./EthPrizesWallet.sol";
import { ICosmicToken } from "./interfaces/ICosmicToken.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { ICosmicSignature } from "./interfaces/ICosmicSignature.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IRandomWalkNFT } from "./interfaces/IRandomWalkNFT.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./interfaces/IStakingWalletCosmicSignatureNft.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is OwnableUpgradeable, CosmicSignatureGameStorage, ISystemManagement {
	// /// @dev Replaced with `onlyInactive`.
	// modifier onlyMaintenance() {
	// 	require(
	// 		systemMode == CosmicGameConstants.MODE_MAINTENANCE,
	// 		CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
	// 	);
	// 	_;
	// }
	//
	// /// @dev Replaced with `onlyActive`.
	// modifier onlyRuntime() {
	// 	require(
	// 		systemMode < CosmicGameConstants.MODE_MAINTENANCE,
	// 		CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
	// 	);
	// 	_;
	// }

	modifier onlyInactive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp < activationTimeCopy_,
			CosmicGameErrors.SystemIsActive("Already active.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	modifier onlyActive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp >= activationTimeCopy_,
			CosmicGameErrors.SystemIsInactive("Not active yet.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	// function prepareMaintenance() external override onlyOwner /*onlyRuntime*/ {
	// 	require(
	// 		systemMode == CosmicGameConstants.MODE_RUNTIME,
	// 		CosmicGameErrors.SystemMode("System must be in runtime mode.", systemMode)
	// 	);
	// 	systemMode = CosmicGameConstants.MODE_PREPARE_MAINTENANCE;
	// 	emit SystemModeChanged(systemMode);
	// }   
	//
	// function setRuntimeMode() external override onlyOwner onlyMaintenance {
	// 	systemMode = CosmicGameConstants.MODE_RUNTIME;
	// 	emit SystemModeChanged(systemMode);
	// }

	function setActivationTime(uint256 newValue_) external override onlyOwner onlyInactive {
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

	function setEthPrizesWallet(IEthPrizesWallet ethPrizesWallet_) external override onlyOwner onlyInactive {
		require(address(ethPrizesWallet_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		ethPrizesWallet = EthPrizesWallet(address(ethPrizesWallet_));
		emit EthPrizesWalletAddressChanged(ethPrizesWallet_);
	}

	function setTokenContract(ICosmicToken _token) external override onlyOwner onlyInactive {
		require(address(_token) != address(0),CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = CosmicToken(address(_token));
		emit CosmicTokenAddressChanged(_token);
	}

	function setMarketingWallet(address _marketingWallet) external override onlyOwner onlyInactive {
		require(_marketingWallet != address(0),CosmicGameErrors.ZeroAddress("Zero-address was given."));
		marketingWallet = _marketingWallet;
		emit MarketingWalletAddressChanged(_marketingWallet);
	}

	function setNftContract(ICosmicSignature _nft) external override onlyOwner onlyInactive {
		require(address(_nft) != address(0),CosmicGameErrors.ZeroAddress("Zero-address was given."));
		nft = CosmicSignature(address(_nft));
		emit CosmicSignatureAddressChanged(_nft);
	}

	function setRandomWalkNft(IRandomWalkNFT randomWalkNft_) external override onlyOwner onlyInactive {
		require(address(randomWalkNft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		randomWalkNft = RandomWalkNFT(address(randomWalkNft_));
		emit RandomWalkNftAddressChanged(randomWalkNft_);
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft stakingWalletCosmicSignatureNft_) external override onlyOwner onlyInactive {
		require(address(stakingWalletCosmicSignatureNft_) != address(0),CosmicGameErrors.ZeroAddress("Zero-address was given."));
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(stakingWalletCosmicSignatureNft_));
		emit StakingWalletCosmicSignatureNftAddressChanged(stakingWalletCosmicSignatureNft_);
	}

	function setStakingWalletRandomWalkNft(address stakingWalletRandomWalkNft_) external override onlyOwner onlyInactive {
		require(stakingWalletRandomWalkNft_ != address(0),CosmicGameErrors.ZeroAddress("Zero-address was given."));
		stakingWalletRandomWalkNft = stakingWalletRandomWalkNft_;
		emit StakingWalletRandomWalkNftAddressChanged(stakingWalletRandomWalkNft_);
	}

	function setCharity(address _charity) external override onlyOwner onlyInactive {
		require(_charity != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = _charity;
		emit CharityAddressChanged(_charity);
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
		// This ensures that SMTChecker won't flag the logic or an `assert` near Comment-202409163 or Comment-202409162.
		// We probably don't need a `require` to enforce this condition.
		// #enable_asserts assert(newStartingBidPriceCSTMinLimit <= type(uint256).max / CosmicGameConstants.MILLION);

		require(
			newStartingBidPriceCSTMinLimit >= CosmicGameConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT,
			CosmicGameErrors.ProvidedStartingBidPriceCSTMinLimitIsTooSmall(
				"Provided starting bid price in CST min limit is too small",
				newStartingBidPriceCSTMinLimit,
				CosmicGameConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT
			)
		);
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
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		mainPrizePercentage = mainPrizePercentage_;
		emit MainPrizePercentageChanged(mainPrizePercentage_);
	}

	function setChronoWarriorEthPrizePercentage(uint256 chronoWarriorEthPrizePercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage_ + rafflePercentage + stakingPercentage + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		chronoWarriorEthPrizePercentage = chronoWarriorEthPrizePercentage_;
		emit ChronoWarriorEthPrizePercentageChanged(chronoWarriorEthPrizePercentage_);
	}

	function setRafflePercentage(uint256 rafflePercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage + rafflePercentage_ + stakingPercentage + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		rafflePercentage = rafflePercentage_;
		emit RafflePercentageChanged(rafflePercentage_);
	}

	function setStakingPercentage(uint256 stakingPercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage + rafflePercentage + stakingPercentage_ + charityPercentage;
		require(
			percentageSum_ < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		stakingPercentage = stakingPercentage_;
		emit StakingPercentageChanged(stakingPercentage_);
	}

	function setCharityPercentage(uint256 charityPercentage_) external override onlyOwner onlyInactive {
		uint256 percentageSum_ = mainPrizePercentage + chronoWarriorEthPrizePercentage + rafflePercentage + stakingPercentage + charityPercentage_;
		require(
			percentageSum_ < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum_)
		);
		charityPercentage = charityPercentage_;
		emit CharityPercentageChanged(charityPercentage_);
	}

	function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external override onlyOwner onlyInactive {
		timeoutClaimPrize = _timeoutClaimPrize;
		emit TimeoutClaimPrizeChanged(_timeoutClaimPrize);
	}

	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external override onlyOwner onlyInactive {
		erc20RewardMultiplier = _erc20RewardMultiplier;
		emit Erc20RewardMultiplierChanged(_erc20RewardMultiplier);
	}

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external override onlyOwner onlyInactive {
		numRaffleETHWinnersBidding = newNumRaffleETHWinnersBidding;
		emit NumRaffleETHWinnersBiddingChanged(numRaffleETHWinnersBidding);
	}

	function setNumRaffleNFTWinnersBidding(uint256 newNumRaffleNFTWinnersBidding) external override onlyOwner onlyInactive {
		numRaffleNFTWinnersBidding = newNumRaffleNFTWinnersBidding;
		emit NumRaffleNFTWinnersBiddingChanged(numRaffleNFTWinnersBidding);
	}

	function setNumRaffleNFTWinnersStakingRWalk(uint256 newNumRaffleNFTWinnersStakingRWalk) external override onlyOwner onlyInactive {
		numRaffleNFTWinnersStakingRWalk = newNumRaffleNFTWinnersStakingRWalk;
		emit NumRaffleNFTWinnersStakingRWalkChanged(numRaffleNFTWinnersStakingRWalk);
	}
}
