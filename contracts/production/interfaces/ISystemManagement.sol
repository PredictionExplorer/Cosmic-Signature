// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IPrizesWallet } from "./IPrizesWallet.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";
// import { IMarketingWallet } from "./IMarketingWallet.sol";
import { ICosmicSignatureNft } from "./ICosmicSignatureNft.sol";
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
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// @dev Comment-202411236 relates and/or applies.
	/// Comment-202411168 relates and/or applies.
	function setActivationTime(uint256 newValue_) external;

	/// @notice Calculates the duration until the game activates.
	/// @return The number of seconds until activation or 0 if already activated.
	/// todo-0 Rename to `durationUntilActivation`.
	/// todo-0 The same applies to all `timeUntil...` functions.
	function timeUntilActivation() external view returns (uint256);

	/// @notice Sets `delayDurationBeforeNextRound`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setDelayDurationBeforeNextRound(uint256 newValue_) external;

	/// @notice Sets `marketingReward`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMarketingReward(uint256 newValue_) external;

	/// @notice Set the maximum message length
	/// Only the contract owner is permitted to call this method.
	/// Comment-202409143 applies.
	/// @param _maxMessageLength The new maximum message length
	function setMaxMessageLength(uint256 _maxMessageLength) external;

	/// @notice Sets `prizesWallet`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setPrizesWallet(IPrizesWallet newValue_) external;

	/// @notice Sets `token`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// todo-1 Rename to `setCosmicSignatureToken`. Rename events, etc. Compare the code to `setCosmicSignatureNft`.
	function setTokenContract(ICosmicSignatureToken newValue_) external;

	/// @notice Sets `marketingWallet`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMarketingWallet(address newValue_) external;

	/// @notice Sets `nft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCosmicSignatureNft(ICosmicSignatureNft newValue_) external;

	/// @notice Sets `randomWalkNft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRandomWalkNft(IRandomWalkNFT newValue_) external;

	/// @notice Sets `stakingWalletCosmicSignatureNft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external;

	/// @notice Sets `stakingWalletRandomWalkNft`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setStakingWalletRandomWalkNft(IStakingWalletRandomWalkNft newValue_) external;

	/// @notice Sets `charityAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCharityAddress(address newValue_) external;

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external;

	/// @notice Set the time increase factor
	/// Only the contract owner is permitted to call this method.
	/// @param _timeIncrease The new time increase factor
	function setTimeIncrease(uint256 _timeIncrease) external;

	/// @notice Set the initial seconds until prize
	/// Only the contract owner is permitted to call this method.
	/// @param _initialSecondsUntilPrize The new initial seconds until prize
	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external;

	/// todo-0 Rename to `set...`.
	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external;

	/// @notice Set the price increase factor
	/// Only the contract owner is permitted to call this method.
	/// @param _priceIncrease The new price increase factor
	function setPriceIncrease(uint256 _priceIncrease) external;

	/// @notice Set the round start CST auction length
	/// Only the contract owner is permitted to call this method.
	/// @param roundStartCstAuctionLength_ The new round start CST auction length
	function setRoundStartCstAuctionLength(uint256 roundStartCstAuctionLength_) external;

	function setStartingBidPriceCSTMinLimit(uint256 newStartingBidPriceCSTMinLimit) external;

	/// @notice Set the token reward amount
	/// Only the contract owner is permitted to call this method.
	/// @param _tokenReward The new token reward amount
	function setTokenReward(uint256 _tokenReward) external;

	/// @notice Sets the main prize percentage.
	/// Only the contract owner is permitted to call this method.
	/// @param mainPrizePercentage_ The new value.
	function setMainPrizePercentage(uint256 mainPrizePercentage_) external;

	/// @notice Sets the Chrono-Warrior ETH prize percentage.
	/// Only the contract owner is permitted to call this method.
	/// @param chronoWarriorEthPrizePercentage_ The new value.
	function setChronoWarriorEthPrizePercentage(uint256 chronoWarriorEthPrizePercentage_) external;

	/// @notice Sets the raffle percentage.
	/// Only the contract owner is permitted to call this method.
	/// @param rafflePercentage_ The new value.
	function setRafflePercentage(uint256 rafflePercentage_) external;

	/// @notice Sets the staking percentage.
	/// Only the contract owner is permitted to call this method.
	/// @param stakingPercentage_ The new value.
	function setStakingPercentage(uint256 stakingPercentage_) external;

	/// @notice Sets the charity percentage.
	/// Only the contract owner is permitted to call this method.
	/// @param charityPercentage_ The new value.
	function setCharityPercentage(uint256 charityPercentage_) external;

	/// @notice Sets `timeoutDurationToClaimMainPrize`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external;

	/// @notice Sets `cstRewardAmountMultiplier`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCstRewardAmountMultiplier(uint256 newValue_) external;

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external;

	function setNumRaffleNftWinnersBidding(uint256 newNumRaffleNftWinnersBidding) external;

	function setNumRaffleNftWinnersStakingRWalk(uint256 newNumRaffleNftWinnersStakingRWalk) external;
}
