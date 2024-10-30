// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IStakingWalletNftBase } from "./interfaces/IStakingWalletNftBase.sol";
import { StakingWalletNftBase } from "./StakingWalletNftBase.sol";
import { IStakingWalletCosmicSignatureNft } from "./interfaces/IStakingWalletCosmicSignatureNft.sol";

// #endregion
// #region

contract StakingWalletCosmicSignatureNft is Ownable, StakingWalletNftBase, IStakingWalletCosmicSignatureNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct StakeAction {
		uint256 nftId;
		address nftOwnerAddress;

		/// @notice
		/// [Comment-202410268]
		/// This index is within `StakingWalletCosmicSignatureNft.ethDeposits`.
		/// It's 1-based.
		/// A nonzero indicates that this NFT has been unstaked and it's likely that rewards from some `EthDeposit` instances
		/// have not been paid yet. So the staker has an option to call `StakingWalletCosmicSignatureNft.payReward`,
		/// possibly multiple times, to receieve yet to be paid rewards.
		/// We used the word "likely" in the above comment
		/// because this particular `EthDeposit` instance has not been evaluated yet,
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
	uint256 public constant NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT = type(uint256).max / 256;

	// /// @notice Precision factor for calculations
	// /// Was this intended to be somethig similar to `CosmicGameConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT`?
	// uint256 private constant _PRECISION = 1 ether;

	// #endregion
	// #region State

	/// @notice The `CosmicSignature` contract address.
	CosmicSignature public nft;

	/// @notice The `CosmicGame` contract address.
	address public game;

	/// @notice Info about currently staked NFTs.
	/// This also contains unstaked, but not yet fully rewarded NFTs.
	/// @dev Comment-202410117 applies to `stakeActionId`.
	// mapping(uint256 stakeActionId => StakeAction) public stakeActions;
	StakeAction[1 << 64] public stakeActions;

	/// @notice The current number of already unstaked and not yet fully rewarded NFTs.
	/// In other words, this is the number of `stakeActions` items containing a nonzero `maxUnpaidEthDepositIndex`.
	uint256 public numUnpaidStakeActions;

	/// @notice This indicates whether an NFT stake action occurred after we received the last ETH deposit.
	/// 1 (or zero) means false; 2 means true.
	/// @dev
	/// [Comment-202410307]
	/// After someone stakes an NFT, we must create a new `ethDeposits` item on the next deposit.
	/// Although, if they also unstake it before the next deposit, it would be unnecessary to create a new item,
	/// but we will anyway create one, which is probably not too bad.
	/// At the same time, in case someone unstakes an NFT and we pay them their reward from the last `ethDeposits` item
	/// before we receive another deposit, we will not need to create a new item. Given that on unstake we do pay
	/// reward from at least the last `ethDeposits` item, we are covered.
	/// [/Comment-202410307]
	/// [Comment-202410168]
	/// One might want to initialize this with 2, but the initial value doesn't actually matter
	/// because before we get a chance to evaluate this we will assign to this.
	/// The 1st staker will pay the gas fee to create a storage slot for this variable.
	/// [/Comment-202410168]
	/// To minimize gas fees, we never assign zero to this, and therefore this is not a `bool`.
	/// In fact, this design doesn't necessarily improve net use of gas -- due to gas refunds for freeing storage slots.
	/// But, at least, we avoid gas fee spikes that we would experience when saving a nonzero to a non-existent storage slot.
	/// Besides, gas refunds are not guaranteed because they are capped.
	uint256 private _nftWasStakedAfterPrevEthDeposit;

	/// @notice `ethDepositIndex` is 1-based.
	/// @dev The item at the index of zero always remains zero.
	/// If we executed logic near Comment-202410166, it's possible that this contains items
	/// beyond `numEthDeposits`. Those are garbage that the client code must ignore.
	// mapping(uint256 ethDepositIndex => EthDeposit) public ethDeposits;
	EthDeposit[1 << 64] public ethDeposits;

	/// @notice `ethDeposits` item count.
	uint256 public numEthDeposits;

	uint256 public numStateResets;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param nft_ The `CosmicSignature` contract address.
	/// @param game_ The `CosmicGame` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicGameErrors.ZeroAddress`.
	///    `Ownable.constructor`. ToDo-202408114-1 applies.
	///    `StakingWalletNftBase.constructor`.
	///    `nft`.
	///    `game`.
	///    `numUnpaidStakeActions`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `numEthDeposits`.
	///    `numStateResets`.
	///
	/// todo-1 Is `nft_` the same as `game_.nft()`?
	/// todo-1 But we don't import the `CosmicGame` contract.
	/// todo-1 At least explain things in a comment.
	/// todo-1 The same probably applies to `StakingWalletRandomWalkNft`. But there the `game_` member is different.
	constructor(CosmicSignature nft_, address game_) Ownable(msg.sender) {
		// #region

		require(address(nft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the nft_."));
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game_."));

		// #endregion
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
	/// Problem is that there supposed to be only a single virtual function with this name. But this looks like we have 2 of them.
	/// [/Comment-202411023]
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicGameErrors.NftOneTimeStaking`.
	///    `CosmicGameConstants.BooleanWithPadding`.
	///    `CosmicGameConstants.NftTypeCode`.
	///    `NftStaked`.
	///    `StakeAction`.
	///    `nft`.
	///    `stakeActions`.
	///    `_numStakedNfts`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `_usedNfts`.
	///    `actionCounter`.
	function stake(uint256 nftId_) public override(IStakingWalletNftBase, StakingWalletNftBase) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		require(
			( ! _usedNfts[nftId_].value ),
			CosmicGameErrors.NftOneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

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
		_nftWasStakedAfterPrevEthDeposit = 2;

		_usedNfts[nftId_] = CosmicGameConstants.BooleanWithPadding(true, 0);
		nft.transferFrom(msg.sender, address(this), nftId_);
		emit NftStaked(newStakeActionId_, CosmicGameConstants.NftTypeCode.CosmicSignature, nftId_, msg.sender, newNumStakedNfts_);
		
		// #endregion
		// #region

		// #enable_asserts assert(nft.ownerOf(nftId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftId == nftId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(stakeActions[newStakeActionId_].maxUnpaidEthDepositIndex == 0);
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + 1);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 2);
		// #enable_asserts assert(_usedNfts[nftId_].value);
		// #enable_asserts assert(actionCounter > 0);

		// #endregion
	}

	// #endregion
	// #region `unstake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
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
			
			numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		(uint256 rewardAmount_, ) = _unstake(stakeActionId_, numEthDepositsToEvaluateMaxLimit_);
		_payReward(rewardAmount_);
	}

	// #endregion
	// #region `unstakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_numStakedNfts`.
	///    `_unstake`.
	///    `_payReward`.
	function unstakeMany(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		require(
			numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
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
	///    `CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_preparePayReward`.
	///    `_payReward`.
	function payReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		require(
			// Comment-202410309 applies.
			numEthDepositsToEvaluateMaxLimit_ > 0
			
			&& numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		(uint256 rewardAmount_, ) = _preparePayReward(stakeActionId_, numEthDepositsToEvaluateMaxLimit_);
		_payReward(rewardAmount_);
	}

	// #endregion
	// #region `payManyRewards`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `_numStakedNfts`.
	///    `_preparePayReward`.
	///    `_payReward`.
	function payManyRewards(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		require(
			numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
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
	///    `CosmicGameErrors.DepositFromUnauthorizedSender`.
	///    `CosmicGameErrors.NoStakedNfts`.
	///    `EthDepositReceived`.
	///    `EthDeposit`.
	///    `game`.
	///    `_numStakedNfts`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `ethDeposits`.
	///    `numEthDeposits`.
	///    `actionCounter`.
	/// todo-1 Here and elsewhere, consider replacing functions like this with `receive`.
	/// todo-1 It would probably be cheaper gas-wise.
	/// todo-1 Or at least write comments.
	/// todo-1 But in this particular case `receive` won't be sufficient for our needs.
	function depositIfPossible(uint256 roundNum_) external payable override {
		// #region

		// #enable_asserts uint256 initialNumEthDeposits_ = numEthDeposits;

		// #endregion
		// #region

		require(
			msg.sender == game,
			CosmicGameErrors.DepositFromUnauthorizedSender("Only the CosmicGame contract is permitted to make a deposit.", msg.sender)
		);
		uint256 numStakedNftsCopy_ = _numStakedNfts;
		if (numStakedNftsCopy_ == 0) {
			// This string length affects the length we evaluate near Comment-202410149 and log near Comment-202410299.
			revert CosmicGameErrors.NoStakedNfts("There are no staked NFTs.");
		}

		// #endregion
		// #region

		EthDeposit memory newEthDeposit_;
		uint256 newNumEthDeposits_ = numEthDeposits;
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;

		// #endregion
		// #region

		// Comment-202410168 relates.
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 1 || _nftWasStakedAfterPrevEthDeposit == 2);
		if (_nftWasStakedAfterPrevEthDeposit >= 2) {

			// #region

			_nftWasStakedAfterPrevEthDeposit = 1;

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
		
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 1);
		// #enable_asserts assert(ethDeposits[numEthDeposits].depositId > 0);
		// #enable_asserts assert(numEthDeposits - initialNumEthDeposits_ <= 1);
		// #enable_asserts assert(actionCounter > 0);

		// #endregion
	}

	// #endregion
	// #region `tryPerformMaintenance`

	/// @dev
	/// Observable universe entities accessed here:
	///    `address.call`.
	///    `address.balance`.
	///    `CosmicGameErrors.InvalidOperationInCurrentState`.
	///    `CosmicGameEvents.FundTransferFailed`.
	///    `CosmicGameEvents.FundsTransferredToCharity`.
	///    `msg.sender` (indirectly).
	///    `owner` (indirectly).
	///    `_numStakedNfts`.
	///    `StateReset`.
	///    `numUnpaidStakeActions`.
	///    // `_nftWasStakedAfterPrevEthDeposit`.
	///    `numEthDeposits`.
	///    `numStateResets`.
	function tryPerformMaintenance(bool resetState_, address charityAddress_) external override onlyOwner returns (bool) {
		// #region

		// require(charityAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(_numStakedNfts == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still staked NFTs."));
		require(numUnpaidStakeActions == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still unpaid rewards."));

		// #endregion
		// #region

		if (resetState_) {
			// // This would have no effect because of Comment-202410168.
			// _nftWasStakedAfterPrevEthDeposit = 2;

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
				// [Comment-202409214]
				// There is no reentrancy vulnerability here.
				// [/Comment-202409214]
				(bool isSuccess_, ) = charityAddress_.call{value: amount_}("");

				// require(isSuccess_, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", charityAddress_, amount_));
				if (isSuccess_) {
					// [Comment-202410159]
					// Issue. Because we can be reentered near Comment-202409214,
					// this assertion is not necessarily guaranteed to succeed.
					// [/Comment-202410159]
					// #enable_asserts assert(address(this).balance == 0);

					emit CosmicGameEvents.FundsTransferredToCharity(charityAddress_, amount_);
				} else {
					// #enable_asserts assert(address(this).balance == amount_);
					emit CosmicGameEvents.FundTransferFailed("Transfer to charity failed.", charityAddress_, amount_);
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
	/// The caller is required to pay the returned reward to the staker.
	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicGameErrors.NftStakeActionInvalidId`.
	///    `CosmicGameErrors.NftStakeActionAccessDenied`.
	///    `CosmicGameErrors.NftAlreadyUnstaked`.
	///    `_numStakedNfts`.
	///    `actionCounter`.
	///    `NftUnstaked`.
	///    `StakeAction`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `nft`.
	///    `stakeActions`.
	///    `numUnpaidStakeActions`.
	///    `numEthDeposits`.
	///    `_calculateRewardAmount`.
	function _unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private
		returns (uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;
		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;
		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #endregion
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress != address(0)) {
				revert CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// [Comment-202410182]
				// It's also possible that this stake action has already been deleted, but we have no knowledge about that.
				// [/Comment-202410182]
				revert CosmicGameErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			}
		}
		require(
			stakeActionCopy_.maxUnpaidEthDepositIndex == 0,
			CosmicGameErrors.NftAlreadyUnstaked("NFT has already been unstaked.", stakeActionId_)
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
		nft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		emit NftUnstaked(newActionCounter_, stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_, rewardAmount_, stakeActionCopy_.maxUnpaidEthDepositIndex);

		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - 1);
		// #enable_asserts assert(actionCounter > 0);
		// #enable_asserts assert(nft.ownerOf(stakeActionCopy_.nftId) == msg.sender);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftId == 0);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));
		// #enable_asserts assert(numUnpaidStakeActions - initialNumUnpaidStakeActions_ <= 1);

		// #endregion
	}

	// #endregion
	// #region `_preparePayReward`

	/// @notice Makes state updates needed to pay another, possibly the last, part of the reward.
	/// The caller is required to pay the returned reward to the staker.
	/// @dev This function is called after the `NftUnstaked` or `RewardPaid` event is emitted
	/// with a nonzero `maxUnpaidEthDepositIndex`.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicGameErrors.NftStakeActionInvalidId`.
	///    `CosmicGameErrors.NftStakeActionAccessDenied`.
	///    `CosmicGameErrors.NftNotUnstaked`.
	///    `RewardPaid`.
	///    `StakeAction`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `stakeActions`.
	///    `numUnpaidStakeActions`.
	///    `_calculateRewardAmount`.
	function _preparePayReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private
		returns (uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;
		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #endregion
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress != address(0)) {
				revert CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to receive staking reward.", stakeActionId_, msg.sender);
			} else {
				// Comment-202410182 applies.
				revert CosmicGameErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			}
		}
		require(
			stakeActionCopy_.maxUnpaidEthDepositIndex > 0,
			CosmicGameErrors.NftNotUnstaked("NFT has not been unstaked.", stakeActionId_)
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
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `ethDeposits`.
	function _calculateRewardAmount(uint256 stakeActionId_, uint256 maxUnpaidEthDepositIndex_, uint256 numEthDepositsToEvaluateMaxLimit_) private view
		returns (uint256 rewardAmount_, uint256 remainingMaxUnpaidEthDepositIndex_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// This can be zero.
		// #enable_asserts assert(maxUnpaidEthDepositIndex_ < ethDeposits.length);

		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

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
					// If it equals zero, we have completed evaluating depsits for the given stake action.
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

	/// @notice This stupid function just transfers the given ETH amount to whoever calls it.
	/// @dev
	/// Observable universe entities accessed here:
	///    `address.call`.
	///    `msg.sender`.
	///    `CosmicGameErrors.FundTransferFailed`.
	function _payReward(uint256 rewardAmount_) private {
		// #region

		// #enable_asserts uint256 initialBalance_ = address(this).balance;

		// #endregion
		// #region

		// // [Comment-202409215]
		// // It's unnecessary to spend gas on this validation.
		// // [/Comment-202409215]
		// // This will be zero in the following cases:
		// // 1. The staker stakes and, before we receive anotehr deposit, unstakes their NFT.
		// // 2. Someone calls `unstakeMany` or `payManyRewards` with an empty array of stake action IDs.
		// // 3. We evaluated only a single deposit and determined that the staker isn't entitled to it.
		// //    This case is elaborated in Comment-202410142.
		// // 4. All deposits we received while this stake was active
		// //    were too small for the formula near Comment-202410161 to produce a nonzero.
		// //    Although that's probably unlikely to happen.
		// if (rewardAmount_ > 0)

		{
			// [Comment-202410158]
			// Comment-202409214 applies.
			// [/Comment-202410158]
			(bool isSuccess_, ) = msg.sender.call{value: rewardAmount_}("");

			require(
				isSuccess_,
				CosmicGameErrors.FundTransferFailed("NFT staking reward payment failed.", msg.sender, rewardAmount_)
			);
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
