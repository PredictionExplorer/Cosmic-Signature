"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt32 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureGame-2", function () {
	it("Smoke test", async function () {
		const {ownerAcct, /*cosmicSignatureGameFactory,*/ cosmicSignatureGameImplementation, cosmicSignatureGameImplementationAddr, cosmicSignatureGameProxy,} =
			await loadFixture(deployContractsForUnitTesting);

		const cosmicSignatureGameImplementationByteCodeSize =
			// cosmicSignatureGameFactory.bytecode.length / 2 - 1;
			(await hre.ethers.provider.getCode(cosmicSignatureGameImplementationAddr)).length / 2 - 1;
		expect(cosmicSignatureGameImplementationByteCodeSize).greaterThanOrEqual(21 * 1024);
		console.log(
			"CosmicSignatureGame implementation bytecode size is " +
			cosmicSignatureGameImplementationByteCodeSize.toString() +
			" bytes, which is less than the maximum allowed by " +
			(24 * 1024 - cosmicSignatureGameImplementationByteCodeSize).toString() +
			"."
		);
		expect(await cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGameProxy.owner()).equal(ownerAcct);
		expect(await cosmicSignatureGameImplementation.mainPrizeTimeIncrementInMicroSeconds()).equal(0n);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(60n * 60n * 10n ** 6n);
	});

	it("The initialize method is disabled", async function () {
		const {ownerAcct, cosmicSignatureGameImplementation, cosmicSignatureGameProxy,} =
			await loadFixture(deployContractsForUnitTesting);

		await expect(cosmicSignatureGameImplementation.initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(cosmicSignatureGameImplementation.connect(ownerAcct).initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy.initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGameProxy, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using the recommended approach", async function () {
		const {ownerAcct, cosmicSignatureGameImplementationAddr, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n)).not.reverted;
		const cosmicSignatureGameOpenBidFactory =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", ownerAcct);
		const cosmicSignatureGame2Proxy =
			await hre.upgrades.upgradeProxy(
				cosmicSignatureGameProxy,
				cosmicSignatureGameOpenBidFactory,
				{
					kind: "uups",
					call: "initialize2",
				}
			);
		await cosmicSignatureGame2Proxy.waitForDeployment();
		expect(await cosmicSignatureGame2Proxy.getAddress()).equal(cosmicSignatureGameProxyAddr);
		const cosmicSignatureGame2ImplementationAddr = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddr);
		expect(cosmicSignatureGame2ImplementationAddr).not.equal(cosmicSignatureGameImplementationAddr);
		const cosmicSignatureGame2Implementation = cosmicSignatureGameOpenBidFactory.attach(cosmicSignatureGame2ImplementationAddr);
		await expect(cosmicSignatureGame2Proxy.connect(ownerAcct).initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Proxy, "InvalidInitialization");
		await expect(cosmicSignatureGame2Proxy.connect(ownerAcct).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation.connect(ownerAcct).initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Implementation, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation.connect(ownerAcct).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation, "InvalidInitialization");
		expect(await cosmicSignatureGame2Proxy.timesEthBidPrice()).equal(3n);
		await expect(cosmicSignatureGame2Proxy.connect(ownerAcct).setTimesEthBidPrice(10n)).not.reverted;
		expect(await cosmicSignatureGame2Proxy.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation.timesEthBidPrice()).equal(0n);
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using our minimalistic unsafe approach", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n)).not.reverted;
		const cosmicSignatureGameOpenBidFactory =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", deployerAcct);
		const cosmicSignatureGame2Implementation = await cosmicSignatureGameOpenBidFactory.deploy();
		await cosmicSignatureGame2Implementation.waitForDeployment();
		const cosmicSignatureGame2ImplementationAddr = await cosmicSignatureGame2Implementation.getAddress();
		await expect(cosmicSignatureGame2Implementation.connect(ownerAcct).initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Implementation, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation.connect(ownerAcct).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).upgradeTo(cosmicSignatureGame2ImplementationAddr)).not.reverted;
		expect(await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddr)).equal(cosmicSignatureGame2ImplementationAddr);
		const cosmicSignatureGame2Proxy = cosmicSignatureGameOpenBidFactory.attach(cosmicSignatureGameProxyAddr);
		expect(await cosmicSignatureGame2Proxy.timesEthBidPrice()).to.equal(0n);
		await expect(cosmicSignatureGame2Proxy.connect(ownerAcct).initialize(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Proxy, "InvalidInitialization");

		// According to Comment-202502164, anybody is permitted to make this call.
		await expect(cosmicSignatureGame2Proxy.connect(signer0).initialize2()).not.reverted;
		await expect(cosmicSignatureGame2Proxy.connect(signer0).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy, "InvalidInitialization");

		expect(await cosmicSignatureGame2Proxy.timesEthBidPrice()).equal(3n);
		await expect(cosmicSignatureGame2Proxy.connect(ownerAcct).setTimesEthBidPrice(10n)).not.reverted;
		expect(await cosmicSignatureGame2Proxy.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation.timesEthBidPrice()).equal(0n);
	});

	// `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would not allow doing this.
	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade to a completely different contract using our minimalistic unsafe approach", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n)).not.reverted;

		const brokenCharityFactory = await hre.ethers.getContractFactory("BrokenCharity", deployerAcct);
		const brokenCharity = await brokenCharityFactory.deploy();
		await brokenCharity.waitForDeployment();
		const brokenCharityAddr = await brokenCharity.getAddress();

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).upgradeTo(brokenCharityAddr)).not.reverted;

		// If we upgraded to `CosmicSignatureGameOpenBid`, we would call `cosmicSignatureGame2Proxy.initialize2` at this point.

		await expect(signer0.sendTransaction({to: cosmicSignatureGameProxyAddr, value: 10n ** 18n,})).revertedWith("Test deposit failed.");
	});

	// Comment-202412129 relates.
	it("Only the owner is permitted to upgrade CosmicSignatureGame", async function () {
		const {ownerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		// The recommended approach.
		{
			const cosmicSignatureGameOpenBidFactory =
				await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", ownerAcct);
			const tx =
				hre.upgrades.upgradeProxy(
					cosmicSignatureGameProxy/*.connect(signer2)*/,
					cosmicSignatureGameOpenBidFactory.connect(signer2),
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
			await expect(cosmicSignatureGameProxy.connect(signer2).upgradeTo(signer1.address)).revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}
	});

	it("The transferOwnership method", async function () {
		const {ownerAcct, signers, cosmicSignatureGameImplementation, cosmicSignatureGameProxy,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		expect(await cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		await expect(cosmicSignatureGameImplementation.connect(ownerAcct).transferOwnership(ownerAcct.address)).revertedWithCustomError(cosmicSignatureGameImplementation, "OwnableUnauthorizedAccount");
		expect(await cosmicSignatureGameProxy.owner()).equal(ownerAcct.address);
		for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
			// Ownership transfer will succeed regardless if the current bidding round is active or not.
			await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime((counter_ <= 0) ? 123_456_789_012n : 123n);

			if (counter_ <= 0) {
				expect(await cosmicSignatureGameProxy.getDurationUntilRoundActivation()).greaterThan(+1e9);
			} else {
				expect(await cosmicSignatureGameProxy.getDurationUntilRoundActivation()).lessThan(-1e9);
			}
			// todo-1 Add a call that will fail.
			await cosmicSignatureGameProxy.connect(ownerAcct).transferOwnership(signer2.address);
			expect(await cosmicSignatureGameProxy.owner()).equal(signer2.address);
			await cosmicSignatureGameProxy.connect(signer2).transferOwnership(ownerAcct.address);
			expect(await cosmicSignatureGameProxy.owner()).equal(ownerAcct.address);
		}
	});

	// Issue. I have eliminated the `fallback` method.
	it("The fallback method", async function () {
		const {cosmicSignatureGameProxyAddr,} = await loadFixture(deployContractsForUnitTesting);

		await expect(
			hre.ethers.provider.call({
				to: cosmicSignatureGameProxyAddr,

				// non-existent selector
				data: /*"0xffffffff"*/ "0x" + generateRandomUInt32().toString(16).padStart(8, "0"),
			})
		// ).revertedWith("Method does not exist.");
		).revertedWithoutReason();
	});
});
