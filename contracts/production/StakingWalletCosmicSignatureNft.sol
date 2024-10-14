// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IStakingWalletCosmicSignatureNft } from "./interfaces/IStakingWalletCosmicSignatureNft.sol";

// #endregion
// #region

contract StakingWalletCosmicSignatureNft is Ownable, IStakingWalletCosmicSignatureNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct _StakeAction {
		uint256 nftId;
		address nftOwnerAddress;

		/// @notice
		/// [Comment-202410268]
		/// This index is within `StakingWalletCosmicSignatureNft.ethDeposits`.
		/// A nonzero indicates that this NFT has been unstaked and it's likely that rewards from some `_EthDeposit` instances
		/// have not been paid yet. So the staker has an option to call `StakingWalletCosmicSignatureNft.payReward`, possibly multiple times,
		/// to receieve yet to be paid rewards.
		/// We used the word "likely" in the above comment
		/// because this particular `_EthDeposit` instance has not been evaluated yet.
		/// Therefore it's actually possible that the staker isn't entitled to get a reward from it.
		/// [/Comment-202410268]
		uint256 maxUnpaidEthDepositIndex;
	}

	/// @notice Stores details about an ETH deposit.
	/// Multiple deposits can be aggregated in a single `_EthDeposit` instance.
	/// To minimize transaction fees, this fits in a single storage slot.
	struct _EthDeposit {
		/// @dev
		/// [Comment-202410117]
		/// This is populated from `StakingWalletCosmicSignatureNft._actionCounter`.
		/// [/Comment-202410117]
		/// This is populated when creating an `_EthDeposit` instance.
		/// This is not updated when adding another deposit to the last `_EthDeposit` instance.
		uint64 depositId;

		uint192 rewardAmountPerStakedNft;
	}

	// #endregion
	// #region Constants

	/// @notice A max limit on another max limit.
	/// @dev This value is quite big, and, at the same time, it's small enough to avoid dealing with possible overflows.
	/// Comment-202410286 relates.
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
	/// This also contains unstaked, but not yet fully paid NFTs.
	/// @dev Comment-202410117 applies to `stakeActionId`.
	mapping(uint256 stakeActionId => _StakeAction) public stakeActions;

	/// @notice The current number of staked NFTs.
	/// In other words, this is the number of `stakeActions` items containing a zero `maxUnpaidEthDepositIndex`.
	/// @dev
	/// [Comment-202410274]
	/// It could make sense to declare this `public`, but this is `private` because there is an accessor function for this.
	/// [/Comment-202410274]
	uint256 private _numStakedNfts;

	/// @notice The current number of already unstaked and not yet fully rewarded NFTs.
	/// In other words, this is the number of `stakeActions` items containing a nonzero `maxUnpaidEthDepositIndex`.
	uint256 public numUnpaidStakeActions;

	/// @notice This indicates whether a stake action has occurred after the last ETH deposit.
	/// 1 means false; 2 means true.
	/// @dev If someone stakes an NFT we will need to create a new `ethDeposits` item on the next deposit.
	/// Although, if they also unstake it before the next deposit it would be unnecessary to create a new item,
	/// but we will anyway create one, which is probably not too bad.
	/// [Comment-202410168]
	/// The initial value doesn't matter because before we get a chance to evaluate this we will assign to this.
	/// [/Comment-202410168]
	/// To minimize gas fees, we never assign zero to this, and therefore this is not a `bool`.
	uint256 private _nftWasStakedAfterPrevEthDeposit = 2;

	/// @notice This contains IDs of NFTs that have ever been used for staking.
	/// @dev Idea. Item value should be an enum NFTStakingStatusCode: NeverStaked, Staked, Unstaked.
	/// Comment-202410274 applies.
	mapping(uint256 nftId => bool nftWasUsed) private _usedNfts;

	/// @notice `ethDepositIndex` is 1-based.
	mapping(uint256 ethDepositIndex => _EthDeposit) public ethDeposits;

	/// @notice `ethDeposits` item count.
	uint256 public numEthDeposits;

	/// @notice This is used to generate monotonic unique IDs.
	uint256 private _actionCounter;

	// #endregion
	// #region `constructor`

	/// @notice Initializes a newly deployed `StakingWalletCosmicSignatureNft` contract.
	/// @param nft_ The `CosmicSignature` contract address.
	/// @param game_ The `CosmicGame` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    `Ownable` `constructor`. ToDo-202408114-1 applies.
	///    `nft`.
	///    `game`.
	///    `_numStakedNfts`. `assert` only.
	///    `numUnpaidStakeActions`. `assert` only.
	///    `_nftWasStakedAfterPrevEthDeposit`. `assert` only.
	///    `numEthDeposits`. `assert` only.
	///    `_actionCounter`. `assert` only.
	///
	/// todo-1 Is `nft_` the same as `game_.nft()`?
	/// todo-1 But we don't import the game contract.
	/// todo-1 At least explain in a comment.
	/// todo-1 The same probably applies to `StakingWalletRWalk`. But there `game_` member is different.
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
		// #enable_asserts assert(_numStakedNfts == 0);
		// #enable_asserts assert(numUnpaidStakeActions == 0);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 2);
		// #enable_asserts assert(numEthDeposits == 0);
		// #enable_asserts assert(_actionCounter == 0);

		// #endregion
	}

	// #endregion
	// #region `stake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `StakeActionOccurred`.
	///    `StakeAction`.
	///    `nft`.
	///    `stakeActions`.
	///    `_numStakedNfts`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `usedNfts`.
	///    `_actionCounter`.
	function stake(uint256 nftId_) public override {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		require(
			( ! _usedNfts[nftId_] ),
			CosmicGameErrors.NftOneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

		uint256 newStakeActionId_ = _actionCounter + 1;
		_actionCounter = newStakeActionId_;
		_StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		newStakeActionReference_.nftId = nftId_;
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		// #enable_asserts assert(newStakeActionReference_.maxUnpaidEthDepositIndex == 0);
		uint256 newNumStakedNfts_ = _numStakedNfts + 1;
		_numStakedNfts = newNumStakedNfts_;

		// Comment-202410168 relates.
		_nftWasStakedAfterPrevEthDeposit = 2;

		_usedNfts[nftId_] = true;
		nft.transferFrom(msg.sender, address(this), nftId_);
		emit StakeActionOccurred(newStakeActionId_, nftId_, msg.sender, newNumStakedNfts_);
		
		// #endregion
		// #region

		// #enable_asserts assert(nft.ownerOf(nftId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftId == nftId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(stakeActions[newStakeActionId_].maxUnpaidEthDepositIndex == 0);
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + 1);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 2);
		// #enable_asserts assert(_usedNfts[nftId_]);
		// #enable_asserts assert(_actionCounter > 0);

		// #endregion
	}

	// #endregion
	// #region `stakeMany`

	function stakeMany(uint256[] calldata nftIds_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		for ( uint256 nftIdIndex_ = 0; nftIdIndex_ < nftIds_.length; ++ nftIdIndex_ ) {
			stake(nftIds_[nftIdIndex_]);
		}

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + nftIds_.length);
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
		// This must be positive, which implies that we will pay at least the last deposit on unstake.
		// As a result, it's correct to not create another deposit after someone unstakes.
		// todo-0 Write a more cenralized comment near `_nftWasStakedAfterPrevEthDeposit` and ref here and in sopme other places.
		require(
			numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
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
	///    `_numStakedNfts`. `assert` only.
	///    `_unstake`.
	///    `_payReward`.
	function unstakeMany(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// todo-0 Similar comment as in `unstake`. Crfoss-ref both comments.
		require(
			numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		// todo-0 As long as this doesn't underflow ...
		// todo-0 Cross-ref with the above validation.
		numEthDepositsToEvaluateMaxLimit_ -= stakeActionIds_.length;

		uint256 rewardAmountsSum_ = 0;
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			++ numEthDepositsToEvaluateMaxLimit_;
			(uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) =
				_unstake(stakeActionIds_[stakeActionIdIndex_], numEthDepositsToEvaluateMaxLimit_);
			rewardAmountsSum_ += rewardAmount_;
			numEthDepositsToEvaluateMaxLimit_ = remainingNumEthDepositsToEvaluateMaxLimit_;
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
		// todo-0 +++ Similar to `unstake`, only replace the call to `_unstake` with the call to `_preparePayReward`.
		// todo-0 Comments similar to `unstake`.

		require(
			numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
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
	///    `_numStakedNfts`. `assert` only.
	///    `_preparePayReward`.
	///    `_payReward`.
	function payManyRewards(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// todo-0 +++ Similar to `unstakeMany`, only replace the call to `_unstake` with the call to `_preparePayReward`.
		// todo-0 Comments similar to `unstakeMany`.

		require(
			numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of the allowed range.", numEthDepositsToEvaluateMaxLimit_)
		);

		numEthDepositsToEvaluateMaxLimit_ -= stakeActionIds_.length;

		uint256 rewardAmountsSum_ = 0;
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			++ numEthDepositsToEvaluateMaxLimit_;
			(uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) =
				_preparePayReward(stakeActionIds_[stakeActionIdIndex_], numEthDepositsToEvaluateMaxLimit_);
			rewardAmountsSum_ += rewardAmount_;
			numEthDepositsToEvaluateMaxLimit_ = remainingNumEthDepositsToEvaluateMaxLimit_;
		}
		_payReward(rewardAmountsSum_);
	}

	// #endregion
	// #region `numStakedNfts`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_numStakedNfts`.
	function numStakedNfts() external view override returns (uint256) {
		return _numStakedNfts;
	}

	// #endregion
	// #region `wasNftUsed`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_usedNfts`.
	function wasNftUsed(uint256 nftId_) external view override returns (bool) {
		return _usedNfts[nftId_];
	}

	// #endregion
	// #region `depositIfPossible`

	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.DepositFromUnauthorizedSender`.
	///    `CosmicGameErrors.NoStakedNfts`.
	///    `EthDepositReceived`.
	///    `_EthDeposit`.
	///    `game`.
	///    `_numStakedNfts`.
	///    `_nftWasStakedAfterPrevEthDeposit`.
	///    `ethDeposits`.
	///    `numEthDeposits`.
	///    `_actionCounter`.
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

		_EthDeposit memory newEthDeposit_;
		uint256 newNumEthDeposits_ = numEthDeposits;
		uint256 newActionCounter_ = _actionCounter + 1;
		_actionCounter = newActionCounter_;

		// #endregion
		// #region

		// Comment-202410168 relates.
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
		// #enable_asserts assert(_actionCounter > 0);

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
	///    `numUnpaidStakeActions`.
	///    // `_nftWasStakedAfterPrevEthDeposit`.
	///    `numEthDeposits`.
	function tryPerformMaintenance(bool resetState_, address charityAddress_) external override onlyOwner returns (bool) {
		// #region

		// require(charityAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(_numStakedNfts == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still staked NFTs."));
		require(numUnpaidStakeActions == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still unpaid rewards."));

		// #endregion
		// #region

		if (resetState_) {
			// // This would be unnecessary because of Comment-202410168.
			// _nftWasStakedAfterPrevEthDeposit = 2;

			// [Comment-202410166]
			// It's unnecessary to also clear `ethDeposits`.
			// [/Comment-202410166]
			numEthDeposits = 0;
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
	/// The caller is required to pay the returned reward.
	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.NftStakeActionInvalidId`.
	///    `CosmicGameErrors.NftStakeActionAccessDenied`.
	///    `CosmicGameErrors.NftAlreadyUnstaked`.
	///    `UnstakeActionOccurred`.
	///    `_StakeAction`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `nft`.
	///    `stakeActions`.
	///    `_numStakedNfts`.
	///    `numUnpaidStakeActions`.
	///    `numEthDeposits`.
	///    `_calculateRewardAmount`.
	function _unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private
		returns (uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;
		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;

		// #endregion
		// #region

		_StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		_StakeAction memory stakeActionCopy_ = stakeActionReference_;

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
		emit UnstakeActionOccurred(stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_, rewardAmount_, stakeActionCopy_.maxUnpaidEthDepositIndex);

		// #endregion
		// #region

		// #enable_asserts assert(nft.ownerOf(stakeActionCopy_.nftId) == msg.sender);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftId == 0);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - 1);
		// #enable_asserts assert(numUnpaidStakeActions - initialNumUnpaidStakeActions_ <= 1);

		// #endregion
	}

	// #endregion
	// #region `_preparePayReward`

	/// @notice Makes state updates needed to pay another, possibly the last, part of the reward.
	/// The caller is required to pay the returned reward.
	/// @dev This function is called after the `UnstakeActionOccurred` or `RewardPaid` event is emitted
	/// with a nonzero `maxUnpaidEthDepositIndex`.
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.NftStakeActionInvalidId`.
	///    `CosmicGameErrors.NftStakeActionAccessDenied`.
	///    `CosmicGameErrors.NftNotUnstaked`.
	///    `RewardPaid`.
	///    `_StakeAction`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `stakeActions`.
	///    `numUnpaidStakeActions`.
	///    `_calculateRewardAmount`.
	function _preparePayReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private
		returns (uint256 rewardAmount_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);
		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;

		// #endregion
		// #region

		_StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		_StakeAction memory stakeActionCopy_ = stakeActionReference_;

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
	///    `_EthDeposit`.
	///    `NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT`.
	///    `ethDeposits`.
	function _calculateRewardAmount(uint256 stakeActionId_, uint256 maxUnpaidEthDepositIndex_, uint256 numEthDepositsToEvaluateMaxLimit_) private view
		returns (uint256 rewardAmount_, uint256 remainingMaxUnpaidEthDepositIndex_, uint256 remainingNumEthDepositsToEvaluateMaxLimit_) {
		// #region

		// [Comment-202410286]
		// This can be zero.
		// It's probably safe to assume that this is not anywhere close to overflow.
		// So let's take the liberty to add this `assert`, in spite of the fact that this constant isn't intended to be used in this case.
		// [/Comment-202410286]
		// #enable_asserts assert(maxUnpaidEthDepositIndex_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= NUM_ETH_DEPOSITS_TO_EVALUATE_HARD_MAX_LIMIT);

		// #endregion
		// #region

		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// #region

			// [Comment-202410284]
			// This formula would be able to underflow if its parameters were unsigned.
			// [/Comment-202410284]
			// The result can be positive, zero, or negative if interpreted as signed.
			remainingMaxUnpaidEthDepositIndex_ = uint256(int256(maxUnpaidEthDepositIndex_) - int256(numEthDepositsToEvaluateMaxLimit_));

			// #enable_asserts assert(rewardAmount_ == 0);

			// #endregion
			// #region

			for (uint256 ethDepositIndex_ = maxUnpaidEthDepositIndex_; ;) {
				// #region

				_EthDeposit memory ethDepositCopy_ = ethDeposits[ethDepositIndex_];

				// Comment-202410284 applies.
				// [Comment-202410287/]
				ethDepositIndex_ = uint256(int256(ethDepositIndex_) - int256(1));
				// #enable_asserts assert(int256(ethDepositIndex_) >= -1);

				// #endregion
				// #region

				// [Comment-202410283]
				// This condition is guaranteed to be `true` if `ethDepositCopy_` was taken from the index of zero.
				// That storage slot is never assigned to.
				// [/Comment-202410283]
				if (ethDepositCopy_.depositId < stakeActionId_) {

					remainingMaxUnpaidEthDepositIndex_ = 0;

					// Comment-202410284 applies.
					uint256 numEvaluatedEthDeposits = uint256(int256(maxUnpaidEthDepositIndex_) - int256(ethDepositIndex_));
					// #enable_asserts assert(int256(numEvaluatedEthDeposits) > int256(0));

					remainingNumEthDepositsToEvaluateMaxLimit_ = numEthDepositsToEvaluateMaxLimit_ - numEvaluatedEthDeposits;
					break;
				}

				// #endregion
				// #region

				// [Comment-202410288]
				// Provided Comment-202410283 is true, this `assert` is supposed to succeed.
				// Remember that we have decremented this near Comment-202410287.
				// [/Comment-202410288]
				// #enable_asserts assert(int256(ethDepositIndex_) >= int256(0));

				rewardAmount_ += ethDepositCopy_.rewardAmountPerStakedNft;

				// [Comment-202410289/]
				// #enable_asserts assert(int256(ethDepositIndex_) >= int256(remainingMaxUnpaidEthDepositIndex_));

				// #endregion
				// #region

				// [Comment-202410291/]
				if (int256(ethDepositIndex_) <= int256(remainingMaxUnpaidEthDepositIndex_)) {

					// [Comment-202410292]
					// Given the `assert` near Comment-202410289 and the condition near Comment-202410291,
					// this assert is guaranteed to succeed.
					// [/Comment-202410292]
					// #enable_asserts assert(ethDepositIndex_ == remainingMaxUnpaidEthDepositIndex_);

					// We have already calculated this. Keeping the previously calculated value.
					// Given the `assert`s near Comment-202410288 and Comment-202410292, this assert is guaranteed to succeed.
					// If this is zero the last evaluated deposit index was 1, and so we have completed evaluating depsits
					// for the given stake action, which, in turn, was staked before we received the 1st deposit.
					// As noted in Comment-202410283, we know that it's unnecessary to evaluate the non-exiting deposit
					// at the index of zero.
					// #enable_asserts assert(int256(remainingMaxUnpaidEthDepositIndex_) >= int256(0));

					// #enable_asserts assert(remainingNumEthDepositsToEvaluateMaxLimit_ == 0);
					break;
				}

				// #endregion
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
