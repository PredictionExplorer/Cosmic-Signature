"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureDao", function () {
	it("Changing CharityWallet.charityAddress via CosmicSignatureDao", async function () {
		const forward_blocks = async n => {
			// // todo-9 Use "hardhat_mine".
			// for (let i = 0; i < n; i++) {
			// 	await hre.ethers.provider.send("evm_mine");
			// }

			await hre.ethers.provider.send("evm_increaseTime", [n]);
			// await hre.ethers.provider.send("evm_mine");
		};

		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, charityWalletAddr, cosmicSignatureDao, cosmicSignatureDaoAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3, signer4, signer5,] = signers;

		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await cosmicSignatureGameProxy.connect(signers[counter_]).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		}

		const votingDelay_ = await cosmicSignatureDao.votingDelay();
		expect(votingDelay_).equal(24n * 60n * 60n);
		const votingPeriod_ = await cosmicSignatureDao.votingPeriod();
		expect(votingPeriod_).equal(2n * 7n * 24n * 60n * 60n);

		await cosmicSignatureToken.connect(signer0).delegate(signer0.address);
		await cosmicSignatureToken.connect(signer1).delegate(signer1.address);
		await cosmicSignatureToken.connect(signer2).delegate(signer1.address);
		await cosmicSignatureToken.connect(signer3).delegate(signer3.address);

		let proposal_func = charityWallet.interface.encodeFunctionData("setCharityAddress", [signer5.address]);
		let proposal_desc = "set charityWallet to new addr";
		let tx = cosmicSignatureDao.connect(signer4).propose([charityWalletAddr], [0], [proposal_func], proposal_desc);
		await expect(tx).revertedWithCustomError(cosmicSignatureDao, "GovernorInsufficientProposerVotes");
		tx = await cosmicSignatureDao.connect(signer0).propose([charityWalletAddr], [0], [proposal_func], proposal_desc);
		let receipt = await tx.wait();
		let parsed_log = cosmicSignatureDao.interface.parseLog(receipt.logs[0]);
		let proposalId_ = parsed_log.args.proposalId;

		await forward_blocks(Number(votingDelay_) / 2);

		// It looks like it allows the proposer to vote even before `votingDelay_` has elapsed.
		let vote = cosmicSignatureDao.connect(signer0).castVote(proposalId_, 1);

		await expect(cosmicSignatureDao.connect(signer1).castVote(proposalId_, 1)).revertedWithCustomError(cosmicSignatureDao, "GovernorUnexpectedProposalState");
		await forward_blocks(Number(votingDelay_) / 2);
		vote = await cosmicSignatureDao.connect(signer1).castVote(proposalId_, 1);
		// todo-1 This delegated to another address, but it allows this to vote. That's surprising. To be revisited.
		// await expect(cosmicSignatureDao.connect(signer2).castVote(proposalId_, 1)).revertedWithCustomError(cosmicSignatureDao, "xxx");
		vote = await cosmicSignatureDao.connect(signer2).castVote(proposalId_, 1);
		vote = await cosmicSignatureDao.connect(signer3).castVote(proposalId_, 0);

		await forward_blocks(Number(votingPeriod_) / 2);
		let desc_hash = hre.ethers.id(proposal_desc);
		tx = cosmicSignatureDao.connect(signer0).execute([charityWalletAddr], [0], [proposal_func], desc_hash);
		await expect(tx).revertedWithCustomError(cosmicSignatureDao, "GovernorUnexpectedProposalState");
		await forward_blocks(Number(votingPeriod_) / 2);
		expect(await charityWallet.charityAddress()).not.equal(signer5.address);
		tx = cosmicSignatureDao.connect(signer4).execute([charityWalletAddr], [0], [proposal_func], desc_hash);
		await expect(tx).revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");
		await charityWallet.connect(ownerAcct).transferOwnership(signer4.address);
		tx = cosmicSignatureDao.connect(signer4).execute([charityWalletAddr], [0], [proposal_func], desc_hash);
		await expect(tx).revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");
		await charityWallet.connect(signer4).transferOwnership(cosmicSignatureDaoAddr);
		tx = await cosmicSignatureDao.connect(signer4).execute([charityWalletAddr], [0], [proposal_func], desc_hash);
		receipt = await tx.wait();
		expect(await charityWallet.charityAddress()).equal(signer5.address);
	});
});
