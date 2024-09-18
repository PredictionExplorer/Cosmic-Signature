// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { ICosmicToken } from "./ICosmicToken.sol";
import { ICosmicSignature } from "./ICosmicSignature.sol";
import { IStakingWalletCST } from "./IStakingWalletCST.sol";

interface ISystemEvents {

	/// @notice Emitted when the system mode is changed
	/// @param newSystemMode The new system mode
	event SystemModeChanged(uint256 newSystemMode);

	/// @notice Emitted when the charity address is changed
	/// @param newCharity The new charity address
	event CharityAddressChanged(address newCharity);

	/// @notice Emitted when the RandomWalk address is changed
	/// @param newRandomWalk The new RandomWalk address
	event RandomWalkAddressChanged(address newRandomWalk);

	/// @notice Emitted when the raffle wallet address is changed
	/// @param newRaffleWallet The new raffle wallet address
	event RaffleWalletAddressChanged(address newRaffleWallet);

	/// @notice Emitted when the CST staking wallet address is changed
	/// @param newStakingWalletCST The new CST staking wallet address
	event StakingWalletCSTAddressChanged(IStakingWalletCST newStakingWalletCST);

	/// @notice Emitted when the RWalk staking wallet address is changed
	/// @param newStakingWalletRWalk The new RWalk staking wallet address
	event StakingWalletRWalkAddressChanged(address newStakingWalletRWalk);

	/// @notice Emitted when the marketing wallet address is changed
	/// @param newMarketingWallet The new marketing wallet address
	event MarketingWalletAddressChanged(address newMarketingWallet);

	/// @notice Emitted when the Cosmic Token address is changed
	/// @param newCosmicToken The new Cosmic Token address
	event CosmicTokenAddressChanged(ICosmicToken newCosmicToken);

	/// @notice Emitted when the Cosmic Signature address is changed
	/// @param newCosmicSignature The new Cosmic Signature address
	event CosmicSignatureAddressChanged(ICosmicSignature newCosmicSignature);

	/// @notice Emitted when the number of ETH raffle winners for bidding is changed
	/// @param newNumRaffleETHWinnersBidding The new number of ETH raffle winners
	event NumRaffleETHWinnersBiddingChanged(uint256 newNumRaffleETHWinnersBidding);

	/// @notice Emitted when the number of NFT raffle winners for bidding is changed
	/// @param newNumRaffleNFTWinnersBidding The new number of NFT raffle winners
	event NumRaffleNFTWinnersBiddingChanged(uint256 newNumRaffleNFTWinnersBidding);

	/// @notice Emitted when the number of NFT raffle winners for RWalk staking is changed
	/// @param newNumRaffleNFTWinnersStakingRWalk The new number of NFT raffle winners for RWalk staking
	event NumRaffleNFTWinnersStakingRWalkChanged(uint256 newNumRaffleNFTWinnersStakingRWalk);

	/// @notice Emitted when the initial seconds until prize is changed
	/// @param newInitialSecondsUntilPrize The new initial seconds until prize
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);

	/// @notice Emitted when the initial bid amount fraction is changed
	/// @param newInitialBidAmountFraction The new initial bid amount fraction
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);

	/// @notice Emitted when the time increase is changed
	/// @param newTimeIncrease The new time increase value
	event TimeIncreaseChanged(uint256 newTimeIncrease);

	/// @notice Emitted when the price increase is changed
	/// @param newPriceIncrease The new price increase value
	event PriceIncreaseChanged(uint256 newPriceIncrease);

	/// @notice Emitted when the CST bid price min limit is changed
	/// @param newStartingBidPriceCSTMinLimit The new value
	event StartingBidPriceCSTMinLimitChanged(uint256 newStartingBidPriceCSTMinLimit);

	/// @notice Emitted when the nano seconds extra is changed
	/// @param newNanoSecondsExtra The new nano seconds extra value
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);

	/// @notice Emitted when the maximum message length is changed
	/// @param newMessageLength The new maximum message length
	event MaxMessageLengthChanged(uint256 newMessageLength);

	/// @notice Emitted when the timeout for claiming prize is changed
	/// @param newTimeout The new timeout value for claiming prize
	event TimeoutClaimPrizeChanged(uint256 newTimeout);

	/// @notice Emitted when the round start CST auction length is changed
	/// @param newAuctionLength The new round start CST auction length
	event RoundStartCSTAuctionLengthChanged(uint256 newAuctionLength);

	/// @notice Emitted when the token reward is changed
	/// @param newReward The new token reward value
	event TokenRewardChanged(uint256 newReward);

	/// @notice Emitted when the ERC20 reward multiplier is changed
	/// @param newMultiplier The new ERC20 reward multiplier
	event Erc20RewardMultiplierChanged(uint256 newMultiplier);

	/// @notice Emitted when the marketing reward is changed
	/// @param newReward The new marketing reward value
	event MarketingRewardChanged(uint256 newReward);

	/// @notice Emitted when the activation time is changed
	/// @param newActivationTime The new activation time
	event ActivationTimeChanged(uint256 newActivationTime);

	/// @notice Emitted when the charity percentage is changed
	/// @param newCharityPercentage The new charity percentage
	event CharityPercentageChanged(uint256 newCharityPercentage);

	/// @notice Emitted when the prize percentage is changed
	/// @param newPrizePercentage The new prize percentage
	event PrizePercentageChanged(uint256 newPrizePercentage);

	/// @notice Emitted when the raffle percentage is changed
	/// @param newRafflePercentage The new raffle percentage
	event RafflePercentageChanged(uint256 newRafflePercentage);

	/// @notice Emitted when the staking percentage is changed
	/// @param newStakingPercentage The new staking percentage
	event StakingPercentageChanged(uint256 newStakingPercentage);
}
