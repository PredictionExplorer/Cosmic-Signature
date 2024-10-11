// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IStakingWalletCST } from "./interfaces/IStakingWalletCST.sol";

contract StakingWalletCST is Ownable, IStakingWalletCST {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct _StakeAction {
		uint256 nftId;
		address nftOwnerAddress;

		/// @notice
		/// [Comment-202410268]
		/// This index is within `StakingWalletCST.ethDeposits`.
		/// A nonzero indicates that this NFT has been unstaked and it's likely that rewards from some `_EthDeposit` instances
		/// have not been paid yet. So the staker has an option to call `StakingWalletCST.payReward`, possibly multiple times,
		/// to receieve yet to be paid rewards.
		/// We used the word "likely" because this particular `_EthDeposit` instance has not been evaluated yet.
		/// Therefore it's actually possible that the staker isn't entitled to get a reward from it,
		/// let anone from other deposits with lower indexes.
		/// [/Comment-202410268]
		uint256 maxUnpaidEthDepositIndex;
	}

	/// @notice Stores details about an ETH deposit.
	/// Multiple deposits can be aggregated in a single `_EthDeposit` instance.
	/// To minimize transaction fees, this fits in a single storage slot.
	struct _EthDeposit {
		/// @dev
		/// [Comment-202410117]
		/// This is populated from `StakingWalletCST._actionCounter`.
		/// [/Comment-202410117]
		/// This is populated when creating an `_EthDeposit` instance.
		/// This is not updated when adding another deposit to the last `_EthDeposit` instance.
		uint64 depositId;

		uint192 rewardAmountPerStakedNft;
	}

	// #endregion
	// #region State

	/// @notice The `CosmicSignature` NFT contract address.
	CosmicSignature public nft;

	/// @notice The `CosmicGame` contract address.
	address public game;

	/// @notice Info about currently staked NFTs.
	/// This also contains unstaked, but not yet fully paid NFTs.
	/// @dev Comment-202410117 applies to `stakeActionId`.
	mapping(uint256 stakeActionId => _StakeAction) public stakeActions;

	/// @notice The current number of staked NFTs.
	/// In other words, this is the number of `stakeActions` items containing a zero `maxUnpaidEthDepositIndex`.
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
	mapping(uint256 nftId => bool nftWasUsed) private _usedNfts;

	/// @notice `ethDepositIndex` is 1-based.
	mapping(uint256 ethDepositIndex => _EthDeposit) public ethDeposits;

	/// @notice `ethDeposits` item count.
	uint256 public numEthDeposits;

	/// @dev A max limit on a max limit.
	/// This value is quite big, but not too big -- to avoid dealing with possible overflows.
	uint256 private constant _NUM_ETH_DEPOSITS_TO_EVALUATE_MAX_LIMIT_MAX_LIMIT = type(uint256).max / 256;

	/// @dev This is used to generate monotonic unique IDs.
	uint256 private _actionCounter;

	// /// @dev Precision factor for calculations
	// /// Was this intended to be somethig similar to `CosmicGameConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT`?
	// uint256 private constant PRECISION = 1 ether;

	// #endregion

	/// @notice Initializes a newly deployed `StakingWalletCST` contract.
	/// @param nft_ The `CosmicSignature` NFT contract address.
	/// @param game_ The `CosmicGame` contract address.
	/// @dev ToDo-202408114-1 applies.
	/// todo-1 Is `nft_` the same as `game_.nft()`?
	/// todo-1 At least explain in a comment.
	constructor(CosmicSignature nft_, address game_) Ownable(msg.sender) {
		require(address(nft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the nft."));
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		nft = nft_;
		game = game_;

		// #region Assertions
		// #enable_asserts assert(address(nft) == address(nft_));
		// #enable_asserts assert(game == game_);
		// #enable_asserts assert(_numStakedNfts == 0);
		// #enable_asserts assert(numUnpaidStakeActions == 0);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 2);
		// #enable_asserts assert(numEthDeposits == 0);
		// #enable_asserts assert(_actionCounter == 0);
		// #endregion
	}

	function stake(uint256 nftId_) public override {
		require(
			( ! _usedNfts[nftId_] ),
			CosmicGameErrors.NftOneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", nftId_)
		);

		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNfts;
		// #endregion

		uint256 newStakeActionId_ = _actionCounter + 1;
		_actionCounter = newStakeActionId_;
		_StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		newStakeActionReference_.nftId = nftId_;
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		// #enable_asserts assert(newStakeActionReference_.maxUnpaidEthDepositIndex == 0);
		uint256 newNumStakedNFTs_ = _numStakedNfts + 1;
		_numStakedNfts = newNumStakedNFTs_;

		// Comment-202410168 relates.
		_nftWasStakedAfterPrevEthDeposit = 2;

		_usedNfts[nftId_] = true;
		nft.transferFrom(msg.sender, address(this), nftId_);
		emit StakeActionOccurred(newStakeActionId_, nftId_, msg.sender, newNumStakedNFTs_);
		
		// #region Assertions
		// #enable_asserts assert(nft.ownerOf(nftId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftId == nftId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(stakeActions[newStakeActionId_].maxUnpaidEthDepositIndex == 0);
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNFTs_ + 1);
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 2);

		// // todo-1 For some reason, this fails to compile without `this.`. To be revisited.
		// #enable_asserts assert(this.wasNftUsed(nftId_));

		// #enable_asserts assert(_actionCounter > 0);
		// #endregion
	}

	function stakeMany(uint256[] memory tokenIds_) external override {
		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNfts;
		// #endregion

		for ( uint256 NFTIdIndex_ = 0; NFTIdIndex_ < tokenIds_.length; ++ NFTIdIndex_ ) {
			stake(tokenIds_[NFTIdIndex_]);
		}

		// #region Assertions
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNFTs_ + tokenIds_.length);
		// #endregion
	}

	function unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// This must be positive, which implies that we will pay at least the last deposit on unstake.
		// As a result, it's correct to not create another deposit after someone unstakes.
		require(
			numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_MAX_LIMIT_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of allowed range", numEthDepositsToEvaluateMaxLimit_)
		);

		uint256 rewardAmount_ = _unstake(stakeActionId_, numEthDepositsToEvaluateMaxLimit_);
		_payReward(rewardAmount_);
	}

	function unstakeMany(uint256[] memory stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNfts;
		// #endregion

		uint256 rewardAmount_ = 0;
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			rewardAmount_ += _unstake(stakeActionIds_[stakeActionIdIndex_], _NUM_ETH_DEPOSITS_TO_EVALUATE_MAX_LIMIT_MAX_LIMIT);
		}
		_payReward(rewardAmount_);

		// #region Assertions
		// Comment-202410159 applies to Comment-202410158.
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNFTs_ - stakeActionIds_.length);
		// #endregion
	}

	function payReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		require(
			numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_MAX_LIMIT_MAX_LIMIT,
			CosmicGameErrors.NumEthDepositsToEvaluateMaxLimitIsOutOfAllowedRange("numEthDepositsToEvaluateMaxLimit_ is out of llowed range", numEthDepositsToEvaluateMaxLimit_)
		);

		_StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		_StakeAction memory stakeAction_ = stakeActionReference_;

		if (msg.sender != stakeAction_.nftOwnerAddress) {
			if (stakeAction_.nftOwnerAddress != address(0)) {
				revert CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to receive staking reward.", stakeActionId_, msg.sender);
			} else {
				// Comment-202410182 applies.
				revert CosmicGameErrors.NftStakingRewardAlreadyPaid("NFT staking reward has already been paid.", stakeActionId_);
			}
		}
		require(
			stakeAction_.maxUnpaidEthDepositIndex > 0,
			CosmicGameErrors.NftNotUnstaked("NFT has not been unstaked.", stakeActionId_)
		);

		// #region Assertions
		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;
		// #endregion

		(uint256 rewardAmount_, uint256 maxUnpaidEthDepositIndex_) =
			_calculateRewardAmount(stakeActionId_, stakeAction_.maxUnpaidEthDepositIndex, numEthDepositsToEvaluateMaxLimit_);
		stakeActionReference_.maxUnpaidEthDepositIndex = maxUnpaidEthDepositIndex_;
		if(maxUnpaidEthDepositIndex_ == 0) {
			delete stakeActionReference_.nftId;
			delete stakeActionReference_.nftOwnerAddress;
			-- numUnpaidStakeActions;
		}
		emit RewardPaid(stakeActionId_, stakeAction_.nftId, msg.sender, rewardAmount_, maxUnpaidEthDepositIndex_);
		_payReward(rewardAmount_);

		// #region Assertions
		// #enable_asserts assert(initialNumUnpaidStakeActions_ - numUnpaidStakeActions <= 1);
		// #endregion
	}

	function payManyRewards(uint256[] memory stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external override {
		// todo-0 write code
		assert(false);
	}

	function numNftsStaked() external view override returns (uint256) {
		return _numStakedNfts;
	}

	function wasNftUsed(uint256 nftId_) external view override returns (bool) {
		return _usedNfts[nftId_];
	}

	/// @dev todo-1 Here and elsewhere, consider replacing functions like this with `receive`.
	/// todo-1 It would probably be cheaper gas-wise.
	/// todo-1 Or at least write comments.
	/// todo-1 But in this particular case `receive` won't serve our needs.
	function depositIfPossible(uint256 roundNum_) external payable override {
		require(
			msg.sender == game,
			CosmicGameErrors.DepositFromUnauthorizedSender("Only the CosmicGame contract is permitted to make a deposit.", msg.sender)
		);

		uint256 numStakedNftsCopy_ = _numStakedNfts;

		if (numStakedNftsCopy_ == 0) {
			// This error description length affects the length we evaluate near Comment-202410149.
			revert CosmicGameErrors.NoNftsStaked("There are no CST NFTs staked.");
		}

		// #region Assertions
		// #enable_asserts uint256 initialNumETHDeposits_ = numEthDeposits;
		// #endregion

		_EthDeposit memory newETHDeposit_;
		uint256 newNumETHDeposits_ = numEthDeposits;
		uint256 newActionCounter_ = _actionCounter + 1;
		_actionCounter = newActionCounter_;

		// Comment-202410168 relates.
		if (_nftWasStakedAfterPrevEthDeposit >= 2) {

			_nftWasStakedAfterPrevEthDeposit = 1;

			// If we executed logic near Comment-202410166, it's possible that an `ethDeposits` item already exists at this position.
			// We will overwrite it.
			++ newNumETHDeposits_;
			numEthDeposits = newNumETHDeposits_;

			newETHDeposit_.depositId = uint64(newActionCounter_);

			// [Comment-202410161/]
			newETHDeposit_.rewardAmountPerStakedNft = uint192(msg.value / numStakedNftsCopy_);
		} else {
			newETHDeposit_ = ethDeposits[newNumETHDeposits_];

			// Comment-202410161 applies.
			newETHDeposit_.rewardAmountPerStakedNft += uint192(msg.value / numStakedNftsCopy_);
		}

		ethDeposits[newNumETHDeposits_] = newETHDeposit_;
		emit EthDepositReceived(roundNum_, newActionCounter_, newNumETHDeposits_, newETHDeposit_.depositId, msg.value, numStakedNftsCopy_);

		// #region Assertions
		// #enable_asserts assert(_nftWasStakedAfterPrevEthDeposit == 1);
		// #enable_asserts assert(ethDeposits[numEthDeposits].depositId > 0);
		// #enable_asserts assert(numEthDeposits - initialNumETHDeposits_ <= 1);
		// #enable_asserts assert(_actionCounter > 0);
		// #endregion
	}

	function tryPerformMaintenance(bool resetState_, address charityAddress_) external override onlyOwner returns (bool) {
		// require(charityAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(_numStakedNfts == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still CST NFTs staked."));
		require(numUnpaidStakeActions == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still unpaid rewards."));

		if (resetState_) {
			// // This would be unnecessary because of Comment-202410168.
			// _nftWasStakedAfterPrevEthDeposit = 2;

			// [Comment-202410166]
			// It's unnecessary to also clear `ethDeposits`.
			// [/Comment-202410166]
			numEthDeposits = 0;
		}

		if (charityAddress_ != address(0)) {
			uint256 amount_ = address(this).balance;

			// // Comment-202409215 applies.
			// if (amount_ > 0)

			{
				// [Comment-202409214]
				// There is no reentrancy vulnerability here.
				// [/Comment-202409214]
				(bool isSuccess_, ) = charityAddress_.call{ value: amount_ }("");

				// require(isSuccess_, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", amount_, charityAddress_));

				if (isSuccess_) {
					emit CosmicGameEvents.FundsTransferredToCharityEvent(amount_, charityAddress_);

					// #region Assertions
					// [Comment-202410159]
					// Issue. Because we can be reentered near Comment-202409214,
					// some of these assertions are not necessarily guaranteed to succeed.
					// [/Comment-202410159]
					// #enable_asserts assert(address(this).balance == 0);
					// #endregion
				} else {
					emit CosmicGameEvents.FundTransferFailed("Transfer to charity failed.", amount_, charityAddress_);
					return false;
				}
			}
		}

		return true;
	}

	function _unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) private returns (uint256) {
		_StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		_StakeAction memory stakeAction_ = stakeActionReference_;

		if (msg.sender != stakeAction_.nftOwnerAddress) {
			if (stakeAction_.nftOwnerAddress != address(0)) {
				revert CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// [Comment-202410182]
				// It's also possible that this NFT has never been staked, but we have no knowledge about that.
				// [/Comment-202410182]
				revert CosmicGameErrors.NftAlreadyUnstaked("NFT has already been unstaked.", stakeActionId_);
			}
		}
		require(
			stakeAction_.maxUnpaidEthDepositIndex == 0,
			CosmicGameErrors.NftAlreadyUnstaked("NFT has already been unstaked.", stakeActionId_)
		);

		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNfts;
		// #enable_asserts uint256 initialNumUnpaidStakeActions_ = numUnpaidStakeActions;
		// #endregion

		(uint256 rewardAmount_, uint256 maxUnpaidEthDepositIndex_) =
			_calculateRewardAmount(stakeActionId_, numEthDeposits, numEthDepositsToEvaluateMaxLimit_);
		if(maxUnpaidEthDepositIndex_ > 0) {
			stakeActionReference_.maxUnpaidEthDepositIndex = maxUnpaidEthDepositIndex_;
			++ numUnpaidStakeActions;
		} else {
			delete stakeActionReference_.nftId;
			delete stakeActionReference_.nftOwnerAddress;

			// We have alredy `require`d that `stakeActionReference_.maxUnpaidEthDepositIndex` is zero.
			// So saving gas by not `delete`ing it.
		}
		uint256 newNumStakedNFTs_ = _numStakedNfts - 1;
		_numStakedNfts = newNumStakedNFTs_;
		nft.transferFrom(address(this), msg.sender, stakeAction_.nftId);
		emit UnstakeActionOccurred(stakeActionId_, stakeAction_.nftId, msg.sender, newNumStakedNFTs_, rewardAmount_, maxUnpaidEthDepositIndex_);

		// #region Assertions
		// #enable_asserts assert(nft.ownerOf(stakeAction_.nftId) == msg.sender);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftId == 0);
		// // #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));
		// #enable_asserts assert(_numStakedNfts == initialNumStakedNFTs_ - 1);
		// #enable_asserts assert(numUnpaidStakeActions - initialNumUnpaidStakeActions_ <= 1);
		// #endregion

		return rewardAmount_;
	}

	// todo-0 Return the number of evaluated ETH deposits.
	// todo-0 Write a comment. This consumes more gas than the other overload.
	function _calculateRewardAmount(uint256 stakeActionId_, uint256 maxUnpaidEthDepositIndex_, uint256 numEthDepositsToEvaluateMaxLimit_) private view returns (uint256, uint256) {
		// #region Assertions
		// #enable_asserts assert(numEthDepositsToEvaluateMaxLimit_ > 0 && numEthDepositsToEvaluateMaxLimit_ <= _NUM_ETH_DEPOSITS_TO_EVALUATE_MAX_LIMIT_MAX_LIMIT);
		// #endregion

		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// This can underflow. No problem.
			uint256 newMaxUnpaidEthDepositIndex_ = uint256(int256(maxUnpaidEthDepositIndex_) - int256(numEthDepositsToEvaluateMaxLimit_));
			
			// todo-0  < 0  ?
			if(int256(newMaxUnpaidEthDepositIndex_) <= 0) {
				return (_calculateRewardAmount(stakeActionId_, maxUnpaidEthDepositIndex_), 0);
			}

			uint256 rewardAmount_ = 0;
			uint256 ethDepositIndex_ = maxUnpaidEthDepositIndex_;
			do {
				_EthDeposit memory ETHDeposit_ = ethDeposits[ethDepositIndex_];

				// Comment-202410269 applies.
				// Although at this point `ethDepositIndex_` is guaranteed to be positive.
				if (ETHDeposit_.depositId < stakeActionId_) {

					break;
				}
				rewardAmount_ += ETHDeposit_.rewardAmountPerStakedNft;
			} while (( -- ethDepositIndex_ ) > newMaxUnpaidEthDepositIndex_);
			return (rewardAmount_, newMaxUnpaidEthDepositIndex_);
		}
	}

	/// @notice Calculates reward amount for a given stake action.
	/// @param stakeActionId_ Stake action ID.
	/// todo-0 mention all params
	/// @return The calculated value.
	/// @dev Issue. It's possible to use binary search to find the oldest `ethDeposits` item to add.
	/// It would probably tend to be more gas efficient.
	/// But I am not going to implement that.
	function _calculateRewardAmount(uint256 stakeActionId_, uint256 maxUnpaidEthDepositIndex_) private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 rewardAmount_ = 0;
			for ( uint256 ethDepositIndex_ = maxUnpaidEthDepositIndex_; /*ethDepositIndex_ > 0*/; -- ethDepositIndex_ ) {
				_EthDeposit memory ETHDeposit_ = ethDeposits[ethDepositIndex_];

				// [Comment-202410269]
				// This condition is guaranteed to be `true` when `ethDepositIndex_` is zero.
				// [/Comment-202410269]
				if (ETHDeposit_.depositId < stakeActionId_) {

					break;
				}
				rewardAmount_ += ETHDeposit_.rewardAmountPerStakedNft;
			}
			return rewardAmount_;
		}
	}

	function _payReward(uint256 rewardAmount_) private {
		// #region Assertions
		// #enable_asserts uint256 initialBalance_ = address(this).balance;
		// #endregion

		// // [Comment-202409215]
		// // It's unnecessary to spend gas on this validation.
		// // [/Comment-202409215]
		// // This will be zero in 2 cases:
		// // 1. Someone stakes and before we receive anotehr deposit unstakes their NFT.
		// // 2. All deposits we received while this stake was active
		// //    were too small for the formula near Comment-202410161 to produce a nonzero.
		// //    Although that's probably unlikely to happen.
		// if (rewardAmount_ > 0)

		{
			// [Comment-202410158]
			// Comment-202409214 applies.
			// [/Comment-202410158]
			(bool success, ) = msg.sender.call{ value: rewardAmount_ }("");

			require(success, CosmicGameErrors.FundTransferFailed("CST NFT staking reward transfer failed.", rewardAmount_, msg.sender));
		}

		// #region Assertions
		// Comment-202410159 applies to Comment-202410158.
		// #enable_asserts assert(address(this).balance == initialBalance_ - rewardAmount_);
		// #endregion
	}
}
