"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("CosmicSignatureDao", function () {
	/// ToDo-202411224-1 applies.
	async function deployCosmicSignature() {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const contracts = await basicDeployment(owner, "", 1, addr1.address, true);
		contracts.signers = signers;
		return contracts;
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("Changing CharityWallet.charityAddress via CosmicSignatureDao", async function () {
		const forward_blocks = async n => {
			// for (let i = 0; i < n; i++) {
			// 	await hre.ethers.provider.send("evm_mine");
			// }

			await hre.ethers.provider.send("evm_increaseTime", [n]);
		};

		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao,} =
			await loadFixture(deployCosmicSignature);
         const [owner, addr1, addr2, addr3, addr4, addr5,] = signers;

		// const bidParams = { message: "", randomWalkNftId: -1 };
		// const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		for( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(signers[counter_]).bid(/*params*/ (-1), "", { value: bidPrice });
		}

		const votingDelay_ = await cosmicSignatureDao.votingDelay();
		expect(votingDelay_).equal(24n * 60n * 60n);
		const votingPeriod_ = await cosmicSignatureDao.votingPeriod();
		expect(votingPeriod_).equal(2n * 7n * 24n * 60n * 60n);

		await cosmicSignatureToken.connect(owner).delegate(owner.address);
		await cosmicSignatureToken.connect(addr1).delegate(addr1.address);
		await cosmicSignatureToken.connect(addr2).delegate(addr1.address);
		await cosmicSignatureToken.connect(addr3).delegate(addr3.address);

		let proposal_func = charityWallet.interface.encodeFunctionData("setCharityAddress", [addr5.address]);
		let proposal_desc = "set charityWallet to new addr";
		let tx = cosmicSignatureDao.connect(addr4).propose([await charityWallet.getAddress()], [0], [proposal_func], proposal_desc);
		await expect(tx).revertedWithCustomError(cosmicSignatureDao, "GovernorInsufficientProposerVotes");
		tx = await cosmicSignatureDao.connect(owner).propose([await charityWallet.getAddress()], [0], [proposal_func], proposal_desc);
		let receipt = await tx.wait();
		let parsed_log = cosmicSignatureDao.interface.parseLog(receipt.logs[0]);
		let proposalId_ = parsed_log.args.proposalId;

		await forward_blocks(Number(votingDelay_) / 2);

		// It looks like it allows the proposer to vote even before `votingDelay_` has elapsed.
		let vote = cosmicSignatureDao.connect(owner).castVote(proposalId_, 1);

		await expect(cosmicSignatureDao.connect(addr1).castVote(proposalId_, 1)).revertedWithCustomError(cosmicSignatureDao, "GovernorUnexpectedProposalState");
		await forward_blocks(Number(votingDelay_) / 2);
		vote = await cosmicSignatureDao.connect(addr1).castVote(proposalId_, 1);
		// todo-1 This delegated to another address, but it allows this to vote. That's surprising. To be revisited.
		// await expect(cosmicSignatureDao.connect(addr2).castVote(proposalId_, 1)).revertedWithCustomError(cosmicSignatureDao, "xxx");
		vote = await cosmicSignatureDao.connect(addr2).castVote(proposalId_, 1);
		vote = await cosmicSignatureDao.connect(addr3).castVote(proposalId_, 0);

		await forward_blocks(Number(votingPeriod_) / 2);
		let desc_hash = hre.ethers.id(proposal_desc);
		tx = cosmicSignatureDao.connect(owner).execute([await charityWallet.getAddress()], [0], [proposal_func], desc_hash);
		await expect(tx).revertedWithCustomError(cosmicSignatureDao, "GovernorUnexpectedProposalState");
		await forward_blocks(Number(votingPeriod_) / 2);
		expect(await charityWallet.charityAddress()).not.equal(addr5.address);
		tx = await cosmicSignatureDao.connect(addr4).execute([await charityWallet.getAddress()], [0], [proposal_func], desc_hash);
		receipt = await tx.wait();
		expect(await charityWallet.charityAddress()).equal(addr5.address);
	});
});
