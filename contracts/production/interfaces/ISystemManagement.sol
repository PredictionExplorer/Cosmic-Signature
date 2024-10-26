// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { ICosmicToken } from "./ICosmicToken.sol";
import { ICosmicSignature } from "./ICosmicSignature.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";
import { IEthPrizesWallet } from "./IEthPrizesWallet.sol";
import { ICosmicGameStorage } from "./ICosmicGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface ISystemManagement is ICosmicGameStorage, ISystemEvents {
	/// @notice Set the charity address
	/// @dev Only callable by the contract owner
	/// @param _charity The new charity address
	function setCharity(address _charity) external;

	function prepareMaintenance() external;

	function setRuntimeMode() external;

	/// @notice Set the `RandomWalkNFT` contract address
	/// @dev Only callable by the contract owner
	/// @param randomWalkNft_ The new `RandomWalkNFT` contract address
	function setRandomWalkNft(IRandomWalkNFT randomWalkNft_) external;

	/// @notice Sets the ETH prizes wallet address.
	/// @dev Only callable by the contract owner.
	/// @param ethPrizesWallet_ The new value.
	function setEthPrizesWallet(IEthPrizesWallet ethPrizesWallet_) external;

	/// @notice Set the CST staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletCosmicSignatureNft The new CST staking wallet address
	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft _stakingWalletCosmicSignatureNft) external;

	/// @notice Set the RandomWalk staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletRandomWalkNft The new RandomWalk staking wallet address
	function setStakingWalletRandomWalkNft(address _stakingWalletRandomWalkNft) external;

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
	function setNftContract(ICosmicSignature _nft) external;

	/// @notice Set the time increase factor
	/// @dev Only callable by the contract owner
	/// @param _timeIncrease The new time increase factor
	function setTimeIncrease(uint256 _timeIncrease) external;

	/// @notice Set the price increase factor
	/// @dev Only callable by the contract owner
	/// @param _priceIncrease The new price increase factor
	function setPriceIncrease(uint256 _priceIncrease) external;

	function setStartingBidPriceCSTMinLimit(uint256 newStartingBidPriceCSTMinLimit) external;

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external;

	/// @notice Set the initial seconds until prize
	/// @dev Only callable by the contract owner
	/// @param _initialSecondsUntilPrize The new initial seconds until prize
	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external;

	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external;

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
	/// Comment-202409143 applies.
	/// @dev Only callable by the contract owner
	/// @param _maxMessageLength The new maximum message length
	function setMaxMessageLength(uint256 _maxMessageLength) external;

	/// @notice Set the activation time
	/// @dev Only callable by the contract owner
	/// @param activationTime_ The new activation time
	function setActivationTime(uint256 activationTime_) external;

	/// @notice Get the time until the game activates
	/// @return The number of seconds until activation, or 0 if already activated
	function timeUntilActivation() external view returns (uint256);

	/// @notice Set the round start CST auction length
	/// @dev Only callable by the contract owner
	/// @param roundStartCstAuctionLength_ The new round start CST auction length
	function setRoundStartCstAuctionLength(uint256 roundStartCstAuctionLength_) external;

	/// @notice Set the ERC20 reward multiplier
	/// @dev Only callable by the contract owner
	/// @param _erc20RewardMultiplier The new ERC20 reward multiplier
	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external;

	/// @notice Sets the main prize percentage.
	/// @dev Only callable by the contract owner.
	/// @param mainPrizePercentage_ The new value.
	function setMainPrizePercentage(uint256 mainPrizePercentage_) external;

	/// @notice Sets the Chrono-Warrior ETH prize percentage.
	/// @dev Only callable by the contract owner.
	/// @param chronoWarriorEthPrizePercentage_ The new value.
	function setChronoWarriorEthPrizePercentage(uint256 chronoWarriorEthPrizePercentage_) external;

	/// @notice Sets the raffle percentage.
	/// @dev Only callable by the contract owner.
	/// @param rafflePercentage_ The new value.
	function setRafflePercentage(uint256 rafflePercentage_) external;

	/// @notice Sets the staking percentage.
	/// @dev Only callable by the contract owner.
	/// @param stakingPercentage_ The new value.
	function setStakingPercentage(uint256 stakingPercentage_) external;

	/// @notice Sets the charity percentage.
	/// @dev Only callable by the contract owner.
	/// @param charityPercentage_ The new value.
	function setCharityPercentage(uint256 charityPercentage_) external;

	/// @notice Get the current system mode
	/// @return The current system mode (0: Runtime, 1: Prepare Maintenance, 2: Maintenance)
	/// todo-1 Why did someone hardcoded those magic numbes in a comment?
	function getSystemMode() external view returns (uint256);
}
