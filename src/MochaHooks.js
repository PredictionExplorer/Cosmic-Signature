"use strict";

// [Comment-202608173]
// When Mocha runs in parallel mode, each worker process executes `@openzeppelin/hardhat-upgrades` proxy deployments.
// On a development network, that package stores its network manifest in a shared temporary folder
// (see `Manifest.forNetwork` in `@openzeppelin/upgrades-core`), guarded by `proper-lockfile`.
// Multiple worker processes then contend for the same lock file, which intermittently fails whole test files with
// "Error: Lock file is already being held".
// Each worker uses its own in-process Hardhat Network instance anyway, so sharing the manifest is not only
// unnecessary, but incorrect.
// Pointing each worker's temporary folder to a unique subfolder eliminates the contention.
// This must execute before `@openzeppelin/upgrades-core` reads `os.tmpdir()`, which reads the `TMPDIR`
// environment variable lazily, on each call.
// [/Comment-202608173]
{
	const nodeOsModule = require("node:os");
	const nodeFsModule = require("node:fs");
	const nodePathModule = require("node:path");
	const temporaryFolderPath_ = nodePathModule.join(nodeOsModule.tmpdir(), `cosmic-signature-tests-${process.pid.toString()}`);
	nodeFsModule.mkdirSync(temporaryFolderPath_, {recursive: true,});

	// Node.js `os.tmpdir` reads different environment variables, depending on the platform.
	process.env["TMPDIR"] = temporaryFolderPath_;
	process.env["TMP"] = temporaryFolderPath_;
	process.env["TEMP"] = temporaryFolderPath_;
}

const { assert: chaiAssert, expect } = require("chai");
const hre = require("hardhat");
const helpersModule = require("./Helpers.js");

// function test1(x_) {
// 	console.info("%s", `${Date.now()} ${x_}`);
// }

async function beforeAll() {
	// console.info("%s", "202508203");
	expect(hre.network.name).equal("hardhat");
	expect(helpersModule.HARDHAT_MODE_CODE).equal(1);

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
		
			chaiAssert.isNumber(gasLimit_);
			const bigGasLimit_ = BigInt(gasLimit_);
			hre.ethers.provider.estimateGas = async () => (/*test1("2"),*/ bigGasLimit_);
		}
	}
}

module.exports = {
	mochaHooks: {
		beforeAll,
	},
};
