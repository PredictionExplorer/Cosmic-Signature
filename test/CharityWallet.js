"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("CharityWallet", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
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
	it("CharityWallet is sending the right amount", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		let amountSent = hre.ethers.parseUnits("9",18);
		let receiverAddress_ = await charityWallet.charityAddress();
		await addr2.sendTransaction({ to: await charityWallet.getAddress(), value: amountSent });
		let balanceBefore = await hre.ethers.provider.getBalance(receiverAddress_);
		await charityWallet.send();
		let balanceAfter = await hre.ethers.provider.getBalance(receiverAddress_);
		expect(balanceAfter).to.equal(balanceBefore+amountSent);
	});
	it("It is not possible to withdraw from CharityWallet if transfer to the destination fails", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const transferOwnership = false;
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		let brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await owner.sendTransaction({ to: await charityWallet.getAddress(), value: hre.ethers.parseUnits("3",18)});
		await charityWallet.setCharity(await brokenCharity.getAddress());
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(charityWallet.send()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");


		const BrokenCharityWallet = await hre.ethers.getContractFactory("BrokenCharityWallet");
		let brokenCharityWallet = await BrokenCharityWallet.deploy();
		await brokenCharityWallet.waitForDeployment();
		await brokenCharityWallet.setCharityToZeroAddress();
		await expect(brokenCharityWallet.send()).to.be.revertedWithCustomError(brokenCharityWallet, "ZeroAddress");
		await brokenCharityWallet.setCharity(addr1.address);
		await expect(brokenCharityWallet.send()).to.be.revertedWithCustomError(brokenCharityWallet, "ZeroBalance");
	});
	it("Change charityAddress via DAO (Governor) is working", async function () {
		if (SKIP_LONG_TESTS == "1") return;
		const forward_blocks = async n => {
			for (let i = 0; i < n; i++) {
				await hre.ethers.provider.send("evm_mine");
			}
		};
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		let tx, receipt, log, parsed_log, bidPrice;

		const donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(owner).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		let voting_delay = await cosmicDAO.votingDelay();
		let voting_period = await cosmicDAO.votingPeriod();

		await cosmicToken.connect(owner).delegate(owner.address);
		await cosmicToken.connect(addr1).delegate(addr1.address);
		await cosmicToken.connect(addr2).delegate(addr2.address);
		await cosmicToken.connect(addr3).delegate(addr3.address);
		let proposal_func = charityWallet.interface.encodeFunctionData("setCharity", [addr1.address]);
		let proposal_desc = "set charityWallet to new addr";
		tx = await cosmicDAO.connect(owner).propose([await charityWallet.getAddress()], [0], [proposal_func], proposal_desc);
		receipt = await tx.wait();

		parsed_log = cosmicDAO.interface.parseLog(receipt.logs[0]);
		let proposal_id = parsed_log.args.proposalId;

		await forward_blocks(Number(voting_delay));

		let vote = await cosmicDAO.connect(addr1).castVote(proposal_id, 1);
		vote = await cosmicDAO.connect(addr2).castVote(proposal_id, 1);
		vote = await cosmicDAO.connect(addr3).castVote(proposal_id, 1);

		await forward_blocks(voting_period);

		let desc_hash = hre.ethers.id(proposal_desc);
		tx = await cosmicDAO.connect(owner).execute([await charityWallet.getAddress()], [0], [proposal_func], desc_hash);
		receipt = await tx.wait();

		let new_charity_addr = await charityWallet.charityAddress();
		expect(new_charity_addr.toString()).to.equal(addr1.address.toString());
	});
});
