// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";

// #endregion
// #region

contract PrizesWallet is Ownable, AddressValidator, IPrizesWallet {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	/// @notice For each bidding round number, contains the main prize beneficiary address.
	/// Comment-202411254 applies.
	address[1 << 64] public mainPrizeBeneficiaryAddresses;

	/// @notice If a prize winner doesn't withdraw their prize within this timeout, anybody will be welcomed to withdraw it.
	/// This timeout applies to all kinds of prizes, including ETH.
	/// See also: `CosmicSignatureGameStorage.timeoutDurationToClaimMainPrize`.
	/// Comment-202411064 applies.
	uint256 public timeoutDurationToWithdrawPrizes = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES;

	/// @notice For each bidding round number, contains a timeout time
	/// starting at which anybody will be welcomed to withdraw any unclaimed prizes won in that bidding round.
	/// If an item equals zero the timeout is considered not expired yet.
	uint256[1 << 64] public roundTimeoutTimesToWithdrawPrizes;

	/// @notice For each prize winner address, contains an `EthBalanceInfo`.
	/// @dev Comment-202411252 relates.
	/// Comment-202410274 applies.
	EthBalanceInfo[1 << 160] private _ethBalancesInfo;

	/// @notice Contains info about ERC-20 token donations.
	DonatedToken[(1 << 64) * (1 << 160)] public donatedTokens;

	/// @notice This includes deleted items.
	uint256 public numDonatedNfts = 0;

	/// @notice Contains info about NFT donations.
	DonatedNft[1 << 64] public donatedNfts;

	// #endregion
	// #region `onlyGame`

	/// @dev Comment-202411253 applies.
	modifier onlyGame() {
		require(
			_msgSender() == game,
			CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender())
		);
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	constructor(address game_)
		Ownable(_msgSender())
		providedAddressIsNonZero(game_) {
		game = game_;
	}

	// #endregion
	// #region `setTimeoutDurationToWithdrawPrizes`

	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external override onlyOwner {
		timeoutDurationToWithdrawPrizes = newValue_;
		emit TimeoutDurationToWithdrawPrizesChanged(newValue_);
	}

	// #endregion
	// #region `registerRoundEndAndDepositEthMany`

	function registerRoundEndAndDepositEthMany(uint256 roundNum_, address mainPrizeBeneficiaryAddress_, EthDeposit[] calldata ethDeposits_) external payable override onlyGame {
		_registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
		// #enable_asserts uint256 amountSum_ = 0;
		for (uint256 ethDepositIndex_ = ethDeposits_.length; ethDepositIndex_ > 0; ) {
			-- ethDepositIndex_;
			EthDeposit calldata ethDepositReference_ = ethDeposits_[ethDepositIndex_];
			// #enable_asserts amountSum_ += ethDepositReference_.amount;
			_depositEth(roundNum_, ethDepositReference_.prizeWinnerAddress, ethDepositReference_.amount);
		}
		// #enable_asserts assert(amountSum_ == msg.value);
	}

	// #endregion
	// #region `registerRoundEnd`

	function registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) external override onlyGame {
		_registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
	}

	// #endregion
	// #region `_registerRoundEnd`

	function _registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) private {
		// #enable_asserts assert(mainPrizeBeneficiaryAddresses[roundNum_] == address(0));
		// #enable_asserts assert(roundNum_ == 0 || mainPrizeBeneficiaryAddresses[roundNum_ - 1] != address(0));
		// #enable_asserts assert(roundTimeoutTimesToWithdrawPrizes[roundNum_] == 0);
		// #enable_asserts assert(roundNum_ == 0 || roundTimeoutTimesToWithdrawPrizes[roundNum_ - 1] != 0);
		// #enable_asserts assert(mainPrizeBeneficiaryAddress_ != address(0));
		mainPrizeBeneficiaryAddresses[roundNum_] = mainPrizeBeneficiaryAddress_;
		roundTimeoutTimesToWithdrawPrizes[roundNum_] = block.timestamp + timeoutDurationToWithdrawPrizes;
	}

	// #endregion
	// #region `withdrawEverything`

	function withdrawEverything(
		bool withdrawEth_,
		DonatedTokenToClaim[] calldata donatedTokensToClaim_,
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

	function depositEth(uint256 roundNum_, address prizeWinnerAddress_) external payable override onlyGame {
		_depositEth(roundNum_, prizeWinnerAddress_, msg.value);
	}

	// #endregion
	// #region `_depositEth`

	function _depositEth(uint256 roundNum_, address prizeWinnerAddress_, uint256 amount_) private {
		// #enable_asserts assert(prizeWinnerAddress_ != address(0));
		EthBalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(prizeWinnerAddress_)];

		// [Comment-202411252]
		// Even if this address already has a nonzero balance from a past bidding round,
		// we will forget and overwrite that past bidding round number,
		// which will reinitialize the timeout to withdraw the cumulative balance.
		// [/Comment-202411252]
		ethBalanceInfoReference_.roundNum = roundNum_;

		ethBalanceInfoReference_.amount += amount_;
		emit EthReceived(roundNum_, prizeWinnerAddress_, amount_);
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth() public override /*nonReentrant*/ {
		EthBalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(_msgSender())];
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;

		// // Comment-202409215 applies.
		// require(ethBalanceAmountCopy_ > 0, CosmicSignatureErrors.ZeroBalance("Your balance amount is zero."));

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(_msgSender(), _msgSender(), ethBalanceAmountCopy_);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountCopy_}("");

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountCopy_);
		}
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth(address prizeWinnerAddress_) external override /*nonReentrant*/ {
		EthBalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(prizeWinnerAddress_)];
		uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[ethBalanceInfoReference_.roundNum];
		require(
			block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
			CosmicSignatureErrors.EarlyWithdrawal("Not enough time has elapsed.", roundTimeoutTimeToWithdrawPrizes_, block.timestamp)
		);
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;

		// // Comment-202409215 applies.
		// require(ethBalanceAmountCopy_ > 0, CosmicSignatureErrors.ZeroBalance("The balance amount is zero."));

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(prizeWinnerAddress_, _msgSender(), ethBalanceAmountCopy_);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountCopy_}("");

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountCopy_);
		}
	}

	// #endregion
	// #region `getEthBalanceInfo`

	function getEthBalanceInfo() external view override returns(EthBalanceInfo memory) {
		return _ethBalancesInfo[uint160(_msgSender())];
	}

	// #endregion
	// #region `getEthBalanceInfo`

	function getEthBalanceInfo(address prizeWinnerAddress_) external view override returns(EthBalanceInfo memory) {
		return _ethBalancesInfo[uint160(prizeWinnerAddress_)];
	}

	// #endregion
	// #region `donateToken`

	function donateToken(uint256 roundNum_, address donorAddress_, IERC20 tokenAddress_, uint256 amount_) external override
		// nonReentrant
		onlyGame
		providedAddressIsNonZero(address(tokenAddress_)) {
		// #enable_asserts assert(donorAddress_ != address(0));

		uint256 newDonatedTokenIndex_ = _calculateDonatedTokenIndex(roundNum_, tokenAddress_);
		DonatedToken storage newDonatedTokenReference_ = donatedTokens[newDonatedTokenIndex_];
		newDonatedTokenReference_.amount += amount_;
		emit TokenDonated(roundNum_, donorAddress_, tokenAddress_, amount_);
		SafeERC20.safeTransferFrom(tokenAddress_, donorAddress_, address(this), amount_);
	}

	// #endregion
	// #region `claimDonatedToken`

	function claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_) public override /*nonReentrant*/ {
		// According to Comment-202411283, we must validate `roundNum_` here.
		// But array bounds check near Comment-202411287 will implicitly validate it.
		//
		// Comment-202409215 applies to validating that `tokenAddress_` is a nonzero.

		// [Comment-202411286]
		// Nothing will be broken if the `mainPrizeBeneficiaryAddresses` item is still zero.
		// In that case, the `roundTimeoutTimesToWithdrawPrizes` item will also be zero.
		// [/Comment-202411286]
		// [Comment-202411287/]
		if (_msgSender() != mainPrizeBeneficiaryAddresses[roundNum_]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[roundNum_];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicSignatureErrors.DonatedTokenClaimDenied(
					"Only the bidding round main prize beneficiary is permitted to claim this ERC-20 token donation until a timeout expires.",
					roundNum_,
					_msgSender(),
					tokenAddress_
				)
			);
		}

		uint256 donatedTokenIndex_ = _calculateDonatedTokenIndex(roundNum_, tokenAddress_);
		DonatedToken storage donatedTokenReference_ = donatedTokens[donatedTokenIndex_];
		DonatedToken memory donatedTokenCopy_ = donatedTokenReference_;

		// Comment-202409215 applies to validating that `donatedTokenCopy_.amount` is a nonzero.

		delete donatedTokenReference_.amount;
		emit DonatedTokenClaimed(roundNum_, _msgSender(), tokenAddress_, donatedTokenCopy_.amount);
		SafeERC20.safeTransfer(tokenAddress_, _msgSender(), donatedTokenCopy_.amount);
	}

	// #endregion
	// #region `claimManyDonatedTokens`

	function claimManyDonatedTokens(DonatedTokenToClaim[] calldata donatedTokensToClaim_) public override /*nonReentrant*/ {
		for (uint256 donatedTokenToClaimIndex_ = donatedTokensToClaim_.length; donatedTokenToClaimIndex_ > 0; ) {
			-- donatedTokenToClaimIndex_;
			DonatedTokenToClaim calldata donatedTokenToClaimReference_ = donatedTokensToClaim_[donatedTokenToClaimIndex_];
			claimDonatedToken(donatedTokenToClaimReference_.roundNum, donatedTokenToClaimReference_.tokenAddress);
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

	function donateNft(uint256 roundNum_, address donorAddress_, IERC721 nftAddress_, uint256 nftId_) external override
		// nonReentrant
		onlyGame
		providedAddressIsNonZero(address(nftAddress_)) {
		// #enable_asserts assert(donorAddress_ != address(0));
		uint256 numDonatedNftsCopy_ = numDonatedNfts;
		DonatedNft storage newDonatedNftReference_ = donatedNfts[numDonatedNftsCopy_];
		newDonatedNftReference_.roundNum = roundNum_;
		newDonatedNftReference_.nftAddress = nftAddress_;
		newDonatedNftReference_.nftId = nftId_;
		emit NftDonated(roundNum_, donorAddress_, nftAddress_, nftId_, numDonatedNftsCopy_);
		++ numDonatedNftsCopy_;
		numDonatedNfts = numDonatedNftsCopy_;
		// todo-1 Develop a test when an authorized spender donetes someone's NFT.
		nftAddress_.transferFrom(/*donorAddress_*/ nftAddress_.ownerOf(nftId_), address(this), nftId_);
	}

	// #endregion
	// #region `claimDonatedNft`

	function claimDonatedNft(uint256 index_) public override /*nonReentrant*/ {
		DonatedNft storage donatedNftReference_ = donatedNfts[index_];
		DonatedNft memory donatedNftCopy_ = donatedNftReference_;

		if (address(donatedNftCopy_.nftAddress) == address(0)) {
			if (index_ >= numDonatedNfts) {
				revert CosmicSignatureErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", index_);
			} else {
				revert CosmicSignatureErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", index_);
			}
		} else {
			// There is no chance that we need to throw `CosmicSignatureErrors.InvalidDonatedNftIndex`.
			// #enable_asserts assert(index_ < numDonatedNfts);
		}

		// Comment-202411286 applies.
		if (_msgSender() != mainPrizeBeneficiaryAddresses[donatedNftCopy_.roundNum]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[donatedNftCopy_.roundNum];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicSignatureErrors.DonatedNftClaimDenied(
					"Only the bidding round main prize beneficiary is permitted to claim this NFT until a timeout expires.",
					_msgSender(),
					index_
				)
			);
		}

		delete donatedNftReference_.roundNum;
		delete donatedNftReference_.nftAddress;
		delete donatedNftReference_.nftId;
		emit DonatedNftClaimed(donatedNftCopy_.roundNum, _msgSender(), donatedNftCopy_.nftAddress, donatedNftCopy_.nftId, index_);
		donatedNftCopy_.nftAddress.transferFrom(address(this), _msgSender(), donatedNftCopy_.nftId);
	}

	// #endregion
	// #region `claimManyDonatedNfts`

	function claimManyDonatedNfts(uint256[] calldata indices_) public override /*nonReentrant*/ {
		for (uint256 indexIndex_ = indices_.length; indexIndex_ > 0; ) {
			-- indexIndex_;
			claimDonatedNft(indices_[indexIndex_]);
		}
	}

	// #endregion
}

// #endregion
