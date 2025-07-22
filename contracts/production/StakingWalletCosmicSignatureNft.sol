// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IStakingWalletNftBase, StakingWalletNftBase } from "./StakingWalletNftBase.sol";
import { IStakingWalletCosmicSignatureNft } from "./interfaces/IStakingWalletCosmicSignatureNft.sol";

// #endregion
// #region

contract StakingWalletCosmicSignatureNft is ReentrancyGuardTransient, Ownable, StakingWalletNftBase, IStakingWalletCosmicSignatureNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct StakeAction {
		uint256 nftId;

		/// @dev
		/// [Comment-202504011]
		/// Would it make sense to reorder variables like `nftOwnerAddress` and `stakerAddress` to before `NftId`?
		/// Regardless, let's leave it alone.
		/// [/Comment-202504011]
		address nftOwnerAddress;

		/// @notice A copy of `StakingWalletCosmicSignatureNft.rewardAmountPerStakedNft`
		/// saved when creating this `StakeAction` instance.
		uint256 initialRewardAmountPerStakedNft;
	}

	// #endregion
	// #region State

	/// @notice The `CosmicSignatureNft` contract address.
	CosmicSignatureNft public immutable nft;

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	/// @notice Details about currently staked NFTs.
	/// Item index corresponds to stake action ID.
	/// Comment-202502266 relates.
	/// This array is sparse (can contain gaps).
	StakeAction[1 << 64] public stakeActions;

	/// @notice The all-time cumulative staking ETH reward amount per staked NFT.
	uint256 public rewardAmountPerStakedNft = 0;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param nft_ The `CosmicSignatureNft` contract address.
	/// @param game_ The `CosmicSignatureGame` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    Inherited `constructor`s.
	///    `_msgSender`.
	///    `_providedAddressIsNonZero`.
	///    `nft`.
	///    `game`.
	constructor(CosmicSignatureNft nft_, address game_)
		_providedAddressIsNonZero(address(nft_))
		_providedAddressIsNonZero(game_)
		Ownable(_msgSender()) {
		nft = nft_;
		game = game_;
	}

	// #endregion
	// #region `_onlyGame`

	/// @dev Comment-202411253 applies.
	modifier _onlyGame() {
		_checkOnlyGame();
		_;
	}

	// #endregion
	// #region `_checkOnlyGame`

	/// @dev Comment-202411253 applies.
	function _checkOnlyGame() private view {
		if (_msgSender() != game) {
			revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
		}
	}

	// #endregion
	// #region `stake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `nonReentrant`.
	///    `_stake`.
	function stake(uint256 nftId_) external override (IStakingWalletNftBase, StakingWalletNftBase) nonReentrant {
		_stake(nftId_);
	}

	// #endregion
	// #region `_stake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_msgSender`.
	///    `numStakedNfts`.
	///    `actionCounter`.
	///    `super._stake`.
	///    `NftStaked`.
	///    `StakeAction`.
	///    `nft`.
	///    `stakeActions`.
	///    `rewardAmountPerStakedNft`.
	function _stake(uint256 nftId_) internal override {
		super._stake(nftId_);
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		uint256 newStakeActionId_ = newActionCounter_;
		StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		// #enable_asserts assert(newStakeActionReference_.nftId == 0);
		newStakeActionReference_.nftId = nftId_;
		// #enable_asserts assert(newStakeActionReference_.nftOwnerAddress == address(0));
		newStakeActionReference_.nftOwnerAddress = _msgSender();
		uint256 rewardAmountPerStakedNftCopy_ = rewardAmountPerStakedNft;
		// #enable_asserts assert(newStakeActionReference_.initialRewardAmountPerStakedNft == 0);
		newStakeActionReference_.initialRewardAmountPerStakedNft = rewardAmountPerStakedNftCopy_;
		uint256 newNumStakedNfts_ = numStakedNfts + 1;
		numStakedNfts = newNumStakedNfts_;
		emit NftStaked(newStakeActionId_, nftId_, _msgSender(), newNumStakedNfts_, rewardAmountPerStakedNftCopy_);

		// Comment-202501145 applies.
		nft.transferFrom(_msgSender(), address(this), nftId_);
	}

	// #endregion
	// #region `stakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `nonReentrant`.
	///    `_stakeMany`.
	function stakeMany(uint256[] calldata nftIds_) external override (IStakingWalletNftBase, StakingWalletNftBase) nonReentrant {
		_stakeMany(nftIds_);
	}

	// #endregion
	// #region `unstake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `nonReentrant`.
	///    `_unstake`.
	///    `_payReward`.
	function unstake(uint256 stakeActionId_) external override nonReentrant {
		// This can potentially be zero.
		uint256 rewardAmount_ = _unstake(stakeActionId_);

		_payReward(rewardAmount_);
	}

	// #endregion
	// #region `unstakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `nonReentrant`.
	///    `_unstake`.
	///    `_payReward`.
	function unstakeMany(uint256[] calldata stakeActionIds_) external override nonReentrant {
		uint256 rewardAmountsSum_ = 0;
		for (uint256 stakeActionIdIndex_ = stakeActionIds_.length; stakeActionIdIndex_ > 0; ) {
			-- stakeActionIdIndex_;

			// This can potentially be zero.
			uint256 rewardAmount_ = _unstake(stakeActionIds_[stakeActionIdIndex_]);

			rewardAmountsSum_ += rewardAmount_;
		}
		_payReward(rewardAmountsSum_);
	}

	// #endregion
	// #region `_unstake`

	/// @notice Makes state updates needed to unstake an NFT.
	/// @return The staking ETH reward amount.
	/// It can potentially be zero.
	/// The caller is required to pay it to the staker.
	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicSignatureErrors.NftStakeActionInvalidId`.
	///    `CosmicSignatureErrors.NftStakeActionAccessDenied`.
	///    `_msgSender`.
	///    `numStakedNfts`.
	///    `actionCounter`.
	///    `NftUnstaked`.
	///    `StakeAction`.
	///    `nft`.
	///    `stakeActions`.
	///    `rewardAmountPerStakedNft`.
	function _unstake(uint256 stakeActionId_) private returns (uint256) {
		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;
		if (_msgSender() != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress == address(0)) {
				revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			} else {
				revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, _msgSender());
			}
		}
		delete stakeActionReference_.nftId;
		delete stakeActionReference_.nftOwnerAddress;
		delete stakeActionReference_.initialRewardAmountPerStakedNft;
		uint256 rewardAmountPerStakedNftCopy_ = rewardAmountPerStakedNft;

		// This can potentially be zero.
		uint256 rewardAmount_ = rewardAmountPerStakedNftCopy_ - stakeActionCopy_.initialRewardAmountPerStakedNft;

		uint256 newNumStakedNfts_ = numStakedNfts - 1;
		numStakedNfts = newNumStakedNfts_;
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		emit NftUnstaked(newActionCounter_, stakeActionId_, stakeActionCopy_.nftId, _msgSender(), newNumStakedNfts_, rewardAmountPerStakedNftCopy_, rewardAmount_);

		// Comment-202501145 applies.
		nft.transferFrom(address(this), _msgSender(), stakeActionCopy_.nftId);

		return rewardAmount_;
	}

	// #endregion
	// #region `_payReward`

	/// @notice This stupid method just transfers the given ETH amount to whoever calls it.
	/// @param rewardAmount_ The ETH amount to transfer.
	/// It's OK if it's zero.
	/// @dev
	/// Observable universe entities accessed here:
	///    `address.call`.
	///    `CosmicSignatureErrors.FundTransferFailed`.
	///    `_msgSender`.
	function _payReward(uint256 rewardAmount_) private {
		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: rewardAmount_}("");

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("NFT staking ETH reward payment failed.", _msgSender(), rewardAmount_);
		}
	}

	// #endregion
	// #region `deposit`

	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.value`.
	///    `nonReentrant`.
	///    `numStakedNfts`.
	///    `actionCounter`.
	///    `EthDepositReceived`.
	///    `rewardAmountPerStakedNft`.
	///    `_onlyGame`.
	function deposit(uint256 roundNum_) external payable override nonReentrant _onlyGame {
		uint256 numStakedNftsCopy_ = numStakedNfts;

		// [Comment-202410161]
		// The division can panic due to division by zero.
		// This quotient can potentially be zero.
		// Comment-202503043 relates and/or applies.
		// todo-1 +++ Test that this doesn't burn all remaining gas. Remember that the caller sends only 63/64 of it to us.
		// todo-1 +++ I only asked ChatGPT about burning all remaining gas on panic.
		// todo-1 +++ It will not burn it if Solidity compiler 0.8+ was used.
		// [/Comment-202410161]
		// Comment-202412045 applies.
		uint256 rewardAmountPerStakedNftIncrement_ = msg.value / numStakedNftsCopy_;

		uint256 newRewardAmountPerStakedNft_ = rewardAmountPerStakedNft + rewardAmountPerStakedNftIncrement_;
		rewardAmountPerStakedNft = newRewardAmountPerStakedNft_;
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		emit EthDepositReceived(roundNum_, newActionCounter_, msg.value, newRewardAmountPerStakedNft_, numStakedNftsCopy_);
	}

	// #endregion
	// #region `tryPerformMaintenance`

	/// @dev
	/// Observable universe entities accessed here:
	///    `address.balance`.
	///    `address.call`.
	///    `nonReentrant`.
	///    `CosmicSignatureErrors.ThereAreStakedNfts`.
	///    `CosmicSignatureEvents.FundsTransferredToCharity`.
	///    `CosmicSignatureEvents.FundTransferFailed`.
	///    `numStakedNfts`.
	///    `onlyOwner`.
	/// I have made this method `nonReentrant`. Although doing so probably was unnecessary if we assumed
	/// that the owner is not malicious.
	/// todo-1 Does ToDo-202507148-1 relate?
	function tryPerformMaintenance(address charityAddress_) external override nonReentrant onlyOwner returns (bool) {
		// #region

		require(numStakedNfts == 0, CosmicSignatureErrors.ThereAreStakedNfts("There are still staked NFTs."));

		// #endregion
		// #region

		bool returnValue_ = true;

		// #endregion
		// #region

		if (charityAddress_ != address(0)) {
			// It's OK if this is zero.
			uint256 amount_ = address(this).balance;

			// [Comment-202507296]
			// This would revert if `charityAddress_ == address(this)`.
			// [/Comment-202507296]
			// Comment-202502043 applies.
			(bool isSuccess_, ) = charityAddress_.call{value: amount_}("");

			if (isSuccess_) {
				emit CosmicSignatureEvents.FundsTransferredToCharity(charityAddress_, amount_);
			} else {
				emit CosmicSignatureEvents.FundTransferFailed("ETH transfer to charity failed.", charityAddress_, amount_);
				returnValue_ = false;
			}
		}

		// #endregion
		// #region

		return returnValue_;

		// #endregion
	}
	function getStakeActionAddr(uint256 index) external view returns (address) {
		return stakeActions[index].nftOwnerAddress;
	}
	function getStakeActionTokenId(uint256 index) external view returns (uint256) {
		return stakeActions[index].nftId;
	}
	function getStakeActionInitialReward(uint256 index) external view returns (uint256) {
		return stakeActions[index].initialRewardAmountPerStakedNft;
	}
	function getNftUsedStatus(uint256 index) external view returns (uint256) {
		return usedNfts[index];
	}
	function wasTokenUsed(uint256 tokenId) external view returns (bool) {
		return usedNfts[tokenId] == 1;
	}
	function calldataGetUint256(bytes calldata calldataarg) external pure returns (uint256) {
		return abi.decode(calldataarg, (uint256));
	}
	function tokenOwnerOf(uint256 tokenId) external view returns (address) {
		return nft.ownerOf(tokenId);
	}
	function pureUnstake(uint256 actionId) external  nonReentrant returns (address) {
		uint256 tokenId = stakeActions[actionId].nftId;
		_unstake(actionId);
		return nft.ownerOf(tokenId);
	}

	// #endregion
}

// #endregion
