// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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

	/// @notice For each bidding round number, contains the main prize winner address.
	/// ToDo-202411257-1 relates.
	address[1 << 64] public roundMainPrizeWinnerAddresses;

	/// @notice If a prize winner doesn't withdraw their prize within this timeout, anybody will be welcomed to withdraw it.
	/// This timeout applies to all kinds of prizes, including ETH.
	/// See also: `CosmicSignatureGameStorage.timeoutDurationToClaimMainPrize`.
	/// Comment-202411064 applies.
	uint256 public timeoutDurationToWithdrawPrizes = CosmicGameConstants.DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES;

	/// @notice For each bidding round number, contains a timeout time
	/// starting at which anybody will be welcomed to withdraw any unclaimed prizes won in that bidding round.
	/// If an item equals zero the timeout is considered not expired yet.
	uint256[1 << 64] public roundTimeoutTimesToWithdrawPrizes;

	/// @notice For each prize winner address, contains a `CosmicGameConstants.BalanceInfo`.
	/// @dev Comment-202411252 relates.
	/// Comment-202410274 applies.
	CosmicGameConstants.BalanceInfo[1 << 160] private _ethBalancesInfo;

	/// @notice Contains info about ERC-20 token donations.
	CosmicGameConstants.DonatedToken[(1 << 64) * (1 << 160)] public donatedTokens;

	/// @notice This includes deleted items.
	uint256 public numDonatedNfts = 0;

	/// @notice Contains info about NFT donations.
	CosmicGameConstants.DonatedNft[1 << 64] public donatedNfts;

	// #endregion
	// #region `onlyGame`

	/// @dev Comment-202411253 applies.
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

	/// @notice Implements `IERC721Receiver`.
	/// @dev
	/// [ToDo-202411268-1]
	/// Review all:
	/// onERC721Received|IERC721Receiver|safeTransfer(From)?
	/// Only `PrizesWallet` needs this, right? Or it doesn't? What about some testing contracts?
	/// But even `PrizesWallet` doesn't need this because it won't make the NFT claimable.
	/// The front end should tell the user to make sure it can receive an NFT.
	/// ToDo-202411267-1 relates.
	/// [/ToDo-202411268-1]
	function onERC721Received(address, address, uint256, bytes calldata) external pure override returns(bytes4) {
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

	function registerRoundEnd(uint256 roundNum_, address roundMainPrizeWinnerAddress_) external override onlyGame {
		// #enable_asserts assert(roundMainPrizeWinnerAddresses[roundNum_] == address(0));
		// #enable_asserts assert(roundNum_ == 0 || roundMainPrizeWinnerAddresses[roundNum_ - 1] != address(0));
		// #enable_asserts assert(roundTimeoutTimesToWithdrawPrizes[roundNum_] == 0);
		// #enable_asserts assert(roundNum_ == 0 || roundTimeoutTimesToWithdrawPrizes[roundNum_ - 1] != 0);
		// #enable_asserts assert(roundMainPrizeWinnerAddress_ != address(0));
		roundMainPrizeWinnerAddresses[roundNum_] = roundMainPrizeWinnerAddress_;
		roundTimeoutTimesToWithdrawPrizes[roundNum_] = block.timestamp + timeoutDurationToWithdrawPrizes;
	}

	// #endregion
	// #region `withdrawEverything`

	function withdrawEverything(
		bool withdrawEth_,
		CosmicGameConstants.DonatedTokenToClaim[] calldata donatedTokensToClaim_,
		uint256[] calldata donatedNftIndices_
	) external override /*nonReentrant*/ {
		if (withdrawEth_) {
			withdrawEth();
		}
		claimManyDonatedTokens(donatedTokensToClaim_);
		claimManyDonatedNfts(donatedNftIndices_);
	}

	// #endregion
	// #region `depositEth`

	function depositEth(uint256 roundNum_, address roundPrizeWinnerAddress_) external payable override onlyGame {
		// Given that only `CosmicGame` is permitted to call us, this validation can't fail. So I have replaced it with an `assert`.
		// require(roundPrizeWinnerAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		// #enable_asserts assert(roundPrizeWinnerAddress_ != address(0));

		// // Comment-202409215 applies.
		// require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("No ETH has been sent."));

		CosmicGameConstants.BalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(roundPrizeWinnerAddress_)];

		// [Comment-202411252]
		// Even if this winner already has a nonzero balance from a past bidding round,
		// we will forget and overwrite that past bidding round number.
		// [/Comment-202411252]
		ethBalanceInfoReference_.roundNum = roundNum_;

		ethBalanceInfoReference_.amount += msg.value;
		emit EthReceived(roundNum_, roundPrizeWinnerAddress_, msg.value);
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth() public override /*nonReentrant*/ {
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

	function withdrawEth(address roundPrizeWinnerAddress_) external override /*nonReentrant*/ {
		CosmicGameConstants.BalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(roundPrizeWinnerAddress_)];
		uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[ethBalanceInfoReference_.roundNum];
		require(
			block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
			CosmicGameErrors.EarlyWithdrawal("Not enough time has elapsed.", roundTimeoutTimeToWithdrawPrizes_, block.timestamp)
		);
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;

		// // Comment-202409215 applies.
		// require(ethBalanceAmountCopy_ > 0, CosmicGameErrors.ZeroBalance("The balance is zero."));

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(roundPrizeWinnerAddress_, msg.sender, ethBalanceAmountCopy_);
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

	function getEthBalanceInfo(address roundPrizeWinnerAddress_) external view override returns(CosmicGameConstants.BalanceInfo memory) {
		return _ethBalancesInfo[uint160(roundPrizeWinnerAddress_)];
	}

	// #endregion
	// #region `donateToken`

	function donateToken(uint256 roundNum_, address donorAddress_, IERC20 tokenAddress_, uint256 amount_) external override /*nonReentrant*/ onlyGame {
		require(address(tokenAddress_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));

		// Comment-202409215 applies to validating that `amount_` is a nonzero.
		// But the front end should prohibit zero donations and hide any zero donations from other users.
		// todo-1 Tell Nick about the above.

		uint256 newDonatedTokenIndex_ = _calculateDonatedTokenIndex(roundNum_, tokenAddress_);
		CosmicGameConstants.DonatedToken storage newDonatedTokenReference_ = donatedTokens[newDonatedTokenIndex_];
		newDonatedTokenReference_.amount += amount_;
		emit TokenDonated(roundNum_, /*msg.sender*/ donorAddress_, tokenAddress_, amount_);
		bool isSuccess = tokenAddress_.transferFrom(/*msg.sender*/ donorAddress_, address(this), amount_);
		require(isSuccess, CosmicGameErrors.ERC20TransferFailed("Transfer failed.", address(this), amount_));
	}

	// #endregion
	// #region `claimDonatedToken`

	function claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_) public override /*nonReentrant*/ {
		// According to Comment-202411283, we must validate `roundNum_` here.
		// But array bounds check near Comment-202411287 will implicitly validate it.
		//
		// Comment-202409215 applies to validating that `tokenAddress_` is a nonzero.

		// [Comment-202411286]
		// Nothing will be broken if the `roundMainPrizeWinnerAddresses` item is still zero.
		// In that case, the `roundTimeoutTimesToWithdrawPrizes` item will also be zero.
		// [/Comment-202411286]
		// [Comment-202411287/]
		if (msg.sender != roundMainPrizeWinnerAddresses[roundNum_]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[roundNum_];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicGameErrors.DonatedTokenClaimDenied("Only the bidding round main prize winner is permitted to claim this ERC-20 token donation.", roundNum_, msg.sender, tokenAddress_)
			);
		}

		uint256 donatedTokenIndex_ = _calculateDonatedTokenIndex(roundNum_, tokenAddress_);
		CosmicGameConstants.DonatedToken storage donatedTokenReference_ = donatedTokens[donatedTokenIndex_];
		CosmicGameConstants.DonatedToken memory donatedTokenCopy_ = donatedTokenReference_;

		// Comment-202409215 applies to validating that `donatedTokenCopy_.amount` is a nonzero.

		delete donatedTokenReference_.amount;
		emit DonatedTokenClaimed(roundNum_, msg.sender, tokenAddress_, donatedTokenCopy_.amount);
		bool isSuccess = tokenAddress_.transfer(msg.sender, donatedTokenCopy_.amount);
		require(isSuccess, CosmicGameErrors.ERC20TransferFailed("Transfer failed.", msg.sender, donatedTokenCopy_.amount));
	}

	// #endregion
	// #region `claimManyDonatedTokens`

	function claimManyDonatedTokens(CosmicGameConstants.DonatedTokenToClaim[] calldata donatedTokensToClaim_) public override /*nonReentrant*/ {
		for ( uint256 donatedTokenToClaimIndex_ = 0; donatedTokenToClaimIndex_ < donatedTokensToClaim_.length; ++ donatedTokenToClaimIndex_ ) {
			claimDonatedToken(donatedTokensToClaim_[donatedTokenToClaimIndex_].roundNum, donatedTokensToClaim_[donatedTokenToClaimIndex_].tokenAddress);
		}
	}

	// #endregion
	// #region `getDonatedTokenAmount`

	function getDonatedTokenAmount(uint256 roundNum_, IERC20 tokenAddress_) external view override returns(uint256) {
		uint256 donatedTokenIndex_ = _calculateDonatedTokenIndex(roundNum_, tokenAddress_);
		return donatedTokens[donatedTokenIndex_].amount;
	}

	// #endregion
	// #region `_calculateDonatedTokenIndex`

	function _calculateDonatedTokenIndex(uint256 roundNum_, IERC20 tokenAddress_) private pure returns(uint256) {
		// Comment-202409215 applies.
		// [Comment-202411283]
		// But in some cases the caller must validate this.
		// [/Comment-202411283]
		// #enable_asserts assert(roundNum_ < (1 << 64));

		return roundNum_ | (uint256(uint160(address(tokenAddress_))) << 64);
	}

	// #endregion
	// #region `donateNft`

	function donateNft(uint256 roundNum_, address donorAddress_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ onlyGame {
		require(address(nftAddress_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		uint256 numDonatedNftsCopy_ = numDonatedNfts;
		CosmicGameConstants.DonatedNft storage newDonatedNftReference_ = donatedNfts[numDonatedNftsCopy_];
		newDonatedNftReference_.roundNum = roundNum_;
		newDonatedNftReference_.nftAddress = nftAddress_;
		newDonatedNftReference_.nftId = nftId_;
		emit NftDonated(roundNum_, /*msg.sender*/ donorAddress_, nftAddress_, nftId_, numDonatedNftsCopy_);
		++ numDonatedNftsCopy_;
		numDonatedNfts = numDonatedNftsCopy_;
		// [ToDo-202411267-1]
		// Sometimes we use "safe" function and sometimes we don't. Review all NFT and ERC20 calls.
		// It's unnecessary for this particular transfer to be "safe".
		// ToDo-202411268-1 relates.
		// [/ToDo-202411267-1]
		nftAddress_.safeTransferFrom(/*msg.sender*/ donorAddress_, address(this), nftId_);
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

		// Comment-202411286 applies.
		if (msg.sender != roundMainPrizeWinnerAddresses[donatedNftCopy_.roundNum]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[donatedNftCopy_.roundNum];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicGameErrors.DonatedNftClaimDenied("Only the bidding round main prize winner is permitted to claim this NFT.", msg.sender, index_)
			);
		}

		delete donatedNftReference_.roundNum;
		delete donatedNftReference_.nftAddress;
		delete donatedNftReference_.nftId;
		emit DonatedNftClaimed(donatedNftCopy_.roundNum, msg.sender, donatedNftCopy_.nftAddress, donatedNftCopy_.nftId, index_);
		// ToDo-202411267-1 applies.
		// todo-1 Maybe we should validate NFT receiver off-chain. Although maybe that's unnecessary too.
		// todo-1 But at least warn the user to make sure that they can receive an NFT.
		// todo-1 Is there a similar method that accepts only the destination address?
		donatedNftCopy_.nftAddress.safeTransferFrom(address(this), msg.sender, donatedNftCopy_.nftId);
	}

	// #endregion
	// #region `claimManyDonatedNfts`

	function claimManyDonatedNfts(uint256[] calldata indices_) public override /*nonReentrant*/ {
		for ( uint256 indexIndex_ = 0; indexIndex_ < indices_.length; ++ indexIndex_ ) {
			claimDonatedNft(indices_[indexIndex_]);
		}
	}

	// #endregion
}

// #endregion
