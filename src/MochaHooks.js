"use strict";

const { expect } = require("chai");
const hre = require("hardhat");

// function test1(x_) {
// 	console.info(Date.now().toString(), x_);
// }

async function beforeAll() {
	// console.info("202508203");
	expect(hre.network.name).equal("hardhat");

	// These methods are called on each transaction request send, which introduces latency.
	// So, when running unit tests, replacing them to quickly return cached values.
	{
		{
			const feeData_ = new hre.ethers.FeeData(null, 10n ** (9n + 1n), 0n);
			hre.ethers.provider.getFeeData = async () => (/*test1("1"),*/ feeData_);
		}
		{
			// [Comment-202508223/]
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
