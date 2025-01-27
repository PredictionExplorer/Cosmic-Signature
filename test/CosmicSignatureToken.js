"use strict";

// const { expect } = require("chai");
// const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("CosmicSignatureToken", function () {
	it("ERC20 nonces() function exists", async function () {
		const {signers, cosmicSignatureToken,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		await cosmicSignatureToken.nonces(owner.address);
	});
});
