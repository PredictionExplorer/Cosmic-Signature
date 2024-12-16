"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("Events2", function () {
	// const INITIAL_AMOUNT = hre.ethers.parseEther("10");
	async function deployCosmicSignature() {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			// bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			// bidLogic,
		};
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("Number of Raffle events match the configuration", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, prizesWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		// we need to mint RWalk tokens for all bidders that participate to avoid missing events
		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr2).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr3).mint({ value: tokenPrice });

		// we need to create CosmicSignatureToken holders prior to our test
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let p = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: p });
		let ptime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(ptime)]);
		await cosmicSignatureGameProxy.connect(addr1).claimPrize();

		// we need to stake tokens to have holder owners to earn raffle tokens
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
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });

		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");

		let tx = await cosmicSignatureGameProxy.connect(addr3).claimPrize();
		let receipt = await tx.wait();

		let num_raffle_nft_winners_bidding = await cosmicSignatureGameProxy.numRaffleNftWinnersBidding();
		let num_raffle_nft_winners_staking_rwalk = await cosmicSignatureGameProxy.numRaffleNftWinnersStakingRWalk();
		let total_nft_winners = Number(num_raffle_nft_winners_bidding) + 
								Number(num_raffle_nft_winners_staking_rwalk);
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("RaffleNftWinnerEvent").topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(total_nft_winners).to.equal(deposit_logs.length);

		let num_eth_winners = await cosmicSignatureGameProxy.numRaffleETHWinnersBidding();
		const numChronoWarriors_ = 1n;
		topic_sig = prizesWallet.interface.getEvent("EthReceived").topicHash;
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(num_eth_winners + numChronoWarriors_).to.equal(deposit_logs.length);
	});
});
