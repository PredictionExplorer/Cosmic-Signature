// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { ICosmicToken } from "./ICosmicToken.sol";
import { ICosmicGameStorage } from "./ICosmicGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface ISystemManagement is ICosmicGameStorage, ISystemEvents {
	/// @notice Set the charity address
	/// @dev Only callable by the contract owner
	/// @param _charity The new charity address
   function setCharity(address _charity) external;

   function prepareMaintenance() external;

   function setRuntimeMode() external;

	/// @notice Set the RandomWalk NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _randomWalk The new RandomWalk NFT contract address
   function setRandomWalk(address _randomWalk) external;

	/// @notice Set the raffle wallet address
	/// @dev Only callable by the contract owner
	/// @param _raffleWallet The new raffle wallet address
   function setRaffleWallet(address _raffleWallet) external;

	/// @notice Set the CST staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletCST The new CST staking wallet address
   function setStakingWalletCST(address _stakingWalletCST) external;

	/// @notice Set the RWalk staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletRWalk The new RWalk staking wallet address
   function setStakingWalletRWalk(address _stakingWalletRWalk) external;

	/// @notice Set the marketing wallet address
	/// @dev Only callable by the contract owner
	/// @param _marketingWallet The new marketing wallet address
   function setMarketingWallet(address _marketingWallet) external;

	/// @notice Set the Cosmic Token contract address
	/// @dev Only callable by the contract owner
	/// @param _token The new Cosmic Token contract address
   function setTokenContract(ICosmicToken _token) external;

	/// @notice Set the Cosmic Signature NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _nft The new Cosmic Signature NFT contract address
   function setNftContract(address _nft) external;

	/// @notice Set the time increase factor
	/// @dev Only callable by the contract owner
	/// @param _timeIncrease The new time increase factor
   function setTimeIncrease(uint256 _timeIncrease) external;

	/// @notice Set the price increase factor
	/// @dev Only callable by the contract owner
	/// @param _priceIncrease The new price increase factor
   function setPriceIncrease(uint256 _priceIncrease) external;

	/// @notice Set the initial seconds until prize
	/// @dev Only callable by the contract owner
	/// @param _initialSecondsUntilPrize The new initial seconds until prize
   function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external;

	/// @notice Set the timeout for claiming prize
	/// @dev Only callable by the contract owner
	/// @param _timeoutClaimPrize The new timeout for claiming prize
   function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external;

	/// @notice Set the token reward amount
	/// @dev Only callable by the contract owner
	/// @param _tokenReward The new token reward amount
   function setTokenReward(uint256 _tokenReward) external;

	/// @notice Set the marketing reward amount
	/// @dev Only callable by the contract owner
	/// @param _marketingReward The new marketing reward amount
   function setMarketingReward(uint256 _marketingReward) external;

	/// @notice Set the maximum message length
	/// @dev Only callable by the contract owner
	/// @param _maxMessageLength The new maximum message length
   function setMaxMessageLength(uint256 _maxMessageLength) external;

	/// @notice Set the activation time
	/// @dev Only callable by the contract owner
	/// @param _activationTime The new activation time
   function setActivationTime(uint256 _activationTime) external;

	/// @notice Set the round start CST auction length
	/// @dev Only callable by the contract owner
	/// @param _roundStartCSTAuctionLength The new round start CST auction length
   function setRoundStartCSTAuctionLength(uint256 _roundStartCSTAuctionLength) external;

	/// @notice Set the ERC20 reward multiplier
	/// @dev Only callable by the contract owner
	/// @param _erc20RewardMultiplier The new ERC20 reward multiplier
   function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external;

	/// @notice Set the charity percentage
	/// @dev Only callable by the contract owner
	/// @param _charityPercentage The new charity percentage
   function setCharityPercentage(uint256 _charityPercentage) external;

	/// @notice Set the prize percentage
	/// @dev Only callable by the contract owner
	/// @param _prizePercentage The new prize percentage
   function setPrizePercentage(uint256 _prizePercentage) external;

	/// @notice Set the raffle percentage
	/// @dev Only callable by the contract owner
	/// @param _rafflePercentage The new raffle percentage
   function setRafflePercentage(uint256 _rafflePercentage) external;

	/// @notice Set the staking percentage
	/// @dev Only callable by the contract owner
	/// @param _stakingPercentage The new staking percentage
   function setStakingPercentage(uint256 _stakingPercentage) external;

	/// @notice Get the current system mode
	/// @return The current system mode (0: Runtime, 1: Prepare Maintenance, 2: Maintenance)
   /// todo-1 Why did someone hardcoded those magic numbes in a comment?
   function getSystemMode() external view returns (uint256);
}
