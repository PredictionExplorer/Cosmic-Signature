const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("CosmicSignature tests", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	it("mint() function works properly", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		var transferOwnership = false;
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		await expect(
			cosmicSignature.connect(addr1).mint(addr1.address, 0n),
		).to.be.revertedWithCustomError(cosmicSignature,"NoMintPrivileges");
	
		const NewCosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await NewCosmicSignature.deploy(owner.address);
		await newCosmicSignature.waitForDeployment();

		await expect(
			cosmicSignature.connect(owner).mint(ethers.ZeroAddress, 0n),
		).to.be.revertedWithCustomError(cosmicSignature,"ZeroAddress");

	})
	it("setTokenGenerationScriptURL() works as expected", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		var transferOwnership = false;
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		await cosmicSignature.connect(owner).setTokenGenerationScriptURL("url://");
		expect(await cosmicSignature.tokenGenerationScriptURL()).to.equal("url://");
		await expect(cosmicSignature.connect(addr1).setTokenGenerationScriptURL("none")).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	})
	it("Should be possible to setTokenName()", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		let tx = await cosmicGameProxy.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignature.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignature.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		let token_id = args.tokenId;
		tx = await cosmicSignature.connect(addr1).setTokenName(token_id, "name 0");
		receipt = await tx.wait();
		topic_sig = cosmicSignature.interface.getEvent("TokenNameEvent").topicHash;
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = cosmicSignature.interface.parseLog(log);
		args = parsed_log.args.toObject();
		expect(args.newName).to.equal("name 0");
		expect(token_id).to.equal(args.tokenId);

		let remote_token_name = await cosmicSignature.connect(addr1).tokenNames(token_id);
		expect(remote_token_name).to.equal("name 0");

		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		await expect(cosmicSignature.connect(addr2).setTokenName(token_id, "name 000")).to.be.revertedWithCustomError(
			contractErrors,
			"OwnershipError"
		);
		await expect(
			cosmicSignature.connect(addr1).setTokenName(token_id, "012345678901234567890123456789012"),
		).to.be.revertedWithCustomError(contractErrors,"TokenNameLength");
	});
})
