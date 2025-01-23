"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("EthDonations", function () {
	it("donateEthWithInfo() works as expected", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;
		
		let donationAmount = hre.ethers.parseEther("10");
		let dataStr ="{'version':1,'url':'http://one.two/three'}";
		await cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, { value: donationAmount });
		let numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).to.equal(1);
		// todo-1 Test that this emits the correct event. But I believe I've seen a relevant test elsewhere.
		let ethDonationWithInfoRecord_ = await cosmicSignatureGameProxy.ethDonationWithInfoRecords(0);
		expect(ethDonationWithInfoRecord_.roundNum).to.equal(0);
		expect(ethDonationWithInfoRecord_.donorAddress).to.equal(addr1.address);
		expect(ethDonationWithInfoRecord_.amount).to.equal(donationAmount);
		expect(ethDonationWithInfoRecord_.data).to.equal(dataStr);

		// check number of records is incrementing
		await cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, { value: donationAmount });
		numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).to.equal(2);

		// await expect(cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, {value: 0n})).revertedWithCustomError(cosmicSignatureGameProxy, "NonZeroValueRequired");
		await cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, {value: 0n});
	});
	// it("Should not be possible to donate 0 value", async function () {
	// 	const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
	// 	const [owner, addr1,] = signers;
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	await expect(cosmicSignatureGameProxy.connect(addr1).donateEth()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
	// });
});
