// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";
import { ICosmicSignatureNft } from "./ICosmicSignatureNft.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";
import { IStakingWalletRandomWalkNft } from "./IStakingWalletRandomWalkNft.sol";
import { IPrizesWallet } from "./IPrizesWallet.sol";

interface ISystemEvents {
	// /// @notice Emitted when `systemMode` is changed.
	// /// @param newValue The new value.
	// event SystemModeChanged(uint256 newValue);

	/// @notice Emitted when `activationTime` is changed.
	/// @param newValue The new value.
	event ActivationTimeChanged(uint256 newValue);

	/// @notice Emitted when `delayDurationBeforeNextRound` is changed.
	/// @param newValue The new value.
	event DelayDurationBeforeNextRoundChanged(uint256 newValue);

	/// @notice Emitted when `marketingReward` is changed.
	/// @param newValue The new value.
	event MarketingRewardChanged(uint256 newValue);

	/// @notice Emitted when `maxMessageLength` is changed.
	/// @param newValue The new value.
	event MaxMessageLengthChanged(uint256 newValue);

	/// @notice Emitted when `token` is changed.
	/// @param newValue The new value.
	event TokenContractAddressChanged(ICosmicSignatureToken newValue);

	/// @notice Emitted when `marketingWallet` is changed.
	/// @param newValue The new value.
	event MarketingWalletAddressChanged(address newValue);

	/// @notice Emitted when `nft` is changed.
	/// @param newValue The new value.
	event CosmicSignatureNftAddressChanged(ICosmicSignatureNft newValue);

	/// @notice Emitted when `randomWalkNft` is changed.
	/// @param newValue The new value.
	event RandomWalkNftAddressChanged(IRandomWalkNFT newValue);

	/// @notice Emitted when `stakingWalletCosmicSignatureNft` is changed.
	/// @param newValue The new value.
	event StakingWalletCosmicSignatureNftAddressChanged(IStakingWalletCosmicSignatureNft newValue);

	/// @notice Emitted when `stakingWalletRandomWalkNft` is changed.
	/// @param newValue The new value.
	event StakingWalletRandomWalkNftAddressChanged(IStakingWalletRandomWalkNft newValue);

	/// @notice Emitted when `prizesWallet` is changed.
	/// @param newValue The new value.
	event PrizesWalletAddressChanged(IPrizesWallet newValue);

	/// @notice Emitted when `charityAddress` is changed.
	/// @param newValue The new value.
	event CharityAddressChanged(address indexed newValue);

	/// @notice Emitted when `nanoSecondsExtra` is changed.
	/// @param newValue The new value.
	event NanoSecondsExtraChanged(uint256 newValue);

	/// @notice Emitted when `timeIncrease` is changed.
	/// @param newValue The new value.
	event TimeIncreaseChanged(uint256 newValue);

	/// @notice Emitted when `initialSecondsUntilPrize` is changed.
	/// @param newValue The new value.
	event InitialSecondsUntilPrizeChanged(uint256 newValue);

	/// @notice Emitted when `initialBidAmountFraction` is changed.
	/// @param newValue The new value.
	event InitialBidAmountFractionChanged(uint256 newValue);

	/// @notice Emitted when `priceIncrease` is changed.
	/// @param newValue The new value.
	event PriceIncreaseChanged(uint256 newValue);

	/// @notice Emitted when `roundStartCstAuctionLength` is changed.
	/// @param newValue The new value.
	event RoundStartCstAuctionLengthChanged(uint256 newValue);

	/// @notice Emitted when `startingBidPriceCSTMinLimit` is changed.
	/// @param newValue The new value.
	event StartingBidPriceCSTMinLimitChanged(uint256 newValue);

	/// @notice Emitted when `tokenReward` is changed.
	/// @param newValue The new value.
	event TokenRewardChanged(uint256 newValue);

	/// @notice Emitted when `mainPrizePercentage` is changed.
	/// @param newValue The new value.
	event MainPrizePercentageChanged(uint256 newValue);

	/// @notice Emitted when `chronoWarriorEthPrizePercentage` is changed.
	/// @param newValue The new value.
	event ChronoWarriorEthPrizePercentageChanged(uint256 newValue);

	/// @notice Emitted when `rafflePercentage` is changed.
	/// @param newValue The new value.
	event RafflePercentageChanged(uint256 newValue);

	/// @notice Emitted when `stakingPercentage` is changed.
	/// @param newValue The new value.
	event StakingPercentageChanged(uint256 newValue);

	/// @notice Emitted when `charityPercentage` is changed.
	/// @param newValue The new value.
	event CharityPercentageChanged(uint256 newValue);

	/// @notice Emitted when `timeoutDurationToClaimMainPrize` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToClaimMainPrizeChanged(uint256 newValue);

	/// @notice Emitted when `cstRewardAmountMultiplier` is changed.
	/// @param newValue The new value.
	event CstRewardAmountMultiplierChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleETHWinnersBidding` is changed.
	/// @param newValue The new value.
	event NumRaffleETHWinnersBiddingChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleNftWinnersBidding` is changed.
	/// @param newValue The new value.
	event NumRaffleNftWinnersBiddingChanged(uint256 newValue);

	/// @notice Emitted when `numRaffleNftWinnersStakingRWalk` is changed.
	/// @param newValue The new value.
	event NumRaffleNftWinnersStakingRWalkChanged(uint256 newValue);
}
