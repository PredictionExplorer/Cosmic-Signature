"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("SystemManagement-Old", function () {
	// todo-0 Doesn't this test belong to "Bidding.js"?
	// todo-0 Do we really need this test?
	it("Regardless if the current bidding round is active or not, the behavior is correct", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;
		// let ownableErr = cosmicSignatureGameProxy.interface.getError("OwnableUnauthorizedAccount");

		// todo-0 delete>>>// Comment-202501192 applies.
		// todo-0 delete>>>await hre.ethers.provider.send("evm_mine");

		let durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		// todo-1 Is this still correct?
		expect(durationUntilRoundActivation_).within((-24n) * 60n * 60n, 0n);
		const roundActivationTime_ = await cosmicSignatureGameProxy.roundActivationTime();
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let expectedDurationUntilRoundActivation_ = roundActivationTime_ - BigInt(latestBlock_.timestamp);
		expect(durationUntilRoundActivation_).equal(expectedDurationUntilRoundActivation_);

		const donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(signer2).donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(123n * 60n);
		await expect(cosmicSignatureGameProxy.connect(signer1).setDelayDurationBeforeRoundActivation(123n * 60n)).revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		const delayDurationBeforeRoundActivation_ = await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation();
		expect(delayDurationBeforeRoundActivation_).to.equal(123n * 60n);

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(1n);
		await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();

		durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		expect(durationUntilRoundActivation_).equal(delayDurationBeforeRoundActivation_);

		latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
		durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		expect(durationUntilRoundActivation_).equal(0n);

		// The next bidding round has started. So we are allowed to bid.
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	});
	
	it("Unauthorized access attempts to restricted methods", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;


		// todo-0 The remaining tests don't really belong to `SystemManagement`.

		await expect(charityWallet.connect(signer1).setCharityAddress(signer1.address))
			.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");

		// todo-1 Add `cosmicSignatureToken.transferToMarketingWalletOrBurn` to all tests. But I have eliminated it.
		await expect(cosmicSignatureToken.connect(signer1).mint(signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(ownerAcct).mint(signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(signer1)["burn(address,uint256)"](signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(ownerAcct)["burn(address,uint256)"](signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(signer1)["burn(uint256)"](10000n)).not.reverted;

		await expect(cosmicSignatureNft.connect(signer1).setNftBaseUri("://uri"))
			.revertedWithCustomError(cosmicSignatureNft, "OwnableUnauthorizedAccount");
	});
});
