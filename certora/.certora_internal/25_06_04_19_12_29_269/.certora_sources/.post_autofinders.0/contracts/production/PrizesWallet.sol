// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

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
	/// Comment-202411064 applies.
	/// See also: `CosmicSignatureGameStorage.timeoutDurationToClaimMainPrize`.
	uint256 public timeoutDurationToWithdrawPrizes = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES;

	/// @notice For each bidding round number, contains a timeout time
	/// starting at which anybody will be welcomed to withdraw any unclaimed prizes won in that bidding round.
	/// If an item equals zero the timeout is considered not expired yet.
	uint256[1 << 64] public roundTimeoutTimesToWithdrawPrizes;

	/// @notice For each prize winner address, contains an `EthBalanceInfo`.
	/// @dev Comment-202411252 relates.
	EthBalanceInfo[1 << 160] private _ethBalancesInfo;

	/// @notice Contains info about ERC-20 token donations.
	/// Call `_getDonatedTokenIndex` to calculate item index.
	DonatedToken[(1 << 64) * (1 << 160)] private _donatedTokens;

	/// @notice This includes deleted items.
	uint256 public numDonatedNfts = 0;

	/// @notice Contains info about NFT donations.
	DonatedNft[1 << 64] public donatedNfts;

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
	function _checkOnlyGame() private view {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a80000, 1037618708904) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a80001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a80004, 0) }
		if (_msgSender() != game) {
			revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
		}
	}

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
	// #region `setTimeoutDurationToWithdrawPrizes`

	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external override onlyOwner {
		timeoutDurationToWithdrawPrizes = newValue_;
		emit TimeoutDurationToWithdrawPrizesChanged(newValue_);
	}

	// #endregion
	// #region `registerRoundEndAndDepositEthMany`

	function registerRoundEndAndDepositEthMany(uint256 roundNum_, address mainPrizeBeneficiaryAddress_, EthDeposit[] calldata ethDeposits_) external payable override _onlyGame {
		_registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
		// #enable_asserts uint256 amountSum_ = 0;
		for (uint256 ethDepositIndex_ = ethDeposits_.length; ethDepositIndex_ > 0; ) {
			-- ethDepositIndex_;
			EthDeposit calldata ethDepositReference_ = ethDeposits_[ethDepositIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0001011e,0)}
			// #enable_asserts amountSum_ += ethDepositReference_.amount;
			_depositEth(roundNum_, ethDepositReference_.prizeWinnerAddress, ethDepositReference_.amount);
		}
		// #enable_asserts assert(amountSum_ == msg.value);
	}

	// #endregion
	// #region `registerRoundEnd`

	function registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) external override _onlyGame {
		_registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
	}

	// #endregion
	// #region `_registerRoundEnd`

	function _registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) private {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a90000, 1037618708905) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a90001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a90005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a96001, mainPrizeBeneficiaryAddress_) }
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

	function depositEth(uint256 roundNum_, address prizeWinnerAddress_) external payable override _onlyGame {
		_depositEth(roundNum_, prizeWinnerAddress_, msg.value);
	}

	// #endregion
	// #region `_depositEth`

	function _depositEth(uint256 roundNum_, address prizeWinnerAddress_, uint256 amount_) private {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01aa0000, 1037618708906) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01aa0001, 3) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01aa0005, 73) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01aa6002, amount_) }
		// #enable_asserts assert(prizeWinnerAddress_ != address(0));
		EthBalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(prizeWinnerAddress_)];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010106,0)}

		// [Comment-202411252]
		// Even if this address already has a nonzero balance from a past bidding round,
		// we will forget and overwrite that past bidding round number,
		// which will reinitialize the timeout to withdraw the cumulative balance.
		// [/Comment-202411252]
		// #enable_asserts assert(roundNum_ >= ethBalanceInfoReference_.roundNum);
		ethBalanceInfoReference_.roundNum = roundNum_;uint256 certora_local280 = ethBalanceInfoReference_.roundNum;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000118,certora_local280)}

		// This will not overflow, given that this amount is in ETH.
		ethBalanceInfoReference_.amount += amount_;uint256 certora_local281 = ethBalanceInfoReference_.amount;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000119,certora_local281)}

		emit EthReceived(roundNum_, prizeWinnerAddress_, amount_);
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth() public override /*nonReentrant*/ {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b20000, 1037618708914) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b20001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b20004, 0) }
		EthBalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(_msgSender())];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010107,0)}

		// It's OK if this is zero.
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000108,ethBalanceAmountCopy_)}

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(_msgSender(), _msgSender(), ethBalanceAmountCopy_);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountCopy_}("");assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010109,0)}

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountCopy_);
		}
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth(address prizeWinnerAddress_) external override /*nonReentrant*/ {
		EthBalanceInfo storage ethBalanceInfoReference_ = _ethBalancesInfo[uint160(prizeWinnerAddress_)];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0001010a,0)}
		uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[ethBalanceInfoReference_.roundNum];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000010b,roundTimeoutTimeToWithdrawPrizes_)}
		require(
			block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
			CosmicSignatureErrors.EarlyWithdrawal("Not enough time has elapsed.", roundTimeoutTimeToWithdrawPrizes_, block.timestamp)
		);

		// It's OK if this is zero.
		uint256 ethBalanceAmountCopy_ = ethBalanceInfoReference_.amount;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000010c,ethBalanceAmountCopy_)}

		delete ethBalanceInfoReference_.amount;
		delete ethBalanceInfoReference_.roundNum;
		emit EthWithdrawn(prizeWinnerAddress_, _msgSender(), ethBalanceAmountCopy_);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountCopy_}("");assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0001010d,0)}

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountCopy_);
		}
	}

	// #endregion
	// #region `getEthBalanceInfo`

	function getEthBalanceInfo() external view override returns (EthBalanceInfo memory) {
		return _ethBalancesInfo[uint160(_msgSender())];
	}

	// #endregion
	// #region `getEthBalanceInfo`

	function getEthBalanceInfo(address prizeWinnerAddress_) external view override returns (EthBalanceInfo memory) {
		return _ethBalancesInfo[uint160(prizeWinnerAddress_)];
	}

	// #endregion
	// #region `donateToken`

	function donateToken(uint256 roundNum_, address donorAddress_, IERC20 tokenAddress_, uint256 amount_) external override
		// nonReentrant
		_onlyGame {
		// #enable_asserts assert(donorAddress_ != address(0));
		uint256 newDonatedTokenIndex_ = _getDonatedTokenIndex(roundNum_, tokenAddress_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000010e,newDonatedTokenIndex_)}
		DonatedToken storage newDonatedTokenReference_ = _donatedTokens[newDonatedTokenIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0001010f,0)}

		// This can revert due to overflow, which, in turn, probably can happen only if the donor
		// and/or the provided ERC-20 contract are malicious.
		newDonatedTokenReference_.amount += amount_;uint256 certora_local282 = newDonatedTokenReference_.amount;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000011a,certora_local282)}

		emit TokenDonated(roundNum_, donorAddress_, tokenAddress_, amount_);

		// [Comment-202502242]
		// This would revert if `tokenAddress_` is zero or there is no ERC-20-compatible contract there.
		// todo-1 Test the above.
		// [/Comment-202502242]
		// todo-1 Document in a user manual that they need to authorize `PrizesWallet` to transfer this token amount.
		// todo-1 Our web site really should provide an easy way to authorize that.
		// todo-1 Find other places where we call similar methods, like staking wallets, and document that too.
		SafeERC20.safeTransferFrom(tokenAddress_, donorAddress_, address(this), amount_);
	}

	// #endregion
	// #region `claimDonatedToken`

	function claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_) public override /*nonReentrant*/ {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01af0000, 1037618708911) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01af0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01af0005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01af6001, tokenAddress_) }
		// [Comment-202502244]
		// According to Comment-202411283, we must validate `roundNum_` here.
		// But array bounds check near Comment-202411287 will implicitly validate it.
		// [/Comment-202502244]

		// [Comment-202411286]
		// Nothing would be broken if the `mainPrizeBeneficiaryAddresses` item is still zero.
		// In that case, the `roundTimeoutTimesToWithdrawPrizes` item would also be zero.
		// [/Comment-202411286]
		{
			// [Comment-202411287/]
			if (_msgSender() != mainPrizeBeneficiaryAddresses[roundNum_]) {
				
				uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[roundNum_];
				require(
					block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
					CosmicSignatureErrors.DonatedTokenClaimDenied(
						"Only the bidding round main prize beneficiary is permitted to claim this ERC-20 token donation before a timeout expires.",
						roundNum_,
						_msgSender(),
						tokenAddress_
					)
				);
			}
		}

		// Comment-202502244 relates.
		uint256 donatedTokenIndex_ = _getDonatedTokenIndex(roundNum_, tokenAddress_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000110,donatedTokenIndex_)}

		DonatedToken storage donatedTokenReference_ = _donatedTokens[donatedTokenIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010111,0)}

		// It's OK if `donatedTokenCopy_.amount` is zero.
		// It would be zero if this donation was never made or has already been claimed.
		DonatedToken memory donatedTokenCopy_ = donatedTokenReference_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010112,0)}

		delete donatedTokenReference_.amount;
		emit DonatedTokenClaimed(roundNum_, _msgSender(), tokenAddress_, donatedTokenCopy_.amount);

		// Comment-202502242 applies.
		SafeERC20.safeTransfer(tokenAddress_, _msgSender(), donatedTokenCopy_.amount);
	}

	// #endregion
	// #region `claimManyDonatedTokens`

	function claimManyDonatedTokens(DonatedTokenToClaim[] calldata donatedTokensToClaim_) public override /*nonReentrant*/ {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ae0000, 1037618708910) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ae0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ae0005, 26) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ae6100, donatedTokensToClaim_.offset) }
		for (uint256 donatedTokenToClaimIndex_ = donatedTokensToClaim_.length; donatedTokenToClaimIndex_ > 0; ) {
			-- donatedTokenToClaimIndex_;
			DonatedTokenToClaim calldata donatedTokenToClaimReference_ = donatedTokensToClaim_[donatedTokenToClaimIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0001011f,0)}
			claimDonatedToken(donatedTokenToClaimReference_.roundNum, donatedTokenToClaimReference_.tokenAddress);
		}
	}

	// #endregion
	// #region `getDonatedTokenAmount`

	function getDonatedTokenAmount(uint256 roundNum_, IERC20 tokenAddress_) external view override returns (uint256) {
		uint256 donatedTokenIndex_ = _getDonatedTokenIndex(roundNum_, tokenAddress_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000113,donatedTokenIndex_)}
		return _donatedTokens[donatedTokenIndex_].amount;
	}

	// #endregion
	// #region `_getDonatedTokenIndex`

	function _getDonatedTokenIndex(uint256 roundNum_, IERC20 tokenAddress_) private pure returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ab0000, 1037618708907) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ab0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ab0005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ab6001, tokenAddress_) }
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
		_onlyGame {
		// #enable_asserts assert(donorAddress_ != address(0));
		uint256 numDonatedNftsCopy_ = numDonatedNfts;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000114,numDonatedNftsCopy_)}
		DonatedNft storage newDonatedNftReference_ = donatedNfts[numDonatedNftsCopy_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010115,0)}
		newDonatedNftReference_.roundNum = roundNum_;uint256 certora_local283 = newDonatedNftReference_.roundNum;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000011b,certora_local283)}
		newDonatedNftReference_.nftAddress = nftAddress_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0002011c,0)}
		newDonatedNftReference_.nftId = nftId_;uint256 certora_local285 = newDonatedNftReference_.nftId;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000011d,certora_local285)}
		emit NftDonated(roundNum_, donorAddress_, nftAddress_, nftId_, numDonatedNftsCopy_);
		++ numDonatedNftsCopy_;
		numDonatedNfts = numDonatedNftsCopy_;

		// [Comment-202502245]
		// This would revert if `nftAddress_` is zero or there is no ERC-721-compatible contract there.
		// todo-1 Test the above.
		// [/Comment-202502245]
		// todo-1 Document in a user manual that they need to authorize `PrizesWallet` to transfer this NFT.
		// todo-1 Our web site really should provide an easy way to authorize that.
		// todo-1 Find other places where we call similar methods, like staking wallets, and document that too.
		nftAddress_.transferFrom(donorAddress_, address(this), nftId_);
	}

	// #endregion
	// #region `claimDonatedNft`

	function claimDonatedNft(uint256 index_) public override /*nonReentrant*/ {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b10000, 1037618708913) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b10001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b10005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b16000, index_) }
		DonatedNft storage donatedNftReference_ = donatedNfts[index_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010116,0)}
		DonatedNft memory donatedNftCopy_ = donatedNftReference_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010117,0)}

		if (address(donatedNftCopy_.nftAddress) == address(0)) {
			if (index_ < numDonatedNfts) {
				revert CosmicSignatureErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", index_);
			} else {
				revert CosmicSignatureErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", index_);
			}
		} else {
			// It's impossible that we need to throw `CosmicSignatureErrors.InvalidDonatedNftIndex`.
			// #enable_asserts assert(index_ < numDonatedNfts);
		}

		// Comment-202411286 applies.
		if (_msgSender() != mainPrizeBeneficiaryAddresses[donatedNftCopy_.roundNum]) {
			uint256 roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes[donatedNftCopy_.roundNum];
			require(
				block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
				CosmicSignatureErrors.DonatedNftClaimDenied(
					"Only the bidding round main prize beneficiary is permitted to claim this NFT before a timeout expires.",
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

	function claimManyDonatedNfts(uint256[] calldata indices_) public override /*nonReentrant*/ {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ac0000, 1037618708908) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ac0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ac0005, 26) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ac6100, indices_.offset) }
		for (uint256 indexIndex_ = indices_.length; indexIndex_ > 0; ) {
			-- indexIndex_;
			claimDonatedNft(indices_[indexIndex_]);
		}
	}

	// #endregion
}

// #endregion
