// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IPrizesWallet } from "./IPrizesWallet.sol";
import { ICosmicSignatureToken } from "./ICosmicSignatureToken.sol";
// import { IMarketingWallet } from "./IMarketingWallet.sol";
import { ICosmicSignatureNft } from "./ICosmicSignatureNft.sol";
import { IRandomWalkNFT } from "./IRandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft } from "./IStakingWalletCosmicSignatureNft.sol";

interface ISystemEvents {
	// /// @notice Emitted when the system mode is changed.
	// /// @param newSystemMode The new system mode.
	// event SystemModeChanged(uint256 newSystemMode);

	/// @notice Emitted when the activation time is changed.
	/// @param newValue The new value.
	event ActivationTimeChanged(uint256 newValue);

	/// @notice Emitted when the delay duration before the next bidding round is changed.
	/// @param newValue The new value.
	event DelayDurationBeforeNextRoundChanged(uint256 newValue);

	/// @notice Emitted when `marketingReward` is changed.
	/// @param newValue The new value.
	event MarketingRewardChanged(uint256 newValue);

	/// @notice Emitted when the maximum message length is changed
	/// @param newMessageLength The new maximum message length
	event MaxMessageLengthChanged(uint256 newMessageLength);

	/// @notice Emitted when `prizesWallet` is changed.
	/// @param newValue The new value.
	event PrizesWalletAddressChanged(IPrizesWallet newValue);

	/// @notice Emitted when `token` is changed.
	/// @param newValue The new value.
	event TokenContractAddressChanged(ICosmicSignatureToken newValue);

	/// @notice Emitted when `marketingWallet` is changed.
	/// @param newValue The new value.
	event MarketingWalletAddressChanged(address newValue);

	/// @notice Emitted when `nft` is changed.
	/// @param newValue The new value.
	event CosmicSignatureNftAddressChanged(ICosmicSignatureNft newValue);

	/// @notice Emitted when the `RandomWalkNFT` address is changed
	/// @param newRandomWalkNft The new `RandomWalkNFT` address
	event RandomWalkNftAddressChanged(IRandomWalkNFT newRandomWalkNft);

	/// @notice Emitted when the CST staking wallet address is changed
	/// @param newStakingWalletCosmicSignatureNft The new CST staking wallet address
	event StakingWalletCosmicSignatureNftAddressChanged(IStakingWalletCosmicSignatureNft newStakingWalletCosmicSignatureNft);

	/// @notice Emitted when the RandomWalk staking wallet address is changed
	/// @param newStakingWalletRandomWalkNft The new RandomWalk staking wallet address
	event StakingWalletRandomWalkNftAddressChanged(address newStakingWalletRandomWalkNft);

	/// @notice Emitted when the charity address is changed
	/// @param newCharity The new charity address
	event CharityAddressChanged(address newCharity);

	/// @notice Emitted when the nano seconds extra is changed
	/// @param newNanoSecondsExtra The new nano seconds extra value
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);

	/// @notice Emitted when the time increase is changed
	/// @param newTimeIncrease The new time increase value
	event TimeIncreaseChanged(uint256 newTimeIncrease);

	/// @notice Emitted when the initial seconds until prize is changed
	/// @param newInitialSecondsUntilPrize The new initial seconds until prize
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);

	/// @notice Emitted when the initial bid amount fraction is changed
	/// @param newInitialBidAmountFraction The new initial bid amount fraction
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);

	/// @notice Emitted when the price increase is changed
	/// @param newPriceIncrease The new price increase value
	event PriceIncreaseChanged(uint256 newPriceIncrease);

	/// @notice Emitted when the round start CST auction length is changed
	/// @param newRoundStartCstAuctionLength The new round start CST auction length
	event RoundStartCstAuctionLengthChanged(uint256 newRoundStartCstAuctionLength);

	/// @notice Emitted when the CST bid price min limit is changed
	/// @param newStartingBidPriceCSTMinLimit The new value
	event StartingBidPriceCSTMinLimitChanged(uint256 newStartingBidPriceCSTMinLimit);

	/// @notice Emitted when the token reward is changed
	/// @param newReward The new token reward value
	event TokenRewardChanged(uint256 newReward);

	/// @notice Emitted when the main prize percentage is changed.
	/// @param newMainPrizePercentage The new value.
	event MainPrizePercentageChanged(uint256 newMainPrizePercentage);

	/// @notice Emitted when the Chrono-Warrior ETH prize percentage is changed.
	/// @param newChronoWarriorEthPrizePercentage The new value.
	event ChronoWarriorEthPrizePercentageChanged(uint256 newChronoWarriorEthPrizePercentage);

	/// @notice Emitted when the raffle percentage is changed.
	/// @param newRafflePercentage The new value.
	event RafflePercentageChanged(uint256 newRafflePercentage);

	/// @notice Emitted when the staking percentage is changed.
	/// @param newStakingPercentage The new value.
	event StakingPercentageChanged(uint256 newStakingPercentage);

	/// @notice Emitted when the charity percentage is changed.
	/// @param newCharityPercentage The new value.
	event CharityPercentageChanged(uint256 newCharityPercentage);

	/// @notice Emitted when `timeoutDurationToClaimMainPrize` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToClaimMainPrizeChanged(uint256 newValue);

	/// @notice Emitted when the ERC20 reward multiplier is changed
	/// @param newMultiplier The new ERC20 reward multiplier
	event Erc20RewardMultiplierChanged(uint256 newMultiplier);

	/// @notice Emitted when the number of ETH raffle winners for bidding is changed
	/// @param newNumRaffleETHWinnersBidding The new number of ETH raffle winners
	event NumRaffleETHWinnersBiddingChanged(uint256 newNumRaffleETHWinnersBidding);

	/// @notice Emitted when the number of NFT raffle winners for bidding is changed
	/// @param newNumRaffleNftWinnersBidding The new number of NFT raffle winners
	event NumRaffleNftWinnersBiddingChanged(uint256 newNumRaffleNftWinnersBidding);

	/// @notice Emitted when the number of NFT raffle winners for RWalk staking is changed
	/// @param newNumRaffleNftWinnersStakingRWalk The new number of NFT raffle winners for RWalk staking
	event NumRaffleNftWinnersStakingRWalkChanged(uint256 newNumRaffleNftWinnersStakingRWalk);
}
