// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
// import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { IERC20Permit, ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
// import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";

// #endregion
// #region

/// @dev
/// todo-1 +++ Review again what can possibly fail here and cause a transaction reversal.
/// todo-1 +++ Assuming it's OK, but there is a lot of code there that is hard to comprehend.
/// todo-1 Let's see what SMTChecker says.
contract CosmicSignatureToken is
	// Ownable,
	ERC20,

	// todo-1 +++ This is needed -- confirmed.
	// Comment-202409177 relates.
	ERC20Burnable,

	ERC20Permit,
	ERC20Votes,
	AddressValidator,
	ICosmicSignatureToken {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	// /// @notice This address holds some CST amount.
	// /// The held amount is replenished when someone bids with CST.
	// /// Comment-202412201 relates and/or applies.
	// /// todo-9 Declare this `immutable`? Maybe don't, because this can be an EOA.
	// address public marketingWalletAddress;

	// /// @notice
	// /// [Comment-202412201]
	// /// If `marketingWalletAddress` already holds at least this token amount, any new received funds will be burned.
	// /// This limit can be exceeded by a little.
	// /// [/Comment-202412201]
	// uint256 public marketingWalletBalanceAmountMaxLimit = CosmicSignatureConstants.DEFAULT_MARKETING_WALLET_BALANCE_AMOUNT_MAX_LIMIT;

	// #endregion
	// #region `_onlyGame`

	/// @dev Comment-202411253 applies.
	modifier _onlyGame() {
		if (_msgSender() != game) {
			revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
		}
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	constructor(address game_ /* , address marketingWalletAddress_ */)
		_providedAddressIsNonZero(game_)
		// _providedAddressIsNonZero(marketingWalletAddress_)
		// Ownable(_msgSender())
		ERC20("CosmicSignatureToken", "CST")
		ERC20Permit("CosmicSignatureToken") {
		game = game_;
		// marketingWalletAddress = marketingWalletAddress_;
	}

	// #endregion
	// #region // `setMarketingWalletAddress`

	// function setMarketingWalletAddress(address newValue_) external override onlyOwner _providedAddressIsNonZero(newValue_) {
	// 	marketingWalletAddress = newValue_;
	// 	emit MarketingWalletAddressChanged(newValue_);
	// }

	// #endregion
	// #region // `setMarketingWalletBalanceAmountMaxLimit`

	// function setMarketingWalletBalanceAmountMaxLimit(uint256 newValue_) external override onlyOwner {
	// 	marketingWalletBalanceAmountMaxLimit = newValue_;
	// 	emit MarketingWalletBalanceAmountMaxLimitChanged(newValue_);
	// }

	// #endregion
	// #region // `transferToMarketingWalletOrBurn`

	// function transferToMarketingWalletOrBurn(address fromAddress_, uint256 amount_) external override _onlyGame {
	// 	if (balanceOf(marketingWalletAddress) < marketingWalletBalanceAmountMaxLimit) {
	// 		_transfer(fromAddress_, marketingWalletAddress, amount_);
	// 	} else {
	// 		_burn(fromAddress_, amount_);
	// 	}
	// }

	// #endregion
	// #region // `mintToMarketingWallet`

	// function mintToMarketingWallet(uint256 amount_) external override _onlyGame {
	// 	_mint(marketingWalletAddress, amount_);
	// }

	// #endregion
	// #region `mint`

	function mint(address account_, uint256 value_) external override _onlyGame {
		_mint(account_, value_);
	}

	// #endregion
	// #region `burn`

	function burn(address account_, uint256 value_) external override _onlyGame {
		_burn(account_, value_);
	}

	// #endregion
	// #region `mintMany`

	function mintMany(MintSpec[] calldata specs_) external override _onlyGame {
		for (uint256 index_ = specs_.length; index_ > 0; ) {
			-- index_;
			MintSpec calldata specReference_ = specs_[index_];
			_mint(specReference_.account, specReference_.value);
		}
	}

	// #endregion
	// #region `burnMany`

	function burnMany(MintSpec[] calldata specs_) external override _onlyGame {
		for (uint256 index_ = specs_.length; index_ > 0; ) {
			-- index_;
			MintSpec calldata specReference_ = specs_[index_];
			_burn(specReference_.account, specReference_.value);
		}
	}

	// #endregion
	// #region `mintAndBurnMany`

	function mintAndBurnMany(MintOrBurnSpec[] calldata specs_) external override _onlyGame {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			for ( uint256 index_ = 0; index_ < specs_.length; ++ index_ ) {
				MintOrBurnSpec calldata specReference_ = specs_[index_];
				int256 value_ = specReference_.value;
				if (value_ >= int256(0)) {
					_mint(specReference_.account, uint256(value_));
				} else {
					_burn(specReference_.account, uint256( - value_ ));
				}
			}
		}
	}

	// #endregion
	// #region `transferMany`

	function transferMany(address[] calldata tos_, uint256 value_) external override {
		address from_ = _msgSender();
		for (uint256 index_ = tos_.length; index_ > 0; ) {
			-- index_;
			address to_ = tos_[index_];
			_transfer(from_, to_, value_);
		}
	}

	// #endregion
	// #region `transferMany`

	function transferMany(MintSpec[] calldata specs_) external override {
		address from_ = _msgSender();
		for (uint256 index_ = specs_.length; index_ > 0; ) {
			-- index_;
			MintSpec calldata specReference_ = specs_[index_];
			address to_ = specReference_.account;
			uint256 value_ = specReference_.value;
			_transfer(from_, to_, value_);
		}
	}

	// #endregion
	// #region // `safeApprove`

	// /// @dev todo-9 Idea. But maybe we don't need this.
	// /// `oldAllowance_` is the allowance the caller has seen before they sent a transaction request to call this method.
	// /// Event if the allowance decreases before the transaction gets executed this method will do the right thing.
	// /// This method offers no benefit if either `oldAllowance_` or `newAllowance_` is zero.
	// /// It's incorrect to call this method if `newAllowance_` is the maximum possible value.
	// /// todo-9 ??? Maybe rename `oldAllowance_` and `newAllowance_` to `oldValue_` and `newValue_`.
	// function safeApprove(address spender_, uint256 oldAllowance_, uint256 newAllowance_) external /*override*/ {
	// 	// todo-9 Is it really necessary to validate this? Does Comment-202409215 apply? Better `require` this?
	// 	// #enable_asserts assert(newAllowance_ < type(uint256).max);
	//
	// 	uint256 allowance_ = allowance(_msgSender(), spender_);
	// 	if (allowance_ < oldAllowance_) {
	// 		uint256 diff_ = oldAllowance_ - allowance_;
	// 		if (diff_ < newAllowance_) {
	// 			newAllowance_ -= diff_;
	// 		} else {
	// 			newAllowance_ = 0;
	// 		}
	// 	}
	// 	_approve(_msgSender(), spender_, newAllowance_);
	// }

	// #endregion
	// #region `CLOCK_MODE`

	/// @notice Comment-202501123 relates and/or applies.
	/// solhint-disable-next-line func-name-mixedcase
	function CLOCK_MODE() public pure override returns (string memory) {
		return "mode=timestamp";
	}

	// #endregion
	// #region `clock`

	/// @notice Comment-202501123 relates and/or applies.
	function clock() public view override returns (uint48) {
		return uint48(block.timestamp);
	}

	// #endregion
	// #region Overrides Required By Solidity

	function _update(address from_, address to_, uint256 value_) internal override (ERC20, ERC20Votes) {
		// // #enable_asserts // #disable_smtchecker console.log("_update entered.");
		super._update(from_, to_, value_);
		// // #enable_asserts // #disable_smtchecker console.log("_update exiting.");
	}

	// // @dev I have tested that `super._update` calls this.
	// // So I have confirmed that by calling `super._update` we call `ERC20Votes._update`, rather than `ERC20._update`.
	// function _transferVotingUnits(address from_, address to_, uint256 amount_) internal override {
	// 	// #enable_asserts // #disable_smtchecker console.log("_transferVotingUnits entered.");
	// 	super._transferVotingUnits(from_, to_, amount_);
	// 	// #enable_asserts // #disable_smtchecker console.log("_transferVotingUnits exiting.");
	// }

	function nonces(address owner_) public view override (IERC20Permit, Nonces, ERC20Permit) returns (uint256) {
		return super.nonces(owner_);
	}

	// #endregion
}

// #endregion
