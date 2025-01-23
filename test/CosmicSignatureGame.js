"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("CosmicSignatureGame", function () {
	it("Smoke test", async function () {
		const {cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForTesting);

		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).to.equal(60 * 60 * 1000 * 1000);
		expect(await cosmicSignatureToken.totalSupply()).to.equal(0);
	});
	it("The initialize method is disabled", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		await expect(cosmicSignatureGameProxy.initialize(owner.address)).revertedWithCustomError(cosmicSignatureGameProxy, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using the recommended approach", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		const implementation1AddressAsString_ =
			await cosmicSignatureGameProxy.runner.provider.getStorage(
				await cosmicSignatureGameProxy.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		expect(implementation1AddressAsString_).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);
		const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
		const cosmicSignatureGameProxy2 =
			await hre.upgrades.upgradeProxy(
				cosmicSignatureGameProxy,
				CosmicSignatureGameOpenBid,
				{
					kind: "uups",
					call: "initialize2",
				}
			);
		expect(await cosmicSignatureGameProxy2.getAddress()).to.equal(await cosmicSignatureGameProxy.getAddress());
		const implementation2AddressAsString_ =
			await cosmicSignatureGameProxy2.runner.provider.getStorage(
				await cosmicSignatureGameProxy2.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		expect(implementation2AddressAsString_).not.equal(implementation1AddressAsString_);
		expect(await cosmicSignatureGameProxy2.timesEthBidPrice()).to.equal(3n);
		await cosmicSignatureGameProxy2.setTimesEthBidPrice(10n);
		expect(await cosmicSignatureGameProxy2.timesEthBidPrice()).to.equal(10n);
		await expect(cosmicSignatureGameProxy2.initialize(owner.address)).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy2.initialize2()).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using our minimalistic unsafe approach", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;
		
		const implementation1AddressAsString_ =
			await cosmicSignatureGameProxy.runner.provider.getStorage(
				await cosmicSignatureGameProxy.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		expect(implementation1AddressAsString_).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);
		const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
		const cosmicSignatureGameOpenBid = await CosmicSignatureGameOpenBid.deploy();
		await cosmicSignatureGameOpenBid.waitForDeployment();
		await cosmicSignatureGameProxy.upgradeTo(await cosmicSignatureGameOpenBid.getAddress());
		const cosmicSignatureGameProxy2 = await hre.ethers.getContractAt("CosmicSignatureGameOpenBid", await cosmicSignatureGameProxy.getAddress());
		const implementation2AddressAsString_ =
			await cosmicSignatureGameProxy2.runner.provider.getStorage(
				await cosmicSignatureGameProxy2.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		const implementation2Address_ = hre.ethers.getAddress(BigInt(implementation2AddressAsString_).toString(16).padStart(40, "0"));
		expect(implementation2Address_).equal(await cosmicSignatureGameOpenBid.getAddress());
		expect(await cosmicSignatureGameProxy2.timesEthBidPrice()).to.equal(0n);
		await cosmicSignatureGameProxy2.initialize2();
		expect(await cosmicSignatureGameProxy2.timesEthBidPrice()).to.equal(3n);
		await cosmicSignatureGameProxy2.setTimesEthBidPrice(10n);
		expect(await cosmicSignatureGameProxy2.timesEthBidPrice()).to.equal(10n);
		await expect(cosmicSignatureGameProxy2.initialize(owner.address)).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy2.initialize2()).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
	});

	// `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would not allow doing this.
	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade to a completely different contract using our minimalistic unsafe approach", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		const brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await cosmicSignatureGameProxy.upgradeTo(await brokenCharity.getAddress());

		// If we upgraded to `CosmicSignatureGameOpenBid`, we would call `cosmicSignatureGameProxy2.initialize2` at this point.

		await expect(owner.sendTransaction({ to: await cosmicSignatureGameProxy.getAddress(), value: 1000000000000000000n})).revertedWith("Test deposit failed.");
	});

	// Comment-202412129 relates.
	it("Only the owner is permitted to upgrade CosmicSignatureGame", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		// The recommended approach.
		{
			const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
			const tx =
				hre.upgrades.upgradeProxy(
					cosmicSignatureGameProxy/*.connect(addr2)*/,
					CosmicSignatureGameOpenBid.connect(addr2),
					{
						kind: "uups",
						call: "initialize2",
					}
				);
			// await tx.wait();
			await expect(tx).revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}

		// Our minimalistic unsafe approach.
		{
			await expect(cosmicSignatureGameProxy.connect(addr2).upgradeTo(addr1.address)).revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}
	});

	it("The transferOwnership method behaves correctly", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		expect(await cosmicSignatureGameProxy.owner()).to.equal(owner.address);
		for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
			// It's allowed to transfer ownership even in the active mode.
			await cosmicSignatureGameProxy.setActivationTime((counter_ <= 0) ? 123_456_789_012n : 123n);

			if (counter_ <= 0) {
				expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).greaterThan(+1e9);
			} else {
				expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).lessThan(-1e9);
			}
			await cosmicSignatureGameProxy.transferOwnership(addr2.address);
			expect(await cosmicSignatureGameProxy.owner()).to.equal(addr2.address);
			await cosmicSignatureGameProxy.connect(addr2).transferOwnership(owner.address);
			expect(await cosmicSignatureGameProxy.owner()).to.equal(owner.address);
		}
	});
	it("The receive method is executing a bid", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await owner.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: nextEthBidPrice_,
		});
		const nextEthBidPriceAfter_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		expect(nextEthBidPriceAfter_).greaterThan(nextEthBidPrice_);
	});

	// Issue. I have eliminated the `fallback` method.
	// So now the call reverts "without a reason".
	it("The fallback method behaves correctly", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		
		await expect(
			hre.ethers.provider.call({
				to: await cosmicSignatureGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		// ).to.be.revertedWith("Method does not exist.");
		).to.be.reverted;
	});
});
