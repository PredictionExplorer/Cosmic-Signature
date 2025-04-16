"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("EthDonations", function () {
	it("donateEthWithInfo() works as expected", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;
		
		let donationAmount_ = hre.ethers.parseEther("10");
		let dataStr ="{'version':1,'url':'http://one.two/three'}";
		await cosmicSignatureGameProxy.connect(signer1).donateEthWithInfo(dataStr, { value: donationAmount_ });
		let numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).to.equal(1);
		// todo-1 Test that this emits the correct event. But I believe I've seen a relevant test elsewhere.
		let ethDonationWithInfoRecord_ = await cosmicSignatureGameProxy.ethDonationWithInfoRecords(0);
		expect(ethDonationWithInfoRecord_.roundNum).to.equal(0);
		expect(ethDonationWithInfoRecord_.donorAddress).to.equal(signer1.address);
		expect(ethDonationWithInfoRecord_.amount).to.equal(donationAmount_);
		expect(ethDonationWithInfoRecord_.data).to.equal(dataStr);

		// check number of records is incrementing
		await cosmicSignatureGameProxy.connect(signer1).donateEthWithInfo(dataStr, { value: donationAmount_ });
		numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).to.equal(2);

		// await expect(cosmicSignatureGameProxy.connect(signer1).donateEthWithInfo(dataStr, {value: 0n})).revertedWithCustomError(cosmicSignatureGameProxy, "ZeroValue");
		await cosmicSignatureGameProxy.connect(signer1).donateEthWithInfo(dataStr, {value: 0n});
	});
	
	// it("Should not be possible to donate 0 value", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1,] = signers;
	//
	// 	await expect(cosmicSignatureGameProxy.connect(signer1).donateEth()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroValue");
	// });
});
