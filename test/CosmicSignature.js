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
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicSignature,
			cosmicToken,
			cosmicDAO,
			charityWallet,
			prizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicSignature,
			cosmicToken,
			cosmicDAO,
			charityWallet,
			prizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGame,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNFTId", type: "int256" },
		],
	};
	it("mint() function works properly", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const transferOwnership = false;
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		await expect(
			cosmicSignature.connect(addr1).mint(addr1.address, 0n),
		).to.be.revertedWithCustomError(cosmicSignature,"NoMintPrivileges");
	
		const NewCosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await NewCosmicSignature.deploy(owner.address);
		await newCosmicSignature.waitForDeployment();

		await expect(
			cosmicSignature.connect(owner).mint(hre.ethers.ZeroAddress, 0n),
		).to.be.revertedWithCustomError(cosmicSignature, "ZeroAddress");

	});
	it("setTokenGenerationScriptURL() works as expected", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const transferOwnership = false;
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		await cosmicSignature.connect(owner).setTokenGenerationScriptURL("url://");
		expect(await cosmicSignature.tokenGenerationScriptURL()).to.equal("url://");
		await expect(cosmicSignature.connect(addr1).setTokenGenerationScriptURL("none")).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	});
	it("Should be possible to setTokenName()", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		let tx = await cosmicGameProxy.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignature.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignature.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		let token_id = args.nftId;
		tx = await cosmicSignature.connect(addr1).setTokenName(token_id, "name 0");
		receipt = await tx.wait();
		topic_sig = cosmicSignature.interface.getEvent("TokenNameEvent").topicHash;
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = cosmicSignature.interface.parseLog(log);
		args = parsed_log.args.toObject();
		expect(args.newName).to.equal("name 0");
		expect(token_id).to.equal(args.nftId);

		let remote_token_name = await cosmicSignature.connect(addr1).tokenNames(token_id);
		expect(remote_token_name).to.equal("name 0");

		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(cosmicSignature.connect(addr2).setTokenName(token_id, "name 000")).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"OwnershipError"
		);
		await expect(
			cosmicSignature.connect(addr1).setTokenName(token_id, "012345678901234567890123456789012"),
		).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenNameLength");
	});
	it("BaseURI/TokenURI works", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		let tx = await cosmicGameProxy.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		await cosmicSignature.connect(owner).setBaseURI("somebase/");
		expect(await cosmicSignature.tokenURI(0n)).to.equal("somebase/0");
	});
});
