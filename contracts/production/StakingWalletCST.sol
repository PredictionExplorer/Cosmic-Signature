// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IStakingWalletCST } from "./interfaces/IStakingWalletCST.sol";

contract StakingWalletCST is Ownable, IStakingWalletCST {
	// #region Data Types

	/// @notice Stores details about an NFT staking action.
	struct StakeAction {
		uint256 tokenId;
		address nftOwnerAddress;

		// A past version used to have a variable here that specified rewards from what deposits have not been claimed yet.
		// If you need to resurrect that feature revisit the logic near Comment-202410171.
	}

	/// @notice Stores details about an ETH deposit.
	/// Multiple deposits can be aggregated in a single `ETHDeposit` instance.
	/// To minimize transaction fees, this fits in a single storage slot.
	struct ETHDeposit {
		/// @dev
		/// [Comment-202410117]
		/// This is populated from `StakingWalletCST._actionCounter`.
		/// [/Comment-202410117]
		/// This is populated when creating an `ETHDeposit` instance.
		/// This is not updated when adding another deposit to the last `ETHDeposit` instance.
		uint64 depositId;

		uint192 rewardAmountPerStakedNFT;
	}

	// #endregion
	// #region State

	/// @notice The `CosmicSignature` NFT contract address.
	CosmicSignature public nft;

	/// @notice The `CosmicGame` contract address.
	address public game;

	/// @notice Info about currently staked NFTs.
	/// @dev Comment-202410117 applies to `stakeActionId`.
	mapping(uint256 stakeActionId => StakeAction) public stakeActions;

	/// @notice The current number of staked NFTs.
	uint256 private _numStakedNFTs;

	/// @notice This indicates whether a staking action has occurred after the last ETH deposit.
	/// 1 means false; 2 means true.
	/// @dev If someone stakes an NFT we will need to create a new `ETHDeposits` item on the next deposit.
	/// Although, if they also unstake it before the next deposit it would be unnecessary to create a new item,
	/// but we will anyway create one, which is probably not too bad.
	/// [Comment-202410168]
	/// The initial value doesn't matter because before we get a chance to evaluate this we will assign to this.
	/// [/Comment-202410168]
	/// To minimize gas fees, we never assign zero to this, and therefore this is not a `bool`.
	uint256 private _NFTWasStakedAfterPrevETHDeposit = 2;

	/// @notice This contains IDs of NFTs that have ever been used for staking.
	/// @dev Idea. Item value should be an enum NFTStakingStatusCode: NeverStaked, Staked, Unstaked.
	mapping(uint256 tokenId => bool tokenWasUsed) private _usedTokens;

	/// @notice `ETHDepositIndex` is 1-based.
	mapping(uint256 ETHDepositIndex => ETHDeposit) public ETHDeposits;

	/// @notice `ETHDeposits` item count.
	uint256 public numETHDeposits;

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
		// #enable_asserts assert(_numStakedNFTs == 0);
		// #enable_asserts assert(_NFTWasStakedAfterPrevETHDeposit == 2);
		// #enable_asserts assert(numETHDeposits == 0);
		// #enable_asserts assert(_actionCounter == 0);
		// #endregion
	}

	function stake(uint256 tokenId_) public override {
		require(
			( ! _usedTokens[tokenId_] ),
			CosmicGameErrors.OneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", tokenId_)
		);

		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNFTs;
		// #endregion

		StakeAction memory newStakeAction_;
		newStakeAction_.tokenId = tokenId_;
		newStakeAction_.nftOwnerAddress = msg.sender;
		uint256 newStakeActionId_ = ( ++ _actionCounter );
		stakeActions[newStakeActionId_] = newStakeAction_;
		uint256 newNumStakedNFTs_ = _numStakedNFTs + 1;
		_numStakedNFTs = newNumStakedNFTs_;

		// Comment-202410168 relates.
		_NFTWasStakedAfterPrevETHDeposit = 2;

		_usedTokens[tokenId_] = true;
		nft.transferFrom(msg.sender, address(this), tokenId_);
		emit StakeActionEvent(newStakeActionId_, tokenId_, msg.sender, newNumStakedNFTs_);
		
		// #region Assertions
		// #enable_asserts assert(nft.ownerOf(tokenId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].tokenId == tokenId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(_numStakedNFTs == initialNumStakedNFTs_ + 1);
		// #enable_asserts assert(_NFTWasStakedAfterPrevETHDeposit == 2);

		// // todo-1 For some reason, this fails to compile without `this.`. To be revisited.
		// #enable_asserts assert(this.wasTokenUsed(tokenId_));

		// #enable_asserts assert(_actionCounter > 0);
		// #endregion
	}

	function stakeMany(uint256[] memory tokenIds_) external override {
		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNFTs;
		// #endregion

		for ( uint256 NFTIdIndex_ = 0; NFTIdIndex_ < tokenIds_.length; ++ NFTIdIndex_ ) {
			stake(tokenIds_[NFTIdIndex_]);
		}

		// #region Assertions
		// #enable_asserts assert(_numStakedNFTs == initialNumStakedNFTs_ + tokenIds_.length);
		// #endregion
	}

	function unstake(uint256 stakeActionId_) external override {
		uint256 rewardAmount_ = _unstake(stakeActionId_);
		_payReward(rewardAmount_);
	}

	function unstakeMany(uint256[] memory stakeActionIds_) external override {
		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNFTs;
		// #endregion

		uint256 rewardAmount_ = 0;
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			rewardAmount_ += _unstake(stakeActionIds_[stakeActionIdIndex_]);
		}
		_payReward(rewardAmount_);

		// #region Assertions
		// Comment-202410159 applies to Comment-202410158.
		// #enable_asserts assert(_numStakedNFTs == initialNumStakedNFTs_ - stakeActionIds_.length);
		// #endregion
	}

	function numTokensStaked() external view override returns (uint256) {
		return _numStakedNFTs;
	}

	function wasTokenUsed(uint256 tokenId_) external view override returns (bool) {
		return _usedTokens[tokenId_];
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

		uint256 numStakedNFTsCopy_ = _numStakedNFTs;

		if (numStakedNFTsCopy_ == 0) {
			// This error description length affects the length we evaluate near Comment-202410149.
			revert CosmicGameErrors.NoTokensStaked("There are no CST NFTs staked.");
		}

		// #region Assertions
		// #enable_asserts uint256 initialNumETHDeposits_ = numETHDeposits;
		// #endregion

		ETHDeposit memory newETHDeposit_;
		uint256 newNumETHDeposits_ = numETHDeposits;

		// Comment-202410168 relates.
		if (_NFTWasStakedAfterPrevETHDeposit >= 2) {

			_NFTWasStakedAfterPrevETHDeposit = 1;

			// If we executed logic near Comment-202410166, it's possible that an `ETHDeposits` item already exists at this position.
			// We will overwrite it.
			++ newNumETHDeposits_;
			numETHDeposits = newNumETHDeposits_;

			newETHDeposit_.depositId = uint64( ++ _actionCounter );

			// [Comment-202410161/]
			newETHDeposit_.rewardAmountPerStakedNFT = uint192(msg.value / numStakedNFTsCopy_);
		} else {
			newETHDeposit_ = ETHDeposits[newNumETHDeposits_];

			// Comment-202410161 applies.
			newETHDeposit_.rewardAmountPerStakedNFT += uint192(msg.value / numStakedNFTsCopy_);
		}

		ETHDeposits[newNumETHDeposits_] = newETHDeposit_;
		emit EthDepositEvent(roundNum_, newETHDeposit_.depositId, msg.value, numStakedNFTsCopy_);

		// #region Assertions
		// #enable_asserts assert(_NFTWasStakedAfterPrevETHDeposit == 1);
		// #enable_asserts assert(ETHDeposits[numETHDeposits].depositId > 0);
		// #enable_asserts assert(numETHDeposits - initialNumETHDeposits_ <= 1);
		// #enable_asserts assert(_actionCounter > 0);
		// #endregion
	}

	function tryPerformMaintenance(bool resetState_, address charityAddress_) external override onlyOwner returns (bool) {
		// require(charityAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));

		// [Comment-202410171]
		// This condition ensures that all rewards have been claimed. It wasn't the case in a past version,
		// which had another variable named `numStakeActions`.
		// [/Comment-202410171]
		require(_numStakedNFTs == 0, CosmicGameErrors.InvalidOperationInCurrentState("There are still CST NFTs staked."));

		if (resetState_) {
			// // This would be unnecessary because of Comment-202410168.
			// _NFTWasStakedAfterPrevETHDeposit = 2;

			// [Comment-202410166]
			// It's unnecessary to also clear `ETHDeposits`.
			// [/Comment-202410166]
			numETHDeposits = 0;
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

	function _unstake(uint256 stakeActionId_) private returns (uint256) {
		StakeAction memory stakeAction_ = stakeActions[stakeActionId_];

		if (msg.sender != stakeAction_.nftOwnerAddress) {
			if (stakeAction_.nftOwnerAddress != address(0)) {
				revert CosmicGameErrors.AccessError("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// [Comment-202410182]
				// It's also possible that this NFT has never been staked, but we have no knowledge about that.
				// [/Comment-202410182]
				revert CosmicGameErrors.TokenAlreadyUnstaked("NFT has already been unstaked.", stakeActionId_);
			}
		}

		// #region Assertions
		// #enable_asserts uint256 initialNumStakedNFTs_ = _numStakedNFTs;
		// #endregion

		uint256 rewardAmount_ = _calculateRewardAmount(stakeActionId_);
		delete stakeActions[stakeActionId_];
		uint256 newNumStakedNFTs_ = _numStakedNFTs - 1;
		_numStakedNFTs = newNumStakedNFTs_;
		nft.transferFrom(address(this), msg.sender, stakeAction_.tokenId);
		emit UnstakeActionEvent(stakeActionId_, stakeAction_.tokenId, msg.sender, newNumStakedNFTs_, rewardAmount_);

		// #region Assertions
		// #enable_asserts assert(nft.ownerOf(stakeAction_.tokenId) == msg.sender);
		// #enable_asserts assert(stakeActions[stakeActionId_].tokenId == 0);
		// #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));
		// #enable_asserts assert(_numStakedNFTs == initialNumStakedNFTs_ - 1);
		// #endregion

		return rewardAmount_;
	}

	/// @notice Calculates reward amount for a given stake action.
	/// @param stakeActionId_ Stake action ID.
	/// @return The calculated value.
	/// @dev Issue. It's possible to use binary search to find the oldest `ETHDeposits` item to add.
	/// It would probably tend to be more gas efficient.
	/// But I am not going to implement that.
	function _calculateRewardAmount(uint256 stakeActionId_) private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 rewardAmount_ = 0;
			for ( uint256 ETHDepositIndex_ = numETHDeposits; /*ETHDepositIndex_ > 0*/; -- ETHDepositIndex_ ) {
				ETHDeposit memory ETHDeposit_ = ETHDeposits[ETHDepositIndex_];
				if (ETHDeposit_.depositId < stakeActionId_) {
					break;
				}
				rewardAmount_ += ETHDeposit_.rewardAmountPerStakedNFT;
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
