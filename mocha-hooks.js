"use strict";

const { expect } = require("chai");
const hre = require("hardhat");

// function test1(x_) {
// 	console.info(Date.now().toString(), x_);
// }

async function beforeAll() {
	expect(hre.network.name).equal("hardhat");

	// Doing what Comment-202507272 recommends.
	// todo-0 Review that comment.
	{
		{
			const feeData_ = new hre.ethers.FeeData(null, 10n ** (9n + 1n), 0n);
			hre.ethers.provider.getFeeData = async () => (/*test1("1"),*/ feeData_);
		}

		{
			const gasLimit_ = hre.network.config.gas;
			expect(typeof gasLimit_).equal("number");
			const bigGasLimit_ = BigInt(gasLimit_);
			hre.ethers.provider.estimateGas = async () => (/*test1("2"),*/ bigGasLimit_);
		}
	}
}

module.exports.mochaHooks = {
	beforeAll,
};
