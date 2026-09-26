"use strict";

const { assert: chaiAssert, expect } = require("chai");
const hre = require("hardhat");
const helpersModule = require("./Helpers.js");

// function test1(x_) {
// 	console.info("%s", `${Date.now()} ${x_}`);
// }

function beforeAll() {
	// console.info("%s", "202508203");
	expect(hre.network.name).equal("hardhat");
	expect(helpersModule.HARDHAT_MODE_CODE).equal(1);

	// These methods are called on each transaction request send, which introduces latency.
	// So, when running unit tests, replacing them to quickly return cached values.
	{
		{
			const feeData_ = new hre.ethers.FeeData(null, 10n ** (9n + 1n), 0n);
			// eslint-disable-next-line @typescript-eslint/require-await -- Preserve the provider method's Promise-returning API.
			hre.ethers.provider.getFeeData = async () => (/*test1("1"),*/ feeData_);
		}
		{
			// [Comment-202508223/]
			const gasLimit_ = hre.network.config.gas;
		
			chaiAssert.isNumber(gasLimit_);
			const bigGasLimit_ = BigInt(gasLimit_);
			// eslint-disable-next-line @typescript-eslint/require-await -- Preserve the provider method's Promise-returning API.
			hre.ethers.provider.estimateGas = async () => (/*test1("2"),*/ bigGasLimit_);
		}
	}
}

module.exports = {
	mochaHooks: {
		beforeAll,
	},
};
