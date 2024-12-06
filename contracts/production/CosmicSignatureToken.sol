// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";

/// todo-1 Move this comment to the interface?
/// @notice The CST has the same scale as ETH, meaning the minimum amount equals 1 Wei,
/// which makes it possible to use Solidity syntax, such as `1 ether`, to specify an amount in CST.
/// todo-1 Make sense to move `Ownable` to the beginning of the base contract list? Then reorder it in the constructor too.
/// todo-1 Do we need a method to send the same and/or different amounts to multiple recipients?
/// todo-1 Review extensions to inherit from. Maybe `ERC20FlashMint`, `ERC20TemporaryApproval` (still a draft).
/// todo-1 Take a look at the wizard at https://docs.openzeppelin.com/contracts/5.x/wizard
contract CosmicSignatureToken is ERC20, ERC20Burnable, Ownable, ERC20Permit, ERC20Votes, ICosmicSignatureToken {
	/// @notice Initializes the CosmicSignatureToken contract
	/// @dev Sets the token name to "CosmicSignatureToken" and symbol to "CST"
	/// ToDo-202408114-1 applies.
	constructor() ERC20("CosmicSignatureToken", "CST") Ownable(msg.sender) ERC20Permit("CosmicSignatureToken") {}

	/// todo-1 `onlyOwner` is really meant to be only the game contract, right?
	/// todo-1 See `CosmicSignatureNft`. It's done right there.
	/// todo-1 Maybe we need a big array of authorized minters/burners, also in `CosmicSignatureNft`.
	function mint(address to, uint256 value) public override onlyOwner {
		_mint(to, value);
	}

	/// todo-1 Make some `public` functions `external`.
	/// todo-1 Make some `public`/`external` functions `private`.
	function burn(address account, uint256 value) public override onlyOwner {
		_burn(account, value);
	}

	// /// @dev todo-1 Idea.
	// /// `oldAllowance_` is the allowance the caller has seen before they sent a transaction request to call this method.
	// /// Event if the allowance decreases before the transaction gets executed this method will do the right thing.
	// /// This method won't offer any benefit if either `oldAllowance_` or `newAllowance_` is zero.
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

	// The following functions are overrides required by Solidity.

	// todo-1 It appears that we no longer need to override this. Commented out.
	// /// @notice Hook that is called after any token transfer, including minting and burning
	// /// @dev This function is required to update the voting power
	// /// @param from The address tokens are transferred from (address(0) for minting)
	// /// @param to The address tokens are transferred to (address(0) for burning)
	// /// @param amount The amount of tokens transferred
	// function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
	// 	super._afterTokenTransfer(from, to, amount);
	// }

	// todo-1 It appears that we no longer need to override this. Commented out.
	// /// @notice Internal function to mint tokens
	// /// @dev This function is required to update the voting power when minting
	// /// @param to The address that will receive the minted tokens
	// /// @param amount The amount of tokens to mint
	// function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
	// 	super._mint(to, amount);
	// }

	// todo-1 It appears that we no longer need to override this. Commented out.
	// /// @notice Internal function to burn tokens
	// /// @dev This function is required to update the voting power when burning
	// /// @param account The address from which to burn tokens
	// /// @param amount The amount of tokens to burn
	// function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
	// 	super._burn(account, amount);
	// }

	function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
		super._update(from, to, value);
	}

	function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
		return super.nonces(owner);
	}
}
