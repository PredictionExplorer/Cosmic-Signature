"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureNft", function () {
	it("The mint method behaves correctly", async function () {
		const {ownerAcct, signers, cosmicSignatureNftFactory, cosmicSignatureNft,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);

		await expect(
			cosmicSignatureNft.mint(0n, signer1.address, 0x167c41a5ddd8b94379899bacc638fe9a87929d7738bc7e1d080925709c34330en),
		).to.be.revertedWithCustomError(cosmicSignatureNft, "UnauthorizedCaller");
		await expect(
			cosmicSignatureNft.connect(signer1).mint(0n, signer1.address, 0xf5df7ce30f2a4e696109a2a3d544e48dd0cda03367cfd816d53083edd06e5638n),
		).to.be.revertedWithCustomError(cosmicSignatureNft, "UnauthorizedCaller");
		await expect(
			newCosmicSignatureNft.connect(signer0).mint(0n, hre.ethers.ZeroAddress, 0x3a61b868abd2e4597e6ed0bc53ec665f068523ad614e1affd22434e3edb8e523n),
		).to.be.revertedWithCustomError(newCosmicSignatureNft, /*"ZeroAddress"*/ "ERC721InvalidReceiver");
		await newCosmicSignatureNft.connect(signer0).mint(0n, signer2.address, generateRandomUInt256());
	});

	it("setNftGenerationScriptUri() works as expected", async function () {
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		await cosmicSignatureNft.connect(ownerAcct).setNftGenerationScriptUri("url://");
		expect(await cosmicSignatureNft.nftGenerationScriptUri()).to.equal("url://");
		await expect(cosmicSignatureNft.connect(signer1).setNftGenerationScriptUri("none")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
	});

	it("setNftName behaves correctly", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let tx = await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureNft.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		let token_id = args.nftId;

		tx = await cosmicSignatureNft.connect(signer1).setNftName(token_id, "name 1");
		receipt = await tx.wait();
		topic_sig = cosmicSignatureNft.interface.getEvent("NftNameChanged").topicHash;
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = cosmicSignatureNft.interface.parseLog(log);
		args = parsed_log.args.toObject();
		expect(args.nftName).equal("name 1");
		expect(args.nftId).equal(token_id);
		expect(await cosmicSignatureNft.getNftName(token_id)).equal("name 1");

		await expect(cosmicSignatureNft.connect(signer1).setNftName(token_id, "123456789012345678901234567890123"))
			.revertedWithCustomError(cosmicSignatureNft, "TooLongNftName");

		await expect(cosmicSignatureNft.connect(signer2).setNftName(token_id, "name 2"))
			.revertedWithCustomError(cosmicSignatureNft, "ERC721InsufficientApproval");
		await cosmicSignatureNft.connect(signer1).setApprovalForAll(signer2.address, true);
		await cosmicSignatureNft.connect(signer2).setNftName(token_id, "name 2");
		expect(await cosmicSignatureNft.getNftName(token_id)).equal("name 2");
	});
	
	it("BaseURI/TokenURI works", async function () {
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;
		
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let tx = await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();
		let receipt = await tx.wait();
		await cosmicSignatureNft.connect(ownerAcct).setNftBaseUri("somebase/");
		expect(await cosmicSignatureNft.tokenURI(0n)).to.equal("somebase/0");
	});
});
