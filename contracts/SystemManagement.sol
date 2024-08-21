
// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./CosmicGameStorage.sol";
import "./interfaces/ISystemEvents.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";

abstract contract SystemManagement is OwnableUpgradeable , CosmicGameStorage, ISystemEvents {

	/// @notice Set the charity address
	/// @dev Only callable by the contract owner
	/// @param _charity The new charity address
	function setCharity(address _charity) external onlyOwner {
		require(_charity != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = _charity;
		emit CharityAddressChanged(_charity);
	}

    function prepareMaintenance() external onlyOwner {
        require(
            systemMode == CosmicGameConstants.MODE_RUNTIME,
            CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
        );
        systemMode = CosmicGameConstants.MODE_PREPARE_MAINTENANCE;
        emit SystemModeChanged(systemMode);
    }   

    function setRuntimeMode() external onlyOwner {
        require(
            systemMode == CosmicGameConstants.MODE_MAINTENANCE,
            CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
        );
        systemMode = CosmicGameConstants.MODE_RUNTIME;
        emit SystemModeChanged(systemMode);
    }

	/// @notice Set the RandomWalk NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _randomWalk The new RandomWalk NFT contract address
	function setRandomWalk(address _randomWalk) external onlyOwner {
		require(_randomWalk != address(0), "Invalid address");
		randomWalk = _randomWalk;
		emit RandomWalkAddressChanged(_randomWalk);
	}

	/// @notice Set the raffle wallet address
	/// @dev Only callable by the contract owner
	/// @param _raffleWallet The new raffle wallet address
	function setRaffleWallet(address _raffleWallet) external onlyOwner {
		require(_raffleWallet != address(0), "Invalid address");
		raffleWallet = _raffleWallet;
		emit RaffleWalletAddressChanged(_raffleWallet);
	}

	/// @notice Set the CST staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletCST The new CST staking wallet address
	function setStakingWalletCST(address _stakingWalletCST) external onlyOwner {
		require(_stakingWalletCST != address(0), "Invalid address");
		stakingWalletCST = _stakingWalletCST;
		emit StakingWalletCSTAddressChanged(_stakingWalletCST);
	}

	/// @notice Set the RWalk staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletRWalk The new RWalk staking wallet address
	function setStakingWalletRWalk(address _stakingWalletRWalk) external onlyOwner {
		require(_stakingWalletRWalk != address(0), "Invalid address");
		stakingWalletRWalk = _stakingWalletRWalk;
		emit StakingWalletRWalkAddressChanged(_stakingWalletRWalk);
	}

	/// @notice Set the marketing wallet address
	/// @dev Only callable by the contract owner
	/// @param _marketingWallet The new marketing wallet address
	function setMarketingWallet(address _marketingWallet) external onlyOwner {
		require(_marketingWallet != address(0), "Invalid address");
		marketingWallet = _marketingWallet;
		emit MarketingWalletAddressChanged(_marketingWallet);
	}

	/// @notice Set the Cosmic Token contract address
	/// @dev Only callable by the contract owner
	/// @param _token The new Cosmic Token contract address
	function setTokenContract(address _token) external onlyOwner {
		require(_token != address(0), "Invalid address");
		token = _token;
		emit CosmicTokenAddressChanged(_token);
	}

	/// @notice Set the Cosmic Signature NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _nft The new Cosmic Signature NFT contract address
	function setNftContract(address _nft) external onlyOwner {
		require(_nft != address(0), "Invalid address");
		nft = _nft;
		emit CosmicSignatureAddressChanged(_nft);
	}

	/// @notice Set the time increase factor
	/// @dev Only callable by the contract owner
	/// @param _timeIncrease The new time increase factor
	function setTimeIncrease(uint256 _timeIncrease) external onlyOwner {
		timeIncrease = _timeIncrease;
		emit TimeIncreaseChanged(_timeIncrease);
	}

	/// @notice Set the price increase factor
	/// @dev Only callable by the contract owner
	/// @param _priceIncrease The new price increase factor
	function setPriceIncrease(uint256 _priceIncrease) external onlyOwner {
		priceIncrease = _priceIncrease;
		emit PriceIncreaseChanged(_priceIncrease);
	}

	/// @notice Set the initial seconds until prize
	/// @dev Only callable by the contract owner
	/// @param _initialSecondsUntilPrize The new initial seconds until prize
	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external onlyOwner {
		initialSecondsUntilPrize = _initialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(_initialSecondsUntilPrize);
	}

	/// @notice Set the timeout for claiming prize
	/// @dev Only callable by the contract owner
	/// @param _timeoutClaimPrize The new timeout for claiming prize
	function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external onlyOwner {
		timeoutClaimPrize = _timeoutClaimPrize;
		emit TimeoutClaimPrizeChanged(_timeoutClaimPrize);
	}

	/// @notice Set the token reward amount
	/// @dev Only callable by the contract owner
	/// @param _tokenReward The new token reward amount
	function setTokenReward(uint256 _tokenReward) external onlyOwner {
		tokenReward = _tokenReward;
		emit TokenRewardChanged(_tokenReward);
	}

	/// @notice Set the marketing reward amount
	/// @dev Only callable by the contract owner
	/// @param _marketingReward The new marketing reward amount
	function setMarketingReward(uint256 _marketingReward) external onlyOwner {
		marketingReward = _marketingReward;
		emit MarketingRewardChanged(_marketingReward);
	}

	/// @notice Set the maximum message length
	/// @dev Only callable by the contract owner
	/// @param _maxMessageLength The new maximum message length
	function setMaxMessageLength(uint256 _maxMessageLength) external onlyOwner {
		maxMessageLength = _maxMessageLength;
		emit MaxMessageLengthChanged(_maxMessageLength);
	}

	/// @notice Set the activation time
	/// @dev Only callable by the contract owner
	/// @param _activationTime The new activation time
	function setActivationTime(uint256 _activationTime) external onlyOwner {
		activationTime = _activationTime;
		lastCSTBidTime = _activationTime;
		emit ActivationTimeChanged(_activationTime);
	}

	/// @notice Set the round start CST auction length
	/// @dev Only callable by the contract owner
	/// @param _roundStartCSTAuctionLength The new round start CST auction length
	function setRoundStartCSTAuctionLength(uint256 _roundStartCSTAuctionLength) external onlyOwner {
		RoundStartCSTAuctionLength = _roundStartCSTAuctionLength;
		emit RoundStartCSTAuctionLengthChanged(_roundStartCSTAuctionLength);
	}

	/// @notice Set the ERC20 reward multiplier
	/// @dev Only callable by the contract owner
	/// @param _erc20RewardMultiplier The new ERC20 reward multiplier
	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external onlyOwner {
		erc20RewardMultiplier = _erc20RewardMultiplier;
		emit Erc20RewardMultiplierChanged(_erc20RewardMultiplier);
	}

	/// @notice Set the charity percentage
	/// @dev Only callable by the contract owner
	/// @param _charityPercentage The new charity percentage
	function setCharityPercentage(uint256 _charityPercentage) external onlyOwner {
		charityPercentage = _charityPercentage;
		emit CharityPercentageChanged(_charityPercentage);
	}

	/// @notice Set the prize percentage
	/// @dev Only callable by the contract owner
	/// @param _prizePercentage The new prize percentage
	function setPrizePercentage(uint256 _prizePercentage) external onlyOwner {
		prizePercentage = _prizePercentage;
		emit PrizePercentageChanged(_prizePercentage);
	}

	/// @notice Set the raffle percentage
	/// @dev Only callable by the contract owner
	/// @param _rafflePercentage The new raffle percentage
	function setRafflePercentage(uint256 _rafflePercentage) external onlyOwner {
		rafflePercentage = _rafflePercentage;
		emit RafflePercentageChanged(_rafflePercentage);
	}

	/// @notice Set the staking percentage
	/// @dev Only callable by the contract owner
	/// @param _stakingPercentage The new staking percentage
	function setStakingPercentage(uint256 _stakingPercentage) external onlyOwner {
		stakingPercentage = _stakingPercentage;
		emit StakingPercentageChanged(_stakingPercentage);
	}

	/// @notice Get the current system mode
	/// @return The current system mode (0: Runtime, 1: Prepare Maintenance, 2: Maintenance)
	function getSystemMode() public view returns (uint256) {
		return systemMode;
	}


}
