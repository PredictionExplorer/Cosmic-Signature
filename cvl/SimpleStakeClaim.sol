// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

contract SimpleStakeClaim {

	uint256 public	totalDeposited;
	mapping (address => uint256) public	stakerDeposit;
	bool execFlag = false;

	function stake() external payable {
		require (msg.value > 0,"deposit must be greater than 0");
		stakerDeposit[msg.sender] = stakerDeposit[msg.sender] + msg.value;
		totalDeposited = totalDeposited + msg.value;
	}
	function unstake() external {
		require (execFlag == false,"non-reentrancy check fired");
		execFlag = true;
		require (stakerDeposit[msg.sender]>0,"you don't have funds at stake");
		require (address(this).balance > stakerDeposit[msg.sender],"not enough funds to pay you");
		uint256 stakerBalance = stakerDeposit[msg.sender];
		stakerDeposit[msg.sender] = 0;
		totalDeposited = totalDeposited - stakerBalance;
		(bool ok, ) = msg.sender.call{value:stakerBalance}("");
		require (ok,"msg.sender doesn't accept payments");
		execFlag = false;
	}
	function getStakerDeposit(address staker) external view returns (uint256) {
		return stakerDeposit[staker];
	}
}
