// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { IERC20Permit, ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";

// #endregion
// #region

contract CosmicSignatureToken is
	ERC20,

	// Comment-202409177 relates.
	ERC20Burnable,

	ERC20Permit,

	// [Comment-202507302]
	// This supports the token total supply of up to `(1 << 208) - 1`.
	// Comment-202412033 relates.
	// [/Comment-202507302]
	ERC20Votes,

	AddressValidator,
	ICosmicSignatureToken {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	constructor(address game_)
		_providedAddressIsNonZero(game_)
		ERC20("CosmicSignatureToken", "CST")
		ERC20Permit("CosmicSignatureToken") {
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

	/// @dev
	/// [Comment-202411253]
	/// Similar logic exists in multiple places.
	/// [/Comment-202411253]
	function _checkOnlyGame() private view {
		if (_msgSender() != game) {
			revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
		}
	}

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
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			for (uint256 index_ = specs_.length; index_ > 0; ) {
				-- index_;
				MintSpec calldata specReference_ = specs_[index_];
				_mint(specReference_.account, specReference_.value);
			}
		}
	}

	// #endregion
	// #region `burnMany`

	function burnMany(MintSpec[] calldata specs_) external override _onlyGame {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			for (uint256 index_ = specs_.length; index_ > 0; ) {
				-- index_;
				MintSpec calldata specReference_ = specs_[index_];
				_burn(specReference_.account, specReference_.value);
			}
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
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			address from_ = _msgSender();
			for (uint256 index_ = tos_.length; index_ > 0; ) {
				-- index_;
				address to_ = tos_[index_];
				_transfer(from_, to_, value_);
			}
		}
	}

	// #endregion
	// #region `transferMany`

	function transferMany(MintSpec[] calldata specs_) external override {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			address from_ = _msgSender();
			for (uint256 index_ = specs_.length; index_ > 0; ) {
				-- index_;
				MintSpec calldata specReference_ = specs_[index_];
				address to_ = specReference_.account;
				uint256 value_ = specReference_.value;
				_transfer(from_, to_, value_);
			}
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
	// 	// todo-9 Is it really necessary to validate this? Better `require` this?
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

	// /// @dev We need this method just for a test. We don't need it in the production.
	// /// I have tested that `super._update` calls this.
	// /// So I have confirmed that by calling `super._update` we call `ERC20Votes._update`, rather than `ERC20._update`.
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
