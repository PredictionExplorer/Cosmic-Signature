// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract CosmicToken is ERC20, ERC20Burnable, Ownable, ERC20Permit, ERC20Votes {
	constructor() ERC20("CosmicToken", "CST") ERC20Permit("CosmicToken") {}

	function mint(address to, uint256 amount) public onlyOwner {
		_mint(to, amount);
	}

	function burn(address account, uint256 amount) public {
		_burn(account, amount);
	}

	// The following functions are overrides required by Solidity.

	function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
		super._afterTokenTransfer(from, to, amount);
	}

	function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
		super._mint(to, amount);
	}

	function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
		super._burn(account, amount);
	}
}
