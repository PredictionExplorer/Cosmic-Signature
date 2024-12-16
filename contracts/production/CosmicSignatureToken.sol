// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";
import { ERC20, ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";

contract CosmicSignatureToken is
	Ownable,
	ERC20,
	ERC20Burnable,
	ERC20Permit,
	ERC20Votes,
	ICosmicSignatureToken {
	/// @notice Constructor.
	/// @dev ToDo-202408114-1 applies.
	constructor()
		Ownable(msg.sender)
		ERC20("CosmicSignatureToken", "CST")
		ERC20Permit("CosmicSignatureToken") {
	}

	/// todo-1 `onlyOwner` is really meant to be only the game contract, right?
	/// todo-1 See `CosmicSignatureNft`. It's done right there.
	/// todo-1 ??? Maybe we need a big array of authorized minters/burners, also in `CosmicSignatureNft`.
	function mint(address account, uint256 value) public override onlyOwner {
		_mint(account, value);
	}

	/// todo-1 Make some `public` functions `external`.
	/// todo-1 Make some `public`/`external` functions `private`.
	/// todo-1 Document in a user manual that bidders don't need to set allowance to bid with CST.
	/// todo-1 Will this apply to trading on our exchange as well?
	function burn(address account, uint256 value) public override onlyOwner {
		_burn(account, value);
	}

	// /// @dev todo-1 Idea.
	// /// `oldAllowance_` is the allowance the caller has seen before they sent a transaction request to call this method.
	// /// Event if the allowance decreases before the transaction gets executed this method will do the right thing.
	// /// This method offers no benefit if either `oldAllowance_` or `newAllowance_` is zero.
	// /// It's incorrect to call this method if `newAllowance_` is the maximum possible value.
	// /// todo-1 ??? Maybe rename `oldAllowance_` and `newAllowance_` to `oldValue_` and `newValue_`.
	// function safeApprove(address spender_, uint256 oldAllowance_, uint256 newAllowance_) public /*virtual*/ {
	// 	// Comment-202409215 applies.
	// 	// #enable_asserts assert(newAllowance_ < type(uint256).max);
	//
	// 	uint256 allowance_ = allowance(msg.sender, spender_);
	// 	if (allowance_ < oldAllowance_) {
	// 		uint256 diff_ = oldAllowance_ - allowance_;
	// 		if (diff_ < newAllowance_) {
	// 			newAllowance_ -= diff_;
	// 		} else {
	// 			newAllowance_ = 0;
	// 		}
	// 	}
	// 	_approve(msg.sender, spender_, newAllowance_);
	// }

	// solhint-disable-next-line func-name-mixedcase
	function CLOCK_MODE() public pure override returns(string memory) {
		return "mode=timestamp";
	}

	function clock() public view override returns(uint48) {
		return uint48(block.timestamp);
	}

	// The following functions are overrides required by Solidity.

	function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
		super._update(from, to, value);
	}

	function nonces(address owner) public view override(ERC20Permit, Nonces) returns(uint256) {
		return super.nonces(owner);
	}
}
