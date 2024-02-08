// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

contract BrokenToken {
	uint256 counter;
    function mint(address to, uint256 round) public {
		counter = round;
		require(false,"Test mint() failed");
    }
	function totalSupply() public view returns (uint256) {
		return 1;
	}
}
contract BrokenCharity {
	uint256 counter;
	receive() external payable {
		require(false,"Test deposit failed");
    }
}
