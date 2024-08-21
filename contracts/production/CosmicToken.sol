// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
// todo-1 In prev OpenZeppelin version, this was named "draft-ERC20Permit.sol".
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title CosmicToken - The official token for the Cosmic Game ecosystem
/// @author Cosmic Game Development Team
/// @notice This contract implements the CosmicToken (CST), an ERC20 token with additional features
/// @dev This token includes burning, ownership, permit, and voting capabilities
contract CosmicToken is ERC20, ERC20Burnable, Ownable, ERC20Permit, ERC20Votes {
	/// @notice Initializes the CosmicToken contract
	/// @dev Sets the token name to "CosmicToken" and symbol to "CST"
	/// ToDo-202408114-1 applies.
	constructor() ERC20("CosmicToken", "CST") Ownable(msg.sender) ERC20Permit("CosmicToken") {}

	/// @notice Mints new tokens and assigns them to the specified address
	/// @dev Only the contract owner can call this function
	/// @param to The address that will receive the minted tokens
	/// @param amount The amount of tokens to mint
	function mint(address to, uint256 amount) public onlyOwner {
		_mint(to, amount);
	}

	/// @notice Burns a specific amount of tokens from a given account
	/// @dev This function overrides the burn function from ERC20Burnable to allow burning from any account
	/// @param account The address from which to burn tokens
	/// @param amount The amount of tokens to burn
	function burn(address account, uint256 amount) public {
		_burn(account, amount);
	}

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
