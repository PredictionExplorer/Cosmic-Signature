"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicSignatureNft", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmicSignature(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureNft,
			cosmicSignatureToken,
			cosmicSignatureDao,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureNft,
			cosmicSignatureToken,
			cosmicSignatureDao,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	it("mint() function works properly", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const transferOwnership = false;
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		await expect(
			cosmicSignatureNft.connect(addr1).mint(addr1.address, 0n),
		).to.be.revertedWithCustomError(cosmicSignatureNft,"NoMintPrivileges");
	
		// const NewCosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		// const newCosmicSignatureNft = await NewCosmicSignatureNft.deploy(owner.address);
		// await newCosmicSignatureNft.waitForDeployment();

		await expect(
			cosmicSignatureNft.connect(owner).mint(hre.ethers.ZeroAddress, 0n),
		).to.be.revertedWithCustomError(cosmicSignatureNft, "ZeroAddress");
	});
	it("setNftGenerationScriptUri() works as expected", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const transferOwnership = false;
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		await cosmicSignatureNft.connect(owner).setNftGenerationScriptUri("url://");
		expect(await cosmicSignatureNft.nftGenerationScriptUri()).to.equal("url://");
		await expect(cosmicSignatureNft.connect(addr1).setNftGenerationScriptUri("none")).to.be.revertedWithCustomError(cosmicSignatureGameProxy,"OwnableUnauthorizedAccount");
	});
	it("Should be possible to setNftName()", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		let tx = await cosmicSignatureGameProxy.connect(addr1).claimPrize();
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
		expect(args.nftNewName).to.equal("name 0");
		expect(token_id).to.equal(args.nftId);

		let remote_token_name = await cosmicSignatureNft.connect(addr1).tokenNames(token_id);
		expect(remote_token_name).to.equal("name 0");

		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(cosmicSignatureNft.connect(addr2).setNftName(token_id, "name 000")).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"OwnershipError"
		);
		await expect(
			cosmicSignatureNft.connect(addr1).setNftName(token_id, "012345678901234567890123456789012"),
		).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenNameLength");
	});
	it("BaseURI/TokenURI works", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		let tx = await cosmicSignatureGameProxy.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		await cosmicSignatureNft.connect(owner).setNftBaseUri("somebase/");
		expect(await cosmicSignatureNft.tokenURI(0n)).to.equal("somebase/0");
	});
});
