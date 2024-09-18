const hre = require("hardhat");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Events2", function () {
	// const INITIAL_AMOUNT = hre.ethers.parseEther("10");
	async function deployCosmic() {
		let contractDeployerAcct;
		[contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
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
	it("Number of Raffle events match the configuration", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		// we need to mint RWalk tokens for all bidders that participate to avoid missing events
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr2).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr3).mint({ value: tokenPrice });

		// we need to create CosmicToken holders prior to our test
		let p = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
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
			await cosmicSignature.connect(owner_signer).setApprovalForAll(await stakingWalletCST.getAddress(), true);
			await stakingWalletCST.connect(owner_signer).stake(i);
		}
		ts = await randomWalkNFT.totalSupply();
		for (let i = 0; i<Number(ts); i++) {
			let ownr = await randomWalkNFT.ownerOf(i)
			let owner_signer = await hre.ethers.getSigner(ownr);
			await randomWalkNFT.connect(owner_signer).setApprovalForAll(await stakingWalletRWalk.getAddress(), true);
			await stakingWalletRWalk.connect(owner_signer).stake(i);
		}


		// test begins here
		let rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: rwalkTokenPrice });
		rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr2).mint({ value: rwalkTokenPrice });
		let tx, receipt, log, parsed_log, bidPrice, winner;
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");

		tx = await cosmicGameProxy.connect(addr3).claimPrize();
		receipt = await tx.wait();

		let num_raffle_nft_winners_bidding = await cosmicGameProxy.numRaffleNFTWinnersBidding();
		let num_raffle_nft_winners_staking_rwalk = await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk();
		let total_nft_winners = Number(num_raffle_nft_winners_bidding) + 
								Number(num_raffle_nft_winners_staking_rwalk);
		let topic_sig = cosmicGameProxy.interface.getEvent("RaffleNFTWinnerEvent").topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(total_nft_winners).to.equal(deposit_logs.length);

		let num_eth_winners = await cosmicGameProxy.numRaffleETHWinnersBidding();
		topic_sig = raffleWallet.interface.getEvent("RaffleDepositEvent").topicHash;
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(num_eth_winners).to.equal(deposit_logs.length);
	});
});
