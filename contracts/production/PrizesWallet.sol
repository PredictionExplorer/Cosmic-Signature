// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";

// #endregion
// #region

contract PrizesWallet is Ownable, IERC721Receiver, IPrizesWallet {
	// #region State

	/// @notice The `CosmicGame` contract address.
	address public game;

	/// @notice For each bidding round number, contains main prize winner address.
	/// ToDo-202411257-1 relates.
	address[1 << 64] public roundMainPrizeWinners;

	/// @notice If a prize winner doesn't withdraw their prize within this timeout, anybody will be welcomed to withdraw it.
	/// This timeout applies to all kinds of prizes, including ETH.
	/// See also: `CosmicSignatureGameStorage.timeoutDurationToClaimMainPrize`.
	/// Comment-202411064 applies.
	uint256 public timeoutDurationToWithdrawPrizes = CosmicGameConstants.DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES;

	/// @notice For each bidding round number, contains a timeout time
	/// starting at which anybody will be welcomed to withdraw any unclaimed prizes won in that bidding round.
	/// If an item equals zero the timeout is considered not expired yet.
	/// todo-1 Would it work correct without the zero check, at least for ETH? At least add an assert. Or at least comment.
	uint256[1 << 64] public roundTimeoutTimesToWithdrawPrizes;

	/// @notice For each prize winner address, contains a `CosmicGameConstants.BalanceInfo`.
	/// @dev Comment-202411252 relates.
	/// Comment-202410274 applies.
	CosmicGameConstants.BalanceInfo[1 << 160] private _ethBalancesInfo;

	/// @notice This includes deleted items.
	uint256 public numDonatedNfts = 0;

	/// @notice Contains info about donated NFTs.
	/// This array can contain zero or more items per bidding round.
	/// We delete the item on claim.
	CosmicGameConstants.DonatedNft[1 << 64] public donatedNfts;

	// #endregion
	// #region `onlyGame`

	/// @dev
	/// Comment-202411253 applies.
	modifier onlyGame() {
		require(
			msg.sender == game,
			CosmicGameErrors.CallDenied("Only the CosmicGame contract is permitted to call this method.", msg.sender)
		);
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicGame` contract address.
	constructor(address game_) Ownable(msg.sender) {
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		game = game_;
	}

	// #endregion
	// #region `onERC721Received`

	function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
		return IERC721Receiver.onERC721Received.selector;
	}

	// #endregion
	// #region `setTimeoutDurationToWithdrawPrizes`

	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external override onlyOwner {
		timeoutDurationToWithdrawPrizes = newValue_;
		emit TimeoutDurationToWithdrawPrizesChanged(newValue_);
	}

	// #endregion
	// #region `registerRoundEnd`

	function registerRoundEnd(uint256 roundNum_, address roundMainPrizeWinner_) external override onlyGame {
		// #enable_asserts assert(roundMainPrizeWinners[roundNum_] == address(0));
		// #enable_asserts assert(roundNum_ == 0 || roundMainPrizeWinners[roundNum_ - 1] != address(0));
		// #enable_asserts assert(roundTimeoutTimesToWithdrawPrizes[roundNum_] == 0);
		// #enable_asserts assert(roundNum_ == 0 || roundTimeoutTimesToWithdrawPrizes[roundNum_ - 1] != 0);
		// #enable_asserts assert(roundMainPrizeWinner_ != address(0));
		roundMainPrizeWinners[roundNum_] = roundMainPrizeWinner_;
		roundTimeoutTimesToWithdrawPrizes[roundNum_] = block.timestamp + timeoutDurationToWithdrawPrizes;
	}

	// #endregion
	// #region `depositEth`

	function depositEth(uint256 roundNum_, address winner_) external payable override onlyGame {
		// Given that only `CosmicGame` is permitted to call us, this validation can't fail. So I have replaced it with an `assert`.
		// require(winner_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		// #enable_asserts assert(winner_ != address(0));

		// // Comment-202409215 applies.
		// require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("No ETH has been sent."));

		CosmicGameConstants.BalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(winner_)];

		// [Comment-202411252]
		// Even if this winner already has a nonzero balance from a past bidding round,
		// we will forget and overwrite that past bidding round number.
		// [/Comment-202411252]
		ethBalanceInfoReference_.roundNum = roundNum_;

		ethBalanceInfoReference_.amount += msg.value;
		// emit EthReceived(winner_, msg.value);
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth() external override /*nonReentrant*/ {
		CosmicGameConstants.BalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(msg.sender)];
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;

		// // Comment-202409215 applies.
		// require(ethBalanceAmountCopy_ > 0, CosmicGameErrors.ZeroBalance("Your balance is zero."));

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(msg.sender, msg.sender, ethBalanceAmountCopy_);
		(bool isSuccess, ) = msg.sender.call{value: ethBalanceAmountCopy_}("");
		require(isSuccess, CosmicGameErrors.FundTransferFailed("ETH withdrawal failed.", msg.sender, ethBalanceAmountCopy_));
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth(address winner_) external override /*nonReentrant*/ {
		CosmicGameConstants.BalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(winner_)];
		uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[ethBalanceInfoReference_.roundNum];
		require(
			block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
			// todo-1 Do we need a better custom error?
			CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", roundTimeoutTimeToWithdrawPrizes_, block.timestamp)
		);
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;

		// // Comment-202409215 applies.
		// require(ethBalanceAmountCopy_ > 0, CosmicGameErrors.ZeroBalance("The balance is zero."));

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(winner_, msg.sender, ethBalanceAmountCopy_);
		(bool isSuccess, ) = msg.sender.call{value: ethBalanceAmountCopy_}("");
		require(isSuccess, CosmicGameErrors.FundTransferFailed("ETH withdrawal failed.", msg.sender, ethBalanceAmountCopy_));
	}

	// #endregion
	// #region `getEthBalanceInfo`

	function getEthBalanceInfo() external view override returns(CosmicGameConstants.BalanceInfo memory) {
		return _ethBalancesInfo[uint160(msg.sender)];
	}

	// #endregion
	// #region `getEthBalanceInfo`

	function getEthBalanceInfo(address winner_) external view override returns(CosmicGameConstants.BalanceInfo memory) {
		return _ethBalancesInfo[uint160(winner_)];
	}

	// #endregion
	// #region `donateNft`

	function donateNft(uint256 roundNum_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ {
		require(address(nftAddress_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		uint256 numDonatedNftsCopy_ = numDonatedNfts;
		CosmicGameConstants.DonatedNft storage newDonatedNftReference_ = donatedNfts[numDonatedNftsCopy_];
		newDonatedNftReference_.roundNum = roundNum_;
		newDonatedNftReference_.nftAddress = nftAddress_;
		newDonatedNftReference_.nftId = nftId_;
		emit NftDonated(roundNum_, msg.sender, nftAddress_, nftId_, numDonatedNftsCopy_);
		++ numDonatedNftsCopy_;
		numDonatedNfts = numDonatedNftsCopy_;
		nftAddress_.safeTransferFrom(msg.sender, address(this), nftId_);
	}

	// #endregion
	// #region `claimDonatedNft`

	function claimDonatedNft(uint256 index_) public override /*nonReentrant*/ {
		CosmicGameConstants.DonatedNft storage donatedNftReference_ = donatedNfts[index_];
		CosmicGameConstants.DonatedNft memory donatedNftCopy_ = donatedNftReference_;

		if (address(donatedNftCopy_.nftAddress) == address(0)) {
			if (index_ >= numDonatedNfts) {
				revert CosmicGameErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", index_);
			} else {
				revert CosmicGameErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", index_);
			}
		} else {
			// There is no chance that we need to throw `CosmicGameErrors.InvalidDonatedNftIndex`.
			// #enable_asserts assert(index_ < numDonatedNfts);
		}

		// Nothing will be broken if the `roundMainPrizeWinners` item is still zero.
		// In that case, the `roundTimeoutTimesToWithdrawPrizes` item will also be zero.
		if (msg.sender != roundMainPrizeWinners[donatedNftCopy_.roundNum]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[donatedNftCopy_.roundNum];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicGameErrors.NonExistentWinner("Only bidding round main prize winner is permitted to claim this NFT.", index_)
			);
		}

		delete donatedNftReference_.roundNum;
		delete donatedNftReference_.nftAddress;
		delete donatedNftReference_.nftId;
		emit DonatedNftClaimed(donatedNftCopy_.roundNum, msg.sender, donatedNftCopy_.nftAddress, donatedNftCopy_.nftId, index_);
		// todo-1 Sometimes we use "safe" function and sometimes we don't. Review all NFT and ERC20 calls.
		donatedNftCopy_.nftAddress.safeTransferFrom(address(this), msg.sender, donatedNftCopy_.nftId);
	}

	// #endregion
	// #region `claimManyDonatedNfts`

	function claimManyDonatedNfts(uint256[] calldata indices_) external override /*nonReentrant*/ {
		for ( uint256 indexIndex_ = 0; indexIndex_ < indices_.length; ++ indexIndex_ ) {
			claimDonatedNft(indices_[indexIndex_]);
		}
	}

	// #endregion
}

// #endregion
