// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
// import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IStakingWalletNftBase, StakingWalletNftBase } from "./StakingWalletNftBase.sol";
import { IStakingWalletCosmicSignatureNft } from "./interfaces/IStakingWalletCosmicSignatureNft.sol";

// #endregion
// #region

contract StakingWalletCosmicSignatureNft is Ownable, StakingWalletNftBase, IStakingWalletCosmicSignatureNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct StakeAction {
		uint256 nftId;
		/// todo-1 ??? Reorder this to before `nftId`.
		address nftOwnerAddress;

		/// @notice
		/// [Comment-202410268]
		/// This index is within `StakingWalletCosmicSignatureNft.ethDeposits`.
		/// It's 1-based.
		/// A nonzero indicates that this NFT has been unstaked and it's likely that rewards from some `EthDeposit` instances
		/// have not been paid yet. So the staker has an option to call `StakingWalletCosmicSignatureNft.payReward`,
		/// possibly multiple times, to receieve yet to be paid rewards.
		/// The above comment uses the word "likely" because this particular `EthDeposit` instance has not been evaluated yet,
		/// and therefore it's actually possible that the staker isn't entitled to get a reward from it.
		/// Comment-202410142 relates.
		/// [/Comment-202410268]
		uint256 maxUnpaidEthDepositIndex;
	}

	/// @notice Stores details about an ETH deposit.
	/// Multiple deposits can be aggregated in a single `EthDeposit` instance.
	/// @dev This structure fits in a single storage slot.
	struct EthDeposit {
		/// @dev
		/// [Comment-202410117]
		/// This is populated from `StakingWalletNftBase.actionCounter`.
		/// This is a nonzero.
		/// [/Comment-202410117]
		/// This is populated when creating an `EthDeposit` instance.
		/// This is not updated when adding another deposit to the last `StakingWalletCosmicSignatureNft.ethDeposits` item.
		uint64 depositId;

		uint192 rewardAmountPerStakedNft;
	}

	// #endregion
	// #region Constants

	/// @notice A max limit on another max limit.
	/// This value is quite big, and, at the same time, it's nowhere close to the point of overflow.
	uint256 internal constant _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT = type(uint256).max / 256;

	// /// @notice Precision factor for calculations.
	// /// Was this intended to be somethig similar to `CosmicSignatureConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT`?
	// uint256 private constant _PRECISION = 1 ether;

	// #endregion
	// #region State

	/// @notice The `CosmicSignatureNft` contract address.
	CosmicSignatureNft public immutable nft;

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	/// @notice The current number of already unstaked and not yet fully rewarded NFTs.
	/// In other words, this is the number of `stakeActions` items containing a nonzero `maxUnpaidEthDepositIndex`.
	uint256 public numUnpaidStakeActions;

	/// @notice Info about currently staked NFTs.
	/// This also contains unstaked, but not yet fully rewarded NFTs.
	/// This array is sparse (can contain gaps).
	/// Item index corresponds to stake action ID.
	/// @dev Comment-202410117 applies to item index.
	StakeAction[1 << 64] public stakeActions;

	/// @notice This indicates whether an NFT stake action occurred after we received the last ETH deposit.
	/// Zero means false; a nonzero means true.
	/// @dev
	/// [Comment-202410307]
	/// After someone stakes an NFT, we must create a new `ethDeposits` item on the next deposit.
	/// Although, if they also unstake it before we receive another deposit, it would be unnecessary to create a new item,
	/// but we will anyway create one, which is probably not too bad.
	/// At the same time, in case someone unstakes an NFT and we pay them their reward from the last `ethDeposits` item
	/// before we receive another deposit, we will not need to create a new item. Given that on unstake we do pay
	/// reward from at least the last `ethDeposits` item (provided the staker is actually entitled to get it), we are covered.
	/// [/Comment-202410307]
	/// [Comment-202410168]
	/// It might appear that we must initialize this with a nonzero, but the initial value doesn't actually matter
	/// because before we get a chance to evaluate this, we will assign to this.
	/// [/Comment-202410168]
	uint256 private _nftWasStakedAfterPrevEthDeposit;

	/// @notice `ethDeposits` item count.
	uint256 public numEthDeposits;

	/// @notice Item index is 1-based.
	/// The item at the index of zero always remains unassigned.
	/// This array is not sparse (contains no gaps).
	/// @dev
	/// It's possible that all rewards from some items have already been paid out, but we will never delete the items.
	/// If we executed logic near Comment-202410166, it's possible that this array contains items
	/// beyond the index of `numEthDeposits`. Those are garbage that we are going to overwrite
	/// and that the client code must ignore.
	EthDeposit[1 << 64] public ethDeposits;

	uint256 public numStateResets;

	// #endregion
	// #region `onlyGame`

	/// @dev
	/// [Comment-202411253]
	/// Similar logic exists in multiple places.
	/// [/Comment-202411253]
	modifier onlyGame() {
		require(
			msg.sender == game,
			CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", msg.sender)
		);
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param nft_ The `CosmicSignatureNft` contract address.
	/// @param game_ The `CosmicSignatureGame` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `Ownable.constructor`.
	///    `providedAddressIsNonZero`.
	///    `StakingWalletNftBase.constructor`.
	///    `nft`.
	///    `game`.
	///    `numUnpaidStakeActions`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `numEthDeposits`.
	///    `numStateResets`.
	constructor(CosmicSignatureNft nft_, address game_)
		Ownable(msg.sender)
		providedAddressIsNonZero(address(nft_))
		providedAddressIsNonZero(game_) {
		// #region

		nft = nft_;
		game = game_;

		// #endregion
		// #region

		// #enable_asserts assert(address(nft) == address(nft_));
		// #enable_asserts assert(game == game_);
		// #enable_asserts assert(numUnpaidStakeActions == 0);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 0);
		// #enable_asserts assert(numEthDeposits == 0);
		// #enable_asserts assert(numStateResets == 0);

		// #endregion
	}

	// #endregion
	// #region `stake`

	/// @dev
	/// [Comment-202411023]
	/// Issue. To eliminate a compile error, after the `override` keyword,
	/// I had to specify both `IStakingWalletNftBase` and `StakingWalletNftBase`.
	/// Problem is that there supposed to be only a single virtual method with this name. But this looks like we have 2 of them.
	/// [/Comment-202411023]
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftHasAlreadyBeenStaked`.
	///    // `CosmicSignatureConstants.BooleanWithPadding`.
	///    `NftTypeCode`.
	///    `NftStaked`.
	///    `_numStakedNfts`.
	///    `_usedNfts`.
	///    `actionCounter`.
	///    `StakeAction`.
	///    `nft`.
	///    `stakeActions`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	function stake(uint256 nftId_) public override(IStakingWalletNftBase, StakingWalletNftBase) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		require(
			// ( ! _usedNfts[nftId_].value ),
			_usedNfts[nftId_] == 0,
			CosmicSignatureErrors.NftHasAlreadyBeenStaked("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

		// _usedNfts[nftId_] = CosmicSignatureConstants.BooleanWithPadding(true, 0);
		_usedNfts[nftId_] = 1;
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		uint256 newStakeActionId_ = newActionCounter_;
		StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		newStakeActionReference_.nftId = nftId_;
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		// #enable_asserts assert(newStakeActionReference_.maxUnpaidEthDepositIndex == 0);
		uint256 newNumStakedNfts_ = _numStakedNfts + 1;
		_numStakedNfts = newNumStakedNfts_;

		// Comment-202410168 relates.
		_nftWasStakedAfterPrevEthDeposit = 1;

		emit NftStaked(newStakeActionId_, NftTypeCode.CosmicSignature, nftId_, msg.sender, newNumStakedNfts_);
		nft.transferFrom(msg.sender, address(this), nftId_);
		
		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + 1);
		// // #enable_asserts assert(_usedNfts[nftId_].value);
		// #enable_asserts assert(_usedNfts[nftId_] == 1);
		// #enable_asserts assert(actionCounter > 0);
		// #enable_asserts assert(nft.ownerOf(nftId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftId == nftId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(stakeActions[newStakeActionId_].maxUnpaidEthDepositIndex == 0);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 1);

		// #endregion
	}

	// #endregion
	// #region `unstake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_unstake`.
	///    `_payReward`.
	function unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		require(
			// [Comment-202410309]
			// This must be a nonzero, which implies that we will pay reward from at least the last deposit on unstake.
			// Comment-202410307 explains why it's important to do so.
			// At the same time, it's unnecessary to enforce this requirement when paying another part of the reward
			// after the last deposit reward has already been paid. But even in that case we do enforce it --
			// to make the logic simpler and/or more efficient.
			// [/Comment-202410309]
			numEthDepositsToEvaluateMaxLimit_ > 0 &&
			
			numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		(uint256 rewardAmount_, ) = _unstake(stakeActionId_, numEthDepositsToEvaluateMaxLimit_);
		_payReward(rewardAmount_);
	}

	// #endregion
	// #region `unstakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `_numStakedNfts`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_unstake`.
	///    `_payReward`.
	function unstakeMany(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		require(
			numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		// [Comment-202410311]
		// Comment-202410309 applies.
		// But in this case that requirement changes to `numEthDepositsToEvaluateMaxLimit_ >= stakeActionIds_.length`,
		// which this formula implicitly validates by not underflowing.
		// The logic won't be broken even if `stakeActionIds_.length` is zero.
		// Comment-202411054 relates.
		// [/Comment-202410311]
		uint256 remainingNumEthDepositsToEvaluateMaxLimit_ = numEthDepositsToEvaluateMaxLimit_ - stakeActionIds_.length;

		uint256 rewardAmountsSum_ = 0;
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			// [Comment-202411054]
			// Compensating for what we subtracted near Comment-202410311.
			// As a result, we fulfill the Comment-202410309 requirement.
			// [/Comment-202411054]
			++ remainingNumEthDepositsToEvaluateMaxLimit_;

			uint256 rewardAmount_;

			// [Comment-202501145]
			// Somewhere around here, it would probably make sense to use the feature Comment-202501144 is talking about.
			// [/Comment-202501145]
			(rewardAmount_, remainingNumEthDepositsToEvaluateMaxLimit_) =
				_unstake(stakeActionIds_[stakeActionIdIndex_], remainingNumEthDepositsToEvaluateMaxLimit_);

			rewardAmountsSum_ += rewardAmount_;
		}
		_payReward(rewardAmountsSum_);

		// Comment-202410159 applies to Comment-202410158.
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - stakeActionIds_.length);
	}

	// #endregion
	// #region `payReward`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_preparePayReward`.
	///    `_payReward`.
	function payReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		require(
			// Comment-202410309 applies.
			numEthDepositsToEvaluateMaxLimit_ > 0
			
			&& numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		(uint256 rewardAmount_, ) = _preparePayReward(stakeActionId_, numEthDepositsToEvaluateMaxLimit_);
		_payReward(rewardAmount_);
	}

	// #endregion
	// #region `payManyRewards`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `_numStakedNfts`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_preparePayReward`.
	///    `_payReward`.
	function payManyRewards(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		require(
			numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicSignatureErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		// Comment-202410311 applies.
		uint256 remainingNumEthDepositsToEvaluateMaxLimit_ = numEthDepositsToEvaluateMaxLimit_ - stakeActionIds_.length;

		uint256 rewardAmountsSum_ = 0;
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			// Comment-202411054 applies.
			++ remainingNumEthDepositsToEvaluateMaxLimit_;

			uint256 rewardAmount_;
			(rewardAmount_, remainingNumEthDepositsToEvaluateMaxLimit_) =
				_preparePayReward(stakeActionIds_[stakeActionIdIndex_], remainingNumEthDepositsToEvaluateMaxLimit_);
			rewardAmountsSum_ += rewardAmount_;
		}
		_payReward(rewardAmountsSum_);
	}

	// #endregion
	// #region `depositIfPossible`

	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `msg.value`.
	///    `CosmicSignatureErrors.NoStakedNfts`.
	///    `_numStakedNfts`.
	///    `actionCounter`.
	///    `EthDepositReceived`.
	///    `EthDeposit`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `numEthDeposits`.
	///    `ethDeposits`.
	///    `onlyGame`.
	function depositIfPossible(uint256 roundNum_) external payable override onlyGame {
		// #region

		// #enable_asserts uint256 initialNumEthDeposits_ = numEthDeposits;

		// #endregion
		// #region

		uint256 numStakedNftsCopy_ = _numStakedNfts;
		if (numStakedNftsCopy_ == 0) {
			// This string length affects the length we evaluate near Comment-202410149 and log near Comment-202410299.
			revert CosmicSignatureErrors.NoStakedNfts("There are no staked NFTs.");
		}

		// #endregion
		// #region

		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		uint256 newNumEthDeposits_ = numEthDeposits;
		EthDeposit memory newEthDeposit_;

		// #endregion
		// #region

		// Comment-202410168 relates.
		if (_nftWasStakedAfterPrevEthDeposit != 0) {

			// #region

			_nftWasStakedAfterPrevEthDeposit = 0;

			// If we executed logic near Comment-202410166, it's possible that an `ethDeposits` item already exists at this position.
			// We will overwrite it.
			numEthDeposits = ( ++ newNumEthDeposits_ );
			
			newEthDeposit_.depositId = uint64(newActionCounter_);

			// [Comment-202410161/]
			newEthDeposit_.rewardAmountPerStakedNft = uint192(msg.value / numStakedNftsCopy_);
			
			// #endregion
		} else {
			// #region

			newEthDeposit_ = ethDeposits[newNumEthDeposits_];

			// Comment-202410161 applies.
			newEthDeposit_.rewardAmountPerStakedNft += uint192(msg.value / numStakedNftsCopy_);

			// #endregion
		}

		// #endregion
		// #region

		ethDeposits[newNumEthDeposits_] = newEthDeposit_;
		emit EthDepositReceived(roundNum_, newActionCounter_, newNumEthDeposits_, newEthDeposit_.depositId, msg.value, numStakedNftsCopy_);

		// #endregion
		// #region
		
		// #enable_asserts assert(actionCounter > 0);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 0);
		// #enable_asserts assert(numEthDeposits - initialNumEthDeposits_ <= 1);
		// #enable_asserts assert(ethDeposits[numEthDeposits].depositId > 0);

		// #endregion
	}

	// #endregion
	// #region `tryPerformMaintenance`

	/// @dev
	/// Observable universe entities accessed here:
	///    `address.call`.
	///    `address.balance`.
	///    `msg.sender` (indirectly).
	///    `CosmicSignatureErrors.InvalidOperationInCurrentState`.
	///    `CosmicSignatureEvents.FundTransferFailed`.
	///    `CosmicSignatureEvents.FundsTransferredToCharity`.
	///    `_numStakedNfts`.
	///    `owner` (indirectly).
	///    `onlyOwner`.
	///    `StateReset`.
	///    `numUnpaidStakeActions`.
	///    // `_nftWasStakedAfterPrevEthDeposit`.
	///    `numEthDeposits`.
	///    `numStateResets`.
	function tryPerformMaintenance(bool resetState_, address charityAddress_) external override onlyOwner returns(bool) {
		// #region

		require(_numStakedNfts == 0, CosmicSignatureErrors.InvalidOperationInCurrentState("There are still staked NFTs."));
		require(numUnpaidStakeActions == 0, CosmicSignatureErrors.InvalidOperationInCurrentState("There are still unpaid rewards."));

		// #endregion
		// #region

		if (resetState_) {
			// // This would have no effect because of Comment-202410168.
			// _nftWasStakedAfterPrevEthDeposit = 1;

			// [Comment-202410166]
			// It's unnecessary to also clear `ethDeposits`.
			// [/Comment-202410166]
			numEthDeposits = 0;

			emit StateReset( ++ numStateResets );
		}

		// #endregion
		// #region

		bool returnValue_ = true;

		// #endregion
		// #region

		if (charityAddress_ != address(0)) {
			uint256 amount_ = address(this).balance;

			// // Comment-202409215 applies.
			// if (amount_ > 0)

			{
				// Comment-202502043 applies.
				// [Comment-202409214]
				// There is no reentrancy vulnerability here.
				// [/Comment-202409214]
				(bool isSuccess_, ) = charityAddress_.call{value: amount_}("");

				// require(isSuccess_, CosmicSignatureErrors.FundTransferFailed("ETH transfer to charity failed.", charityAddress_, amount_));
				if (isSuccess_) {
					// [Comment-202410159]
					// Issue. Because we can be reentered near Comment-202409214,
					// this assertion is not necessarily guaranteed to succeed.
					// [/Comment-202410159]
					// #enable_asserts assert(address(this).balance == 0);

					emit CosmicSignatureEvents.FundsTransferredToCharity(charityAddress_, amount_);
				} else {
					// #enable_asserts assert(address(this).balance == amount_);
					emit CosmicSignatureEvents.FundTransferFailed("ETH transfer to charity failed.", charityAddress_, amount_);
					returnValue_ = false;
				}
			}
		}

		// #endregion
		// #region

		return returnValue_;

		// #endregion
	}

	// #endregion
	// #region `_unstake`

	/// @notice Makes state updates needed to unstake an NFT.
	/// The caller is required to pay the returned reward amount to the staker.
	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftStakeActionInvalidId`.
	///    `CosmicSignatureErrors.NftStakeActionAccessDenied`.
	///    `CosmicSignatureErrors.NftAlreadyUnstaked`.
	///    `_numStakedNfts`.
	///    `actionCounter`.
	///    `NftUnstaked`.
	///    `StakeAction`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `nft`.
	///    `numUnpaidStakeActions`.
	///    `stakeActions`.
	///    `numEthDeposits`.
	///    `_calculateRewardAmount`.
	function _unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private
		returns(uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;
		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;
		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #endregion
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress != address(0)) {
				revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// [Comment-202410182]
				// It's also possible that this stake action has already been deleted, but we have no knowledge about that.
				// [/Comment-202410182]
				revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			}
		}
		require(
			stakeActionCopy_.maxUnpaidEthDepositIndex == 0,
			CosmicSignatureErrors.NftAlreadyUnstaked("NFT has already been unstaked.", stakeActionId_)
		);

		// #endregion
		// #region

		(rewardAmount_, stakeActionCopy_.maxUnpaidEthDepositIndex, remainingNumEthDepositsToEvaluateMaxLimit_) =
			_calculateRewardAmount(stakeActionId_, numEthDeposits, numEthDepositsToEvaluateMaxLimit_);
		if (stakeActionCopy_.maxUnpaidEthDepositIndex > 0) {
			stakeActionReference_.maxUnpaidEthDepositIndex = stakeActionCopy_.maxUnpaidEthDepositIndex;
			++ numUnpaidStakeActions;
		} else {
			delete stakeActionReference_.nftId;
			delete stakeActionReference_.nftOwnerAddress;
			// #enable_asserts assert(stakeActionReference_.maxUnpaidEthDepositIndex == 0);
		}
		uint256 newNumStakedNfts_ = _numStakedNfts - 1;
		_numStakedNfts = newNumStakedNfts_;
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		emit NftUnstaked(newActionCounter_, stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_, rewardAmount_, stakeActionCopy_.maxUnpaidEthDepositIndex);

		// Comment-202501145 relates.
		nft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);

		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - 1);
		// #enable_asserts assert(actionCounter > 0);
		// #enable_asserts assert(nft.ownerOf(stakeActionCopy_.nftId) == msg.sender);
		// #enable_asserts assert(numUnpaidStakeActions - initialNumUnpaidStakeActions_ <= 1);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftId == 0);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));

		// #endregion
	}

	// #endregion
	// #region `_preparePayReward`

	/// @notice Makes state updates needed to pay another, possibly the last, part of the reward.
	/// The caller is required to pay the returned reward amount to the staker.
	/// @dev This method is to be called after the `NftUnstaked` or `RewardPaid` event was emitted
	/// with a nonzero `maxUnpaidEthDepositIndex`.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftStakeActionInvalidId`.
	///    `CosmicSignatureErrors.NftStakeActionAccessDenied`.
	///    `CosmicSignatureErrors.NftNotUnstaked`.
	///    `RewardPaid`.
	///    `StakeAction`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `numUnpaidStakeActions`.
	///    `stakeActions`.
	///    `_calculateRewardAmount`.
	function _preparePayReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private
		returns(uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;
		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #endregion
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress != address(0)) {
				revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to receive staking reward.", stakeActionId_, msg.sender);
			} else {
				// Comment-202410182 applies.
				revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			}
		}
		require(
			stakeActionCopy_.maxUnpaidEthDepositIndex > 0,
			CosmicSignatureErrors.NftNotUnstaked("NFT has not been unstaked.", stakeActionId_)
		);

		// #endregion
		// #region

		(rewardAmount_, stakeActionCopy_.maxUnpaidEthDepositIndex, remainingNumEthDepositsToEvaluateMaxLimit_) =
			_calculateRewardAmount(stakeActionId_, stakeActionCopy_.maxUnpaidEthDepositIndex, numEthDepositsToEvaluateMaxLimit_);
		stakeActionReference_.maxUnpaidEthDepositIndex = stakeActionCopy_.maxUnpaidEthDepositIndex;
		if (stakeActionCopy_.maxUnpaidEthDepositIndex == 0) {
			delete stakeActionReference_.nftId;
			delete stakeActionReference_.nftOwnerAddress;
			// #enable_asserts assert(stakeActionReference_.maxUnpaidEthDepositIndex == 0);
			-- numUnpaidStakeActions;
		}
		emit RewardPaid(stakeActionId_, stakeActionCopy_.nftId, msg.sender, rewardAmount_, stakeActionCopy_.maxUnpaidEthDepositIndex);

		// #endregion
		// #region

		// #enable_asserts assert(initialNumUnpaidStakeActions_ - numUnpaidStakeActions <= 1);

		// #endregion
	}

	// #endregion
	// #region `_calculateRewardAmount`

	/// @notice Calculates reward amount for a given stake action.
	/// @dev
	/// Observable universe entities accessed here:
	///    `EthDeposit`.
	///    `_NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `ethDeposits`.
	function _calculateRewardAmount(uint256 stakeActionId_, uint256 maxUnpaidEthDepositIndex_, uint256 numEthDepositsToEvaluateMaxLimit_) private view
		returns(uint256 rewardAmount_, uint256 remainingMaxUnpaidEthDepositIndex_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// This can be zero.
		// #enable_asserts assert(maxUnpaidEthDepositIndex_ < ethDeposits.length);

		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #endregion
		// #region

		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// #region

			// This formula would be able to underflow if its parameters were unsigned.
			// The result can be positive, zero, or negative, if interpreted as signed.
			remainingMaxUnpaidEthDepositIndex_ = uint256(int256(maxUnpaidEthDepositIndex_) - int256(numEthDepositsToEvaluateMaxLimit_));

			if (int256(remainingMaxUnpaidEthDepositIndex_) < int256(0)) {
				remainingMaxUnpaidEthDepositIndex_ = 0;
			}

			// #enable_asserts assert(rewardAmount_ == 0);

			// #endregion
			// #region

			for (uint256 ethDepositIndex_ = maxUnpaidEthDepositIndex_; ; ) {
				if (ethDepositIndex_ > remainingMaxUnpaidEthDepositIndex_) {
					{
						EthDeposit memory ethDepositCopy_ = ethDeposits[ethDepositIndex_];
						-- ethDepositIndex_;
						if (ethDepositCopy_.depositId > stakeActionId_) {
							rewardAmount_ += ethDepositCopy_.rewardAmountPerStakedNft;
							continue;
						}
					}
					remainingMaxUnpaidEthDepositIndex_ = 0;
				} else {
					// #enable_asserts assert(ethDepositIndex_ == remainingMaxUnpaidEthDepositIndex_);

					// We have already calculated `remainingMaxUnpaidEthDepositIndex_`. Keeping the previously calculated value.
					// If it equals zero, we have completed evaluating deposits for the given stake action.
					// Note that it's possible that we haven't evaluated any deposits due to `maxUnpaidEthDepositIndex_` being zero.
				}
				{
					uint256 numEvaluatedEthDeposits_ = maxUnpaidEthDepositIndex_ - ethDepositIndex_;
					remainingNumEthDepositsToEvaluateMaxLimit_ = numEthDepositsToEvaluateMaxLimit_ - numEvaluatedEthDeposits_;
				}
				break;
			}

			// #endregion
		}

		// #endregion
	}

	// #endregion
	// #region `_payReward`

	/// @notice This stupid method just transfers the given ETH amount to whoever calls it.
	/// @dev
	/// Observable universe entities accessed here:
	///    `address.call`.
	///    `msg.sender`.
	///    `CosmicSignatureErrors.FundTransferFailed`.
	function _payReward(uint256 rewardAmount_) private {
		// #region

		// #enable_asserts uint256 initialBalance_ = address(this).balance;

		// #endregion
		// #region

		// // [Comment-202409215]
		// // It appears to be unnecessary to spend gas on this validation.
		// // todo-1 In some cases, instead of referencing this comment, comment near respective variable that it's OK if it's zero.
		// // [/Comment-202409215]
		// // [Comment-202411294]
		// // This will be zero in the following cases:
		// // 1. The staker stakes and, before we receive anotehr deposit, unstakes their NFT.
		// // 2. Someone calls `unstakeMany` or `payManyRewards` with an empty array of stake action IDs.
		// // 3. We evaluated only a single deposit and determined that the staker isn't entitled to it.
		// //    This case is elaborated in Comment-202410142.
		// // 4. All deposits we received while this stake was active
		// //    were too small for the formula near Comment-202410161 to produce a nonzero.
		// //    Although that's probably unlikely to happen.
		// // [/Comment-202411294]
		// if (rewardAmount_ > 0)

		{
			// Comment-202502043 applies.
			// [Comment-202410158]
			// Comment-202409214 applies.
			// [/Comment-202410158]
			(bool isSuccess_, ) = msg.sender.call{value: rewardAmount_}("");

			if ( ! isSuccess_ ) {
				revert CosmicSignatureErrors.FundTransferFailed("NFT staking ETH reward payment failed.", msg.sender, rewardAmount_);
			}
		}

		// #endregion
		// #region

		// Comment-202410159 applies to Comment-202410158.
		// #enable_asserts assert(address(this).balance == initialBalance_ - rewardAmount_);

		// #endregion
	}

	// #endregion
}

// #endregion
