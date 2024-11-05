// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IEthPrizesWallet } from "./IEthPrizesWallet.sol";
import { ICosmicToken } from "./ICosmicToken.sol";
import { IMarketingWallet } from "./IMarketingWallet.sol";
import { ICosmicSignature } from "./ICosmicSignature.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";
import { IStakingWalletRandomWalkNft } from "./IStakingWalletRandomWalkNft.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface ISystemManagement is ICosmicSignatureGameStorage, ISystemEvents {
	// function prepareMaintenance() external;
	//
	// function setRuntimeMode() external;

	/// @notice Sets `activationTime`.
	/// @dev Only callable by the contract owner.
	/// @param newValue_ The new value.
	function setActivationTime(uint256 newValue_) external;

	/// @notice Calculates the duration until the game activates.
	/// @return The number of seconds until activation or 0 if already activated.
	/// todo-0 Rename to `durationUntilActivation`.
	/// todo-0 The same applies to all `timeUntil...` functions.
	function timeUntilActivation() external view returns (uint256);

	/// @notice Sets `delayDurationBeforeNextRound`.
	/// @dev Only callable by the contract owner.
	/// @param newValue_ The new value.
	function setDelayDurationBeforeNextRound(uint256 newValue_) external;

	/// @notice Sets the marketing reward amount.
	/// @dev Only callable by the contract owner.
	/// @param newValue_ The new value.
	function setMarketingReward(uint256 newValue_) external;

	/// @notice Set the maximum message length
	/// Comment-202409143 applies.
	/// @dev Only callable by the contract owner
	/// @param _maxMessageLength The new maximum message length
	function setMaxMessageLength(uint256 _maxMessageLength) external;

	/// @notice Sets the ETH prizes wallet address.
	/// @dev Only callable by the contract owner.
	/// @param ethPrizesWallet_ The new value.
	function setEthPrizesWallet(IEthPrizesWallet ethPrizesWallet_) external;

	/// @notice Set the Cosmic Token contract address
	/// @dev Only callable by the contract owner
	/// @param _token The new Cosmic Token contract address
	function setTokenContract(ICosmicToken _token) external;

	/// @notice Set the marketing wallet address
	/// @dev Only callable by the contract owner
	/// @param _marketingWallet The new marketing wallet address
	function setMarketingWallet(address _marketingWallet) external;

	/// @notice Set the Cosmic Signature NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _nft The new Cosmic Signature NFT contract address
	function setNftContract(ICosmicSignature _nft) external;

	/// @notice Set the `RandomWalkNFT` contract address
	/// @dev Only callable by the contract owner
	/// @param randomWalkNft_ The new `RandomWalkNFT` contract address
	function setRandomWalkNft(IRandomWalkNFT randomWalkNft_) external;

	/// @notice Set the CST staking wallet address
	/// @dev Only callable by the contract owner
	/// @param stakingWalletCosmicSignatureNft_ The new CST staking wallet address
	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft stakingWalletCosmicSignatureNft_) external;

	/// @notice Set the RandomWalk staking wallet address
	/// @dev Only callable by the contract owner
	/// @param stakingWalletRandomWalkNft_ The new RandomWalk staking wallet address
	function setStakingWalletRandomWalkNft(address stakingWalletRandomWalkNft_) external;

	/// @notice Set the charity address
	/// @dev Only callable by the contract owner
	/// @param _charity The new charity address
	function setCharity(address _charity) external;

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external;

	/// @notice Set the time increase factor
	/// @dev Only callable by the contract owner
	/// @param _timeIncrease The new time increase factor
	function setTimeIncrease(uint256 _timeIncrease) external;

	/// @notice Set the initial seconds until prize
	/// @dev Only callable by the contract owner
	/// @param _initialSecondsUntilPrize The new initial seconds until prize
	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external;

	/// todo-0 Rename to `set...`.
	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external;

	/// @notice Set the price increase factor
	/// @dev Only callable by the contract owner
	/// @param _priceIncrease The new price increase factor
	function setPriceIncrease(uint256 _priceIncrease) external;

	/// @notice Set the round start CST auction length
	/// @dev Only callable by the contract owner
	/// @param roundStartCstAuctionLength_ The new round start CST auction length
	function setRoundStartCstAuctionLength(uint256 roundStartCstAuctionLength_) external;

	function setStartingBidPriceCSTMinLimit(uint256 newStartingBidPriceCSTMinLimit) external;

	/// @notice Set the token reward amount
	/// @dev Only callable by the contract owner
	/// @param _tokenReward The new token reward amount
	function setTokenReward(uint256 _tokenReward) external;

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

	/// @notice Set the timeout for claiming prize
	/// @dev Only callable by the contract owner
	/// @param _timeoutClaimPrize The new timeout for claiming prize
	function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external;

	/// @notice Set the ERC20 reward multiplier
	/// @dev Only callable by the contract owner
	/// @param _erc20RewardMultiplier The new ERC20 reward multiplier
	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external;

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external;

	function setNumRaffleNFTWinnersBidding(uint256 newNumRaffleNFTWinnersBidding) external;

	function setNumRaffleNFTWinnersStakingRWalk(uint256 newNumRaffleNFTWinnersStakingRWalk) external;
}
