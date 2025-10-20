// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { DonatedTokenHolder } from "./DonatedTokenHolder.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";

// #endregion
// #region

contract PrizesWallet is ReentrancyGuardTransient, Ownable, AddressValidator, IPrizesWallet {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	/// @notice For each bidding round number, contains the main prize beneficiary address.
	/// Comment-202411254 applies.
	address[1 << 64] public mainPrizeBeneficiaryAddresses;

	/// @notice If a prize winner doesn't withdraw their prize within this timeout, anybody will be welcomed to withdraw it.
	/// This timeout applies to all kinds of prizes, including ETH.
	/// Comment-202411064 applies.
	/// [Comment-202506139]
	/// This should be pretty long -- to increase the chance that people will have enough time, even if an asteroid hits the Earth.
	/// [/Comment-202506139]
	/// See also: `CosmicSignatureGameStorage.timeoutDurationToClaimMainPrize`.
	uint256 public timeoutDurationToWithdrawPrizes = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES;

	/// @notice For each bidding round number, contains a timeout time
	/// starting at which anybody will be welcomed to withdraw any unclaimed prizes won in that bidding round.
	/// If an item equals zero the timeout is considered not expired yet.
	uint256[1 << 64] public roundTimeoutTimesToWithdrawPrizes;

	/// @notice For each bidding round number and prize winner address, contains not yet withdrawn ETH balance amount.
	uint256[1 << 160][1 << 64] private _ethBalanceAmounts;

	/// @notice Details about ERC-20 token donations made to the Game.
	/// Contains 1 item for each bidding round number.
	DonatedToken[1 << 64] public donatedTokens;

	uint256 public nextDonatedNftIndex = 0;

	/// @notice Contains info about NFT donations.
	/// Contains zero or more items for each bidding round.
	DonatedNft[1 << 64] public donatedNfts;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	constructor(address game_)
		_providedAddressIsNonZero(game_)
		Ownable(_msgSender()) {
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
	// #region `setTimeoutDurationToWithdrawPrizes`

	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external override onlyOwner {
		timeoutDurationToWithdrawPrizes = newValue_;
		emit TimeoutDurationToWithdrawPrizesChanged(newValue_);
	}

	// #endregion
	// #region `registerRoundEndAndDepositEthMany`

	function registerRoundEndAndDepositEthMany(uint256 roundNum_, address mainPrizeBeneficiaryAddress_, EthDeposit[] calldata ethDeposits_) external payable override nonReentrant _onlyGame returns (uint256) {
		uint256 roundTimeoutTimeToWithdrawPrizes_ = _registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
		// #enable_asserts uint256 ethDepositAmountSum_ = 0;
		for (uint256 ethDepositIndex_ = ethDeposits_.length; ethDepositIndex_ > 0; ) {
			-- ethDepositIndex_;
			EthDeposit calldata ethDepositReference_ = ethDeposits_[ethDepositIndex_];
			// #enable_asserts ethDepositAmountSum_ += ethDepositReference_.amount;
			_depositEth(roundNum_, ethDepositIndex_, ethDepositReference_.prizeWinnerAddress, ethDepositReference_.amount);
		}
		// #enable_asserts assert(ethDepositAmountSum_ == msg.value);
		return roundTimeoutTimeToWithdrawPrizes_;
	}

	// #endregion
	// #region `registerRoundEnd`

	function registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) external override nonReentrant _onlyGame returns (uint256) {
		uint256 roundTimeoutTimeToWithdrawPrizes_ = _registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
		return roundTimeoutTimeToWithdrawPrizes_;
	}

	// #endregion
	// #region `_registerRoundEnd`

	function _registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) private returns (uint256) {
		// [ToDo-202507148-1]
		// Should I make at least one of these (maybe the 1st one) a `require`,
		// so that a potentially malicious upgraded Game contract could not rewrite history.
		// But then all `_onlyGame` methods in all our contracts will have to be reviewed and possibly uglified.
		// [/ToDo-202507148-1]
		// #enable_asserts assert(mainPrizeBeneficiaryAddresses[roundNum_] == address(0));
		// #enable_asserts assert(roundNum_ == 0 || mainPrizeBeneficiaryAddresses[roundNum_ - 1] != address(0));
		// #enable_asserts assert(roundTimeoutTimesToWithdrawPrizes[roundNum_] == 0);
		// #enable_asserts assert(roundNum_ == 0 || roundTimeoutTimesToWithdrawPrizes[roundNum_ - 1] != 0);
		// #enable_asserts assert(mainPrizeBeneficiaryAddress_ != address(0));
		mainPrizeBeneficiaryAddresses[roundNum_] = mainPrizeBeneficiaryAddress_;
		uint256 roundTimeoutTimeToWithdrawPrizes_ = block.timestamp + timeoutDurationToWithdrawPrizes;
		roundTimeoutTimesToWithdrawPrizes[roundNum_] = roundTimeoutTimeToWithdrawPrizes_;
		return roundTimeoutTimeToWithdrawPrizes_;
	}

	// #endregion
	// #region `withdrawEverything`

	function withdrawEverything(
		uint256[] calldata ethPrizeRoundNums_,
		DonatedTokenToClaim[] calldata donatedTokensToClaim_,
		uint256[] calldata donatedNftIndexes_
	) external override nonReentrant {
		_withdrawEthMany(ethPrizeRoundNums_);
		_claimManyDonatedTokens(donatedTokensToClaim_);
		_claimManyDonatedNfts(donatedNftIndexes_);
	}

	// #endregion
	// #region `depositEth`

	function depositEth(uint256 roundNum_, uint256 prizeWinnerIndex_, address prizeWinnerAddress_) external payable override nonReentrant _onlyGame {
		_depositEth(roundNum_, prizeWinnerIndex_, prizeWinnerAddress_, msg.value);
	}

	// #endregion
	// #region `_depositEth`

	function _depositEth(uint256 roundNum_, uint256 prizeWinnerIndex_, address prizeWinnerAddress_, uint256 amount_) private {
		// #enable_asserts assert(prizeWinnerAddress_ != address(0));

		// This cannot overflow because ETH total supply is limited.
		_ethBalanceAmounts[roundNum_][uint256(uint160(prizeWinnerAddress_))] += amount_;

		emit EthReceived(roundNum_, prizeWinnerIndex_, prizeWinnerAddress_, amount_);
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth(uint256 roundNum_) external override nonReentrant {
		_withdrawEth(roundNum_, _msgSender());
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth(uint256 roundNum_, address prizeWinnerAddress_) external override nonReentrant {
		uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[roundNum_];
		require(
			block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
			CosmicSignatureErrors.EthWithdrawalDenied(
				"Only the ETH prize winner is permitted to withdraw the prize before a timeout expires.",
				roundNum_,
				prizeWinnerAddress_,
				_msgSender(),
				roundTimeoutTimeToWithdrawPrizes_,
				block.timestamp
			)
		);
		_withdrawEth(roundNum_, prizeWinnerAddress_);
	}

	// #endregion
	// #region `_withdrawEth`

	function _withdrawEth(uint256 roundNum_, address prizeWinnerAddress_) private {
		// It's OK if this is zero.
		uint256 ethBalanceAmountToWithdraw_ = _prepareWithdrawEth(roundNum_, prizeWinnerAddress_);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountToWithdraw_}("");

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountToWithdraw_);
		}
	}

	// #endregion
	// #region `withdrawEthMany`

	function withdrawEthMany(uint256[] calldata roundNums_) external override nonReentrant {
		_withdrawEthMany(roundNums_);
	}

	// #endregion
	// #region `_withdrawEthMany`

	function _withdrawEthMany(uint256[] calldata roundNums_) private {
		uint256 roundNumIndex_ = roundNums_.length;
		if (roundNumIndex_ <= 0) {
			return;
		}

		// It's OK if this is zero.
		uint256 ethBalanceAmountToWithdraw_ = 0;
		
		do {
			-- roundNumIndex_;

			// This cannot overflow because ETH total supply is limited.
			ethBalanceAmountToWithdraw_ += _prepareWithdrawEth(roundNums_[roundNumIndex_], _msgSender());
		} while (roundNumIndex_ > 0);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountToWithdraw_}("");

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountToWithdraw_);
		}
	}

	// #endregion
	// #region `_prepareWithdrawEth`

	/// @return ETH amount to transfer to the caller.
	function _prepareWithdrawEth(uint256 roundNum_, address prizeWinnerAddress_) private returns (uint256) {
		// It's OK if this is zero.
		uint256 ethBalanceAmountCopy_ = _ethBalanceAmounts[roundNum_][uint256(uint160(prizeWinnerAddress_))];

		delete _ethBalanceAmounts[roundNum_][uint256(uint160(prizeWinnerAddress_))];
		emit EthWithdrawn(roundNum_, prizeWinnerAddress_, _msgSender(), ethBalanceAmountCopy_);
		return ethBalanceAmountCopy_;
	}

	// #endregion
	// #region `getEthBalanceAmount`

	function getEthBalanceAmount(uint256 roundNum_) external view override returns (uint256) {
		return _ethBalanceAmounts[roundNum_][uint256(uint160(_msgSender()))];
	}

	// #endregion
	// #region `getEthBalanceAmount`

	function getEthBalanceAmount(uint256 roundNum_, address prizeWinnerAddress_) external view override returns (uint256) {
		return _ethBalanceAmounts[roundNum_][uint256(uint160(prizeWinnerAddress_))];
	}

	// #endregion
	// #region `donateToken`

	function donateToken(uint256 roundNum_, address donorAddress_, IERC20 tokenAddress_, uint256 amount_) external override
		nonReentrant
		_onlyGame {
		// #enable_asserts assert(donorAddress_ != address(0));
		DonatedToken storage newDonatedTokenReference_ = donatedTokens[roundNum_];
		DonatedToken memory newDonatedTokenCopy_ = newDonatedTokenReference_;
		if (address(newDonatedTokenCopy_.holder) == address(0)) {
			newDonatedTokenCopy_.holder = new DonatedTokenHolder(tokenAddress_);
			newDonatedTokenReference_.holder = newDonatedTokenCopy_.holder;
		} else {
			// This is unnecessary if this particular token was already donated in the current bidding round, but keeping it simple.
			newDonatedTokenCopy_.holder.authorizeDeployerAsMyTokenSpender(tokenAddress_);
		}
		emit TokenDonated(roundNum_, donorAddress_, tokenAddress_, amount_);

		// Comment-202502242 applies.
		SafeERC20.safeTransferFrom(tokenAddress_, donorAddress_, address(newDonatedTokenCopy_.holder), amount_);
	}

	// #endregion
	// #region `claimDonatedToken`

	function claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_, uint256 amount_) external override nonReentrant {
		_claimDonatedToken(roundNum_, tokenAddress_, amount_);
	}

	// #endregion
	// #region `_claimDonatedToken`

	function _claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_, uint256 amount_) private {
		// [Comment-202411286]
		// This logic will work even if the `mainPrizeBeneficiaryAddresses` item is still zero.
		// In that case, the `roundTimeoutTimesToWithdrawPrizes` item would also be zero,
		// which would cause the transaction reversal.
		// [/Comment-202411286]
		if (_msgSender() != mainPrizeBeneficiaryAddresses[roundNum_]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[roundNum_];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicSignatureErrors.DonatedTokenClaimDenied(
					"Only the bidding round main prize beneficiary is permitted to claim this ERC-20 token donation before a timeout expires.",
					roundNum_,
					_msgSender(),
					tokenAddress_,
					roundTimeoutTimeToWithdrawPrizes_,
					block.timestamp
				)
			);
		}

		DonatedToken storage donatedTokenReference_ = donatedTokens[roundNum_];

		// [Comment-202507151]
		// It's probably not too bad if `donatedTokenCopy_.holder` is zero.
		// The transaction would likely revert, but it's up to the `tokenAddress_` contract.
		// One reason for it to revert is that the zero address has not authorized us to spend its tokens.
		// [/Comment-202507151]
		DonatedToken memory donatedTokenCopy_ = donatedTokenReference_;

		if (amount_ == 0) {
			// According to Comment-202507143, this can potentially be zero.
			// Comment-202502242 applies.
			// Comment-202507151 applies.
			amount_ = tokenAddress_.balanceOf(address(donatedTokenCopy_.holder));
		}
		emit DonatedTokenClaimed(roundNum_, _msgSender(), tokenAddress_, amount_);

		// Comment-202502242 applies.
		// Comment-202507151 applies.
		SafeERC20.safeTransferFrom(tokenAddress_, address(donatedTokenCopy_.holder), _msgSender(), amount_);
	}

	// #endregion
	// #region `claimManyDonatedTokens`

	function claimManyDonatedTokens(DonatedTokenToClaim[] calldata donatedTokensToClaim_) external override nonReentrant {
		_claimManyDonatedTokens(donatedTokensToClaim_);
	}

	// #endregion
	// #region `_claimManyDonatedTokens`

	function _claimManyDonatedTokens(DonatedTokenToClaim[] calldata donatedTokensToClaim_) private {
		for (uint256 donatedTokenToClaimIndex_ = donatedTokensToClaim_.length; donatedTokenToClaimIndex_ > 0; ) {
			-- donatedTokenToClaimIndex_;
			DonatedTokenToClaim calldata donatedTokenToClaimReference_ = donatedTokensToClaim_[donatedTokenToClaimIndex_];
			_claimDonatedToken(donatedTokenToClaimReference_.roundNum, donatedTokenToClaimReference_.tokenAddress, donatedTokenToClaimReference_.amount);
		}
	}

	// #endregion
	// #region `getDonatedTokenBalanceAmount`

	function getDonatedTokenBalanceAmount(uint256 roundNum_, IERC20 tokenAddress_) external view override /*nonReentrant*/ returns (uint256) {
		DonatedToken storage donatedTokenReference_ = donatedTokens[roundNum_];
		DonatedToken memory donatedTokenCopy_ = donatedTokenReference_;
		return
			(address(donatedTokenCopy_.holder) == address(0)) ?
			0 :

			// Comment-202502242 applies.
			tokenAddress_.balanceOf(address(donatedTokenCopy_.holder));
	}

	// #endregion
	// #region `donateNft`

	function donateNft(uint256 roundNum_, address donorAddress_, IERC721 nftAddress_, uint256 nftId_) external override
		nonReentrant
		_onlyGame {
		// #enable_asserts assert(donorAddress_ != address(0));
		uint256 nextDonatedNftIndexCopy_ = nextDonatedNftIndex;
		DonatedNft storage newDonatedNftReference_ = donatedNfts[nextDonatedNftIndexCopy_];
		newDonatedNftReference_.roundNum = roundNum_;
		newDonatedNftReference_.nftAddress = nftAddress_;
		newDonatedNftReference_.nftId = nftId_;
		emit NftDonated(roundNum_, donorAddress_, nftAddress_, nftId_, nextDonatedNftIndexCopy_);
		++ nextDonatedNftIndexCopy_;
		nextDonatedNftIndex = nextDonatedNftIndexCopy_;

		// [Comment-202502245]
		// This would revert if `nftAddress_` is zero or there is no ERC-721-compatible contract there.
		// [/Comment-202502245]
		nftAddress_.transferFrom(donorAddress_, address(this), nftId_);
	}

	// #endregion
	// #region `claimDonatedNft`

	function claimDonatedNft(uint256 index_) external override nonReentrant {
		_claimDonatedNft(index_);
	}

	// #endregion
	// #region `_claimDonatedNft`

	function _claimDonatedNft(uint256 index_) private {
		DonatedNft storage donatedNftReference_ = donatedNfts[index_];
		DonatedNft memory donatedNftCopy_ = donatedNftReference_;
		if (address(donatedNftCopy_.nftAddress) == address(0)) {
			if (index_ >= nextDonatedNftIndex) {
				revert CosmicSignatureErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", _msgSender(), index_);
			}
			revert CosmicSignatureErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", _msgSender(), index_);
		}

		// Comment-202411286 applies.
		if (_msgSender() != mainPrizeBeneficiaryAddresses[donatedNftCopy_.roundNum]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[donatedNftCopy_.roundNum];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicSignatureErrors.DonatedNftClaimDenied(
					"Only the bidding round main prize beneficiary is permitted to claim this NFT before a timeout expires.",
					_msgSender(),
					index_,
					roundTimeoutTimeToWithdrawPrizes_,
					block.timestamp
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

	function claimManyDonatedNfts(uint256[] calldata indexes_) external override nonReentrant {
		_claimManyDonatedNfts(indexes_);
	}

	// #endregion
	// #region `_claimManyDonatedNfts`

	function _claimManyDonatedNfts(uint256[] calldata indexes_) private {
		for (uint256 indexIndex_ = indexes_.length; indexIndex_ > 0; ) {
			-- indexIndex_;
			_claimDonatedNft(indexes_[indexIndex_]);
		}
	}

	// #endregion
}

// #endregion
