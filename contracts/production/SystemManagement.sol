// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { ISystemManagement } from "./interfaces/ISystemManagement.sol";

abstract contract SystemManagement is OwnableUpgradeable, CosmicGameStorage, ISystemManagement {
	function setCharity(address _charity) external override onlyOwner {
		require(_charity != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = _charity;
		emit CharityAddressChanged(_charity);
	}

	function prepareMaintenance() external override onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_RUNTIME,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
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
	
	function setRandomWalk(address _randomWalk) external override onlyOwner {
		require(_randomWalk != address(0), "Invalid address");
		randomWalk = _randomWalk;
		emit RandomWalkAddressChanged(_randomWalk);
	}

	function setRaffleWallet(address _raffleWallet) external override onlyOwner {
		require(_raffleWallet != address(0), "Invalid address");
		raffleWallet = _raffleWallet;
		emit RaffleWalletAddressChanged(_raffleWallet);
	}

	function setStakingWalletCST(address _stakingWalletCST) external override onlyOwner {
		require(_stakingWalletCST != address(0), "Invalid address");
		stakingWalletCST = _stakingWalletCST;
		emit StakingWalletCSTAddressChanged(_stakingWalletCST);
	}

	function setStakingWalletRWalk(address _stakingWalletRWalk) external override onlyOwner {
		require(_stakingWalletRWalk != address(0), "Invalid address");
		stakingWalletRWalk = _stakingWalletRWalk;
		emit StakingWalletRWalkAddressChanged(_stakingWalletRWalk);
	}

	function setMarketingWallet(address _marketingWallet) external override onlyOwner {
		require(_marketingWallet != address(0), "Invalid address");
		marketingWallet = _marketingWallet;
		emit MarketingWalletAddressChanged(_marketingWallet);
	}

	function setTokenContract(address _token) external override onlyOwner {
		require(_token != address(0), "Invalid address");
		token = _token;
		emit CosmicTokenAddressChanged(_token);
	}

	function setNftContract(address _nft) external override onlyOwner {
		require(_nft != address(0), "Invalid address");
		nft = _nft;
		emit CosmicSignatureAddressChanged(_nft);
	}

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		numRaffleETHWinnersBidding = newNumRaffleETHWinnersBidding;
		emit NumRaffleETHWinnersBiddingChanged(numRaffleETHWinnersBidding);
	}

	function setNumRaffleNFTWinnersBidding(uint256 newNumRaffleNFTWinnersBidding) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		numRaffleNFTWinnersBidding = newNumRaffleNFTWinnersBidding;
		emit NumRaffleNFTWinnersBiddingChanged(numRaffleNFTWinnersBidding);
	}

	function setNumRaffleNFTWinnersStakingRWalk(uint256 newNumRaffleNFTWinnersStakingRWalk) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		numRaffleNFTWinnersStakingRWalk = newNumRaffleNFTWinnersStakingRWalk;
		emit NumRaffleNFTWinnersStakingRWalkChanged(numRaffleNFTWinnersStakingRWalk);
	}

	function setTimeIncrease(uint256 _timeIncrease) external override onlyOwner {
		timeIncrease = _timeIncrease;
		emit TimeIncreaseChanged(_timeIncrease);
	}

	function setPriceIncrease(uint256 _priceIncrease) external override onlyOwner {
		priceIncrease = _priceIncrease;
		emit PriceIncreaseChanged(_priceIncrease);
	}

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		nanoSecondsExtra = newNanoSecondsExtra;
		emit NanoSecondsExtraChanged(nanoSecondsExtra);
	}

	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external override onlyOwner {
		initialSecondsUntilPrize = _initialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(_initialSecondsUntilPrize);
	}

	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		initialBidAmountFraction = newInitialBidAmountFraction;
		emit InitialBidAmountFractionChanged(initialBidAmountFraction);
	}

	function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external override onlyOwner {
		timeoutClaimPrize = _timeoutClaimPrize;
		emit TimeoutClaimPrizeChanged(_timeoutClaimPrize);
	}

	function setTokenReward(uint256 _tokenReward) external override onlyOwner {
		tokenReward = _tokenReward;
		emit TokenRewardChanged(_tokenReward);
	}

	function setMarketingReward(uint256 _marketingReward) external override onlyOwner {
		marketingReward = _marketingReward;
		emit MarketingRewardChanged(_marketingReward);
	}

	function setMaxMessageLength(uint256 _maxMessageLength) external override onlyOwner {
		maxMessageLength = _maxMessageLength;
		emit MaxMessageLengthChanged(_maxMessageLength);
	}

	function setActivationTime(uint256 _activationTime) external override onlyOwner {
		activationTime = _activationTime;
		lastCSTBidTime = _activationTime;
		emit ActivationTimeChanged(_activationTime);
	}

	function setRoundStartCSTAuctionLength(uint256 _roundStartCSTAuctionLength) external override onlyOwner {
		RoundStartCSTAuctionLength = _roundStartCSTAuctionLength;
		emit RoundStartCSTAuctionLengthChanged(_roundStartCSTAuctionLength);
	}

	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external override onlyOwner {
		erc20RewardMultiplier = _erc20RewardMultiplier;
		emit Erc20RewardMultiplierChanged(_erc20RewardMultiplier);
	}

	function setCharityPercentage(uint256 _charityPercentage) external override onlyOwner {
		charityPercentage = _charityPercentage;
		emit CharityPercentageChanged(_charityPercentage);
	}

	function setPrizePercentage(uint256 _prizePercentage) external override onlyOwner {
		prizePercentage = _prizePercentage;
		emit PrizePercentageChanged(_prizePercentage);
	}

	function setRafflePercentage(uint256 _rafflePercentage) external override onlyOwner {
		rafflePercentage = _rafflePercentage;
		emit RafflePercentageChanged(_rafflePercentage);
	}

	function setStakingPercentage(uint256 _stakingPercentage) external override onlyOwner {
		stakingPercentage = _stakingPercentage;
		emit StakingPercentageChanged(_stakingPercentage);
	}

	function getSystemMode() public view override returns (uint256) {
		return systemMode;
	}
}
