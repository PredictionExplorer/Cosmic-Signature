// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";
import { ICosmicSignatureNft } from "./ICosmicSignatureNft.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";
import { IStakingWalletRandomWalkNft } from "./IStakingWalletRandomWalkNft.sol";
import { IPrizesWallet } from "./IPrizesWallet.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface ISystemManagement is IAddressValidator, ICosmicSignatureGameStorage, ISystemEvents {
	// function prepareMaintenance() external;
	//
	// function setRuntimeMode() external;

	/// @notice Sets `activationTime`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// @dev Comment-202411236 relates and/or applies.
	/// Comment-202411168 relates and/or applies.
	function setActivationTime(uint256 newValue_) external;

	/// @notice Calculates the duration until the Game activates.
	/// @return The number of seconds until the activation or 0 if already activated.
	function getDurationUntilActivation() external view returns (uint256);

	/// @notice Sets `delayDurationBeforeNextRound`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setDelayDurationBeforeNextRound(uint256 newValue_) external;

	// /// @notice Sets `marketingReward`.
	// /// Only the contract owner is permitted to call this method.
	// /// @param newValue_ The new value.
	// function setMarketingReward(uint256 newValue_) external;

	/// @notice Sets `maxMessageLength`.
	/// Only the contract owner is permitted to call this method.
	/// Comment-202409143 applies.
	/// @param newValue_ The new value.
	function setMaxMessageLength(uint256 newValue_) external;

	/// @notice Sets `token`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external;

	// /// @notice Sets `marketingWallet`.
	// /// Only the contract owner is permitted to call this method.
	// /// @param newValue_ The new value.
	// function setMarketingWallet(address newValue_) external;

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

	/// @notice Sets `prizesWallet`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setPrizesWallet(IPrizesWallet newValue_) external;

	/// @notice Sets `charityAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCharityAddress(address newValue_) external;

	function setNanoSecondsExtra(uint256 newValue_) external;

	/// @notice Sets `timeIncrease`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTimeIncrease(uint256 newValue_) external;

	/// @notice Sets `initialSecondsUntilPrize`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setInitialSecondsUntilPrize(uint256 newValue_) external;

	function setInitialBidAmountFraction(uint256 newValue_) external;

	/// @notice Sets `priceIncrease`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setPriceIncrease(uint256 newValue_) external;

	/// @notice Sets `roundStartCstAuctionLength`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRoundStartCstAuctionLength(uint256 newValue_) external;

	function setStartingBidPriceCSTMinLimit(uint256 newValue_) external;

	/// @notice Sets `tokenReward`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTokenReward(uint256 newValue_) external;

	/// @notice Sets `mainEthPrizeAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMainEthPrizeAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `chronoWarriorEthPrizeAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setChronoWarriorEthPrizeAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `raffleTotalEthPrizeAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRaffleTotalEthPrizeAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `stakingTotalEthRewardAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setStakingTotalEthRewardAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `charityEthDonationAmountPercentage`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCharityEthDonationAmountPercentage(uint256 newValue_) external;

	/// @notice Sets `timeoutDurationToClaimMainPrize`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTimeoutDurationToClaimMainPrize(uint256 newValue_) external;

	/// @notice Sets `cstRewardAmountMultiplier`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCstRewardAmountMultiplier(uint256 newValue_) external;

	function setNumRaffleEthPrizesForBidders(uint256 newValue_) external;

	function setNumRaffleCosmicSignatureNftsForBidders(uint256 newValue_) external;

	function setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(uint256 newValue_) external;
}
