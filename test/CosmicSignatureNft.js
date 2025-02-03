"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("CosmicSignatureNft", function () {
	it("mint() function works properly", async function () {
		const {signers, cosmicSignatureNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		const NewCosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		const newCosmicSignatureNft = await NewCosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.waitForDeployment();

		await expect(
			cosmicSignatureNft.mint(0n, addr1.address, 0x167c41a5ddd8b94379899bacc638fe9a87929d7738bc7e1d080925709c34330en),
		).to.be.revertedWithCustomError(cosmicSignatureNft, "UnauthorizedCaller");
		await expect(
			cosmicSignatureNft.connect(addr1).mint(0n, addr1.address, 0xf5df7ce30f2a4e696109a2a3d544e48dd0cda03367cfd816d53083edd06e5638n),
		).to.be.revertedWithCustomError(cosmicSignatureNft, "UnauthorizedCaller");
		await expect(
			newCosmicSignatureNft.mint(0n, hre.ethers.ZeroAddress, 0x3a61b868abd2e4597e6ed0bc53ec665f068523ad614e1affd22434e3edb8e523n),
		).to.be.revertedWithCustomError(newCosmicSignatureNft, /*"ZeroAddress"*/ "ERC721InvalidReceiver");
		newCosmicSignatureNft.mint(0n, await addr2.getAddress(), generateRandomUInt256())
	});
	it("setNftGenerationScriptUri() works as expected", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		await cosmicSignatureNft.connect(owner).setNftGenerationScriptUri("url://");
		expect(await cosmicSignatureNft.nftGenerationScriptUri()).to.equal("url://");
		await expect(cosmicSignatureNft.connect(addr1).setNftGenerationScriptUri("none")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
	});
	it("setNftName behaves correctly", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let tx = await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureNft.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		let token_id = args.nftId;
		tx = await cosmicSignatureNft.connect(addr1).setNftName(token_id, "name 0");
		receipt = await tx.wait();
		topic_sig = cosmicSignatureNft.interface.getEvent("NftNameChanged").topicHash;
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = cosmicSignatureNft.interface.parseLog(log);
		args = parsed_log.args.toObject();
		expect(args.nftName).to.equal("name 0");
		expect(token_id).to.equal(args.nftId);

		let remote_token_name = await cosmicSignatureNft.connect(addr1).getNftName(token_id);
		expect(remote_token_name).to.equal("name 0");

		await expect(cosmicSignatureNft.connect(addr2).setNftName(token_id, "name 000")).to.be.revertedWithCustomError(
			cosmicSignatureNft,
			"ERC721InsufficientApproval"
		);
		await expect(
			cosmicSignatureNft.connect(addr1).setNftName(token_id, "123456789012345678901234567890123"),
		).to.be.revertedWithCustomError(cosmicSignatureNft, "TooLongNftName");
	});
	it("BaseURI/TokenURI works", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;
		
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let tx = await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();
		let receipt = await tx.wait();
		await cosmicSignatureNft.connect(owner).setNftBaseUri("somebase/");
		expect(await cosmicSignatureNft.tokenURI(0n)).to.equal("somebase/0");
	});
});
