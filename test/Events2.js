"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("Events2", function () {
	it("Number of Raffle events match the configuration", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft, prizesWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeRoundActivation(0n);

		// we need to mint RandomWalk NFTs for all bidders that participate to avoid missing events
		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr2).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr3).mint({ value: tokenPrice });

		// we need to create CosmicSignatureToken holders prior to our test
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();

		// we need to stake NFTs to have holder owners to earn raffle NFTs
		let ts = await cosmicSignatureNft.totalSupply();
		for (let i = 0; i<Number(ts); i++) {
			let ownr = await cosmicSignatureNft.ownerOf(i)
			let owner_signer = await hre.ethers.getSigner(ownr);
			await cosmicSignatureNft.connect(owner_signer).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
			await stakingWalletCosmicSignatureNft.connect(owner_signer).stake(i);
		}
		ts = await randomWalkNft.totalSupply();
		for (let i = 0; i<Number(ts); i++) {
			let ownr = await randomWalkNft.ownerOf(i)
			let owner_signer = await hre.ethers.getSigner(ownr);
			await randomWalkNft.connect(owner_signer).setApprovalForAll(await stakingWalletRandomWalkNft.getAddress(), true);
			await stakingWalletRandomWalkNft.connect(owner_signer).stake(i);
		}

		// test begins here
		
		let rwalkTokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: rwalkTokenPrice });
		rwalkTokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr2).mint({ value: rwalkTokenPrice });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr3).bid((-1), "", { value: nextEthBidPrice_ });

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");

		let tx = await cosmicSignatureGameProxy.connect(addr3).claimMainPrize();
		let receipt = await tx.wait();

		let numRaffleCosmicSignatureNftsForBidders_ = await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders();
		let numRaffleCosmicSignatureNftsForRandomWalkNftStakers_ = await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers();
		let total_nft_winners = numRaffleCosmicSignatureNftsForBidders_ + numRaffleCosmicSignatureNftsForRandomWalkNftStakers_;
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerCosmicSignatureNftAwarded").topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(total_nft_winners).to.equal(deposit_logs.length);

		let numRaffleEthPrizesForBidders_ = await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		const numChronoWarriors_ = 1n;
		topic_sig = prizesWallet.interface.getEvent("EthReceived").topicHash;
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(numRaffleEthPrizesForBidders_ + numChronoWarriors_).to.equal(deposit_logs.length);
	});
});
