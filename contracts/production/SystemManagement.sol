// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { ICosmicToken } from "./interfaces/ICosmicToken.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { ICosmicSignature } from "./interfaces/ICosmicSignature.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IStakingWalletCST } from "./interfaces/IStakingWalletCST.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is OwnableUpgradeable, CosmicGameStorage, ISystemManagement {

	modifier onlyRuntime() {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		_;
	}

	modifier onlyMaintenance() {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		_;
	}

	function setCharity(address _charity) external override onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(_charity != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = _charity;
		emit CharityAddressChanged(_charity);
	}

	function prepareMaintenance() external override onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_RUNTIME,
			CosmicGameErrors.SystemMode("System must be in runtime mode", systemMode)
		);
		systemMode = CosmicGameConstants.MODE_PREPARE_MAINTENANCE;
		emit SystemModeChanged(systemMode);
	}   

	function setRuntimeMode() external override onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		systemMode = CosmicGameConstants.MODE_RUNTIME;
		emit SystemModeChanged(systemMode);
	}

	function setRandomWalk(address _randomWalk) external override onlyOwner onlyMaintenance {
		require(_randomWalk != address(0), "Invalid address");
		randomWalk = _randomWalk;
		emit RandomWalkAddressChanged(_randomWalk);
	}

	function setRaffleWallet(address _raffleWallet) external override onlyOwner onlyMaintenance {
		require(_raffleWallet != address(0), "Invalid address");
		raffleWallet = _raffleWallet;
		emit RaffleWalletAddressChanged(_raffleWallet);
	}

	function setStakingWalletCST(IStakingWalletCST _stakingWalletCST) external override onlyOwner onlyMaintenance {
		require(address(_stakingWalletCST) != address(0), "Invalid address");
		stakingWalletCST = StakingWalletCST(address(_stakingWalletCST));
		emit StakingWalletCSTAddressChanged(_stakingWalletCST);
	}

	function setStakingWalletRWalk(address _stakingWalletRWalk) external override onlyOwner onlyMaintenance {
		require(_stakingWalletRWalk != address(0), "Invalid address");
		stakingWalletRWalk = _stakingWalletRWalk;
		emit StakingWalletRWalkAddressChanged(_stakingWalletRWalk);
	}

	function setMarketingWallet(address _marketingWallet) external override onlyOwner onlyMaintenance {
		require(_marketingWallet != address(0), "Invalid address");
		marketingWallet = _marketingWallet;
		emit MarketingWalletAddressChanged(_marketingWallet);
	}

	function setTokenContract(ICosmicToken _token) external override onlyOwner onlyMaintenance {
		require(address(_token) != address(0), "Invalid address");
		token = CosmicToken(address(_token));
		emit CosmicTokenAddressChanged(_token);
	}

	function setNftContract(ICosmicSignature _nft) external override onlyOwner onlyMaintenance {
		require(address(_nft) != address(0), "Invalid address");
		nft = CosmicSignature(address(_nft));
		emit CosmicSignatureAddressChanged(_nft);
	}

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external onlyOwner onlyMaintenance {
		numRaffleETHWinnersBidding = newNumRaffleETHWinnersBidding;
		emit NumRaffleETHWinnersBiddingChanged(numRaffleETHWinnersBidding);
	}

	function setNumRaffleNFTWinnersBidding(uint256 newNumRaffleNFTWinnersBidding) external onlyOwner onlyMaintenance {
		numRaffleNFTWinnersBidding = newNumRaffleNFTWinnersBidding;
		emit NumRaffleNFTWinnersBiddingChanged(numRaffleNFTWinnersBidding);
	}

	function setNumRaffleNFTWinnersStakingRWalk(uint256 newNumRaffleNFTWinnersStakingRWalk) external onlyOwner onlyMaintenance {
		numRaffleNFTWinnersStakingRWalk = newNumRaffleNFTWinnersStakingRWalk;
		emit NumRaffleNFTWinnersStakingRWalkChanged(numRaffleNFTWinnersStakingRWalk);
	}

	function setTimeIncrease(uint256 _timeIncrease) external override onlyOwner onlyMaintenance {
		timeIncrease = _timeIncrease;
		emit TimeIncreaseChanged(_timeIncrease);
	}

	function setPriceIncrease(uint256 _priceIncrease) external override onlyOwner onlyMaintenance {
		priceIncrease = _priceIncrease;
		emit PriceIncreaseChanged(_priceIncrease);
	}

	function setStartingBidPriceCSTMinLimit(uint256 newStartingBidPriceCSTMinLimit) external override onlyOwner onlyMaintenance {
		// This ensures that SMTChecker won't flag the logic or an `assert` near Comment-202409163 or Comment-202409162.
		// #enable_asserts assert(newStartingBidPriceCSTMinLimit <= type(uint256).max / CosmicGameConstants.MILLION);

		// todo-0 Do we really need this validation?
		// todo-0 If we do, do we need a custom error for it?
		require(newStartingBidPriceCSTMinLimit >= CosmicGameConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT);
		startingBidPriceCSTMinLimit = newStartingBidPriceCSTMinLimit;
		emit StartingBidPriceCSTMinLimitChanged(newStartingBidPriceCSTMinLimit);
	}

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external override onlyOwner onlyMaintenance {
		nanoSecondsExtra = newNanoSecondsExtra;
		emit NanoSecondsExtraChanged(newNanoSecondsExtra);
	}

	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external override onlyOwner onlyMaintenance {
		initialSecondsUntilPrize = _initialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(_initialSecondsUntilPrize);
	}

	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external override onlyOwner onlyMaintenance {
		initialBidAmountFraction = newInitialBidAmountFraction;
		emit InitialBidAmountFractionChanged(initialBidAmountFraction);
	}

	function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external override onlyOwner onlyMaintenance {
		timeoutClaimPrize = _timeoutClaimPrize;
		emit TimeoutClaimPrizeChanged(_timeoutClaimPrize);
	}

	function setTokenReward(uint256 _tokenReward) external override onlyOwner onlyMaintenance {
		tokenReward = _tokenReward;
		emit TokenRewardChanged(_tokenReward);
	}

	function setMarketingReward(uint256 _marketingReward) external override onlyOwner onlyMaintenance {
		marketingReward = _marketingReward;
		emit MarketingRewardChanged(_marketingReward);
	}

	function setMaxMessageLength(uint256 _maxMessageLength) external override onlyOwner onlyMaintenance {
		maxMessageLength = _maxMessageLength;
		emit MaxMessageLengthChanged(_maxMessageLength);
	}

	function setActivationTime(uint256 _activationTime) external override onlyOwner onlyMaintenance {
		activationTime = _activationTime;
		lastCSTBidTime = _activationTime;
		emit ActivationTimeChanged(_activationTime);
	}

	function setRoundStartCSTAuctionLength(uint256 _roundStartCSTAuctionLength) external override onlyOwner onlyMaintenance {
		RoundStartCSTAuctionLength = _roundStartCSTAuctionLength;
		emit RoundStartCSTAuctionLengthChanged(_roundStartCSTAuctionLength);
	}

	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external override onlyOwner onlyMaintenance {
		erc20RewardMultiplier = _erc20RewardMultiplier;
		emit Erc20RewardMultiplierChanged(_erc20RewardMultiplier);
	}

	function setCharityPercentage(uint256 _charityPercentage) external override onlyOwner onlyMaintenance {
		charityPercentage = _charityPercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit CharityPercentageChanged(_charityPercentage);
	}

	function setPrizePercentage(uint256 _prizePercentage) external override onlyOwner onlyMaintenance {
		prizePercentage = _prizePercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit PrizePercentageChanged(_prizePercentage);
	}

	function setRafflePercentage(uint256 _rafflePercentage) external override onlyOwner onlyMaintenance {
		rafflePercentage = _rafflePercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit RafflePercentageChanged(_rafflePercentage);
	}

	function setStakingPercentage(uint256 _stakingPercentage) external override onlyOwner onlyMaintenance {
		stakingPercentage = _stakingPercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit StakingPercentageChanged(_stakingPercentage);
	}

	function getSystemMode() public view override returns (uint256) {
		return systemMode;
	}
}
