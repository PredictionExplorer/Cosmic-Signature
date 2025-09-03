// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC20Mock is IERC20 {
	mapping(address => uint256) private _balances;
	mapping(address => mapping(address => uint256)) private _allowances;
	uint256 private _totalSupply;

	function totalSupply() external view override returns (uint256) { return _totalSupply; }
	function balanceOf(address account) external view override returns (uint256) { return _balances[account]; }
	function allowance(address owner, address spender) external view override returns (uint256) { return _allowances[owner][spender]; }

	function transfer(address to, uint256 amount) external override returns (bool) {
		_transfer(msg.sender, to, amount);
		return true;
	}

	function approve(address spender, uint256 amount) external override returns (bool) {
		_allowances[msg.sender][spender] = amount;
		return true;
	}

	function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
		uint256 a = _allowances[from][msg.sender];
		require(a >= amount, "allowance");
		_allowances[from][msg.sender] = a - amount;
		_transfer(from, to, amount);
		return true;
	}

	function mint(address to, uint256 amount) external {
		_totalSupply += amount;
		_balances[to] += amount;
	}

	function burn(address from, uint256 amount) external {
		require(_balances[from] >= amount, "balance");
		_balances[from] -= amount;
		_totalSupply -= amount;
	}

	function _transfer(address from, address to, uint256 amount) internal {
		require(to != address(0), "zero to");
		require(_balances[from] >= amount, "balance");
		_balances[from] -= amount;
		_balances[to] += amount;
	}

	// No receive/fallback => nonpayable
}

