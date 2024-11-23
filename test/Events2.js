"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("Events2", function () {
	// const INITIAL_AMOUNT = hre.ethers.parseEther("10");
	async function deployCosmic() {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
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
	it("Number of Raffle events match the configuration", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		// ToDo-202411202-1 applies.
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		// we need to mint RWalk tokens for all bidders that participate to avoid missing events
		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr2).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr3).mint({ value: tokenPrice });

		// we need to create CosmicToken holders prior to our test
		let p = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: p });
		let ptime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(ptime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();

		// we need to stake tokens to have holder owners to earn raffle tokens
		let ts = await cosmicSignature.totalSupply();
		for (let i = 0; i<Number(ts); i++) {
			let ownr = await cosmicSignature.ownerOf(i)
			let owner_signer = await hre.ethers.getSigner(ownr);
			await cosmicSignature.connect(owner_signer).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
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
		let tx, receipt, log, parsed_log, bidPrice;
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

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");

		tx = await cosmicGameProxy.connect(addr3).claimPrize();
		receipt = await tx.wait();

		let num_raffle_nft_winners_bidding = await cosmicGameProxy.numRaffleNftWinnersBidding();
		let num_raffle_nft_winners_staking_rwalk = await cosmicGameProxy.numRaffleNftWinnersStakingRWalk();
		let total_nft_winners = Number(num_raffle_nft_winners_bidding) + 
								Number(num_raffle_nft_winners_staking_rwalk);
		let topic_sig = cosmicGameProxy.interface.getEvent("RaffleNftWinnerEvent").topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(total_nft_winners).to.equal(deposit_logs.length);

		let num_eth_winners = await cosmicGameProxy.numRaffleETHWinnersBidding();
		const numChronoWarriors_ = 1n;
		topic_sig = prizesWallet.interface.getEvent("EthReceived").topicHash;
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(num_eth_winners + numChronoWarriors_).to.equal(deposit_logs.length);
	});
});
