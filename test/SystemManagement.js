const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicSignature tests", function () {
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
			raffleWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			// todo-0 Bug. This is actully `stakingWalletRWalk`. ToDo-202410075-0 applies.
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
			stakingWalletCosmicSignatureNft,
			// todo-0 Bug. This is actully `stakingWalletRWalk`. ToDo-202410075-0 applies.
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
	it("Setters are working", async function () {
		let runtimeMode = false;
		const [contractDeployerAcct] = await hre.ethers.getSigners();
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		let errObj;

		let sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal("2");

		let testAcct;
		testAcct = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.connect(owner).setCharity(testAcct.address);
		expect(await cosmicGameProxy.charity()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRandomWalk(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setRandomWalk(testAcct.address);
		expect(await cosmicGameProxy.randomWalk()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRaffleWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setRaffleWallet(testAcct.address);
		expect(await cosmicGameProxy.raffleWallet()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setStakingWalletCosmicSignatureNft(testAcct.address);
		expect(await cosmicGameProxy.stakingWalletCosmicSignatureNft()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setStakingWalletRWalk(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setStakingWalletRWalk(testAcct.address);
		expect(await cosmicGameProxy.stakingWalletRWalk()).to.equal(testAcct.address);

		await cosmicGameProxy.connect(owner).setNumRaffleETHWinnersBidding(99n);
		expect(await cosmicGameProxy.numRaffleETHWinnersBidding()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersBidding(99n);
		expect(await cosmicGameProxy.numRaffleNFTWinnersBidding()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersStakingRWalk(99n);
		expect(await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk()).to.equal(99n);

		await expect(cosmicGameProxy.connect(owner).setCharityPercentage(60n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		let charityPercentage = await cosmicGameProxy.charityPercentage();
		await cosmicGameProxy.connect(owner).setCharityPercentage(11n);
		expect(await cosmicGameProxy.charityPercentage()).to.equal(11n);
		await cosmicGameProxy.setCharityPercentage(charityPercentage);

		await expect(cosmicGameProxy.connect(owner).setRafflePercentage(55n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		let rafflePercentage = await cosmicGameProxy.rafflePercentage();
		await cosmicGameProxy.connect(owner).setRafflePercentage(6n);
		expect(await cosmicGameProxy.rafflePercentage()).to.equal(6n);
		await cosmicGameProxy.setRafflePercentage(rafflePercentage);

		await expect(cosmicGameProxy.connect(owner).setStakingPercentage(60n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		let stakingPercentage = await cosmicGameProxy.stakingPercentage();
		await cosmicGameProxy.connect(owner).setStakingPercentage(6n);
		expect(await cosmicGameProxy.stakingPercentage()).to.equal(6n);
		await cosmicGameProxy.setStakingPercentage(stakingPercentage);

		await expect(cosmicGameProxy.connect(owner).setPrizePercentage(75n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		await cosmicGameProxy.connect(owner).setPrizePercentage(26n);
		expect(await cosmicGameProxy.prizePercentage()).to.equal(26n);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setTokenContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setTokenContract(testAcct.address);
		expect(await cosmicGameProxy.token()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setNftContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setNftContract(testAcct.address);
		expect(await cosmicGameProxy.nft()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setMarketingWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setMarketingWallet(testAcct.address);
		expect(await cosmicGameProxy.marketingWallet()).to.equal(testAcct.address);

		await cosmicGameProxy.connect(owner).setTimeIncrease(99n);
		expect(await cosmicGameProxy.timeIncrease()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setTimeoutClaimPrize(99n);
		expect(await cosmicGameProxy.timeoutClaimPrize()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setPriceIncrease(99n);
		expect(await cosmicGameProxy.priceIncrease()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setNanoSecondsExtra(99n);
		expect(await cosmicGameProxy.nanoSecondsExtra()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setInitialSecondsUntilPrize(99n);
		expect(await cosmicGameProxy.initialSecondsUntilPrize()).to.equal(99n);

		await cosmicGameProxy.connect(owner).updateInitialBidAmountFraction(99n);
		expect(await cosmicGameProxy.initialBidAmountFraction()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setActivationTime(99n);
		expect(await cosmicGameProxy.activationTime()).to.equal(99n);

		await expect(cosmicGameProxy.connect(addr1).setRoundStartCSTAuctionLength(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setRoundStartCSTAuctionLength(3600n);
		expect(await cosmicGameProxy.RoundStartCSTAuctionLength()).to.equal(3600n);

		await expect(cosmicGameProxy.connect(addr1).setStartingBidPriceCSTMinLimit(hre.ethers.parseEther("111"))).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setStartingBidPriceCSTMinLimit(hre.ethers.parseEther("111"));
		expect(await cosmicGameProxy.startingBidPriceCSTMinLimit()).to.equal(hre.ethers.parseEther("111"));
		await expect(cosmicGameProxy.connect(owner).setStartingBidPriceCSTMinLimit(111n)).to.be.revertedWithCustomError(cosmicGameProxy,"ProvidedStartingBidPriceCSTMinLimitIsTooSmall");

		await expect(cosmicGameProxy.connect(addr1).setTokenReward(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setTokenReward(1234567890n);
		expect(await cosmicGameProxy.tokenReward()).to.equal(1234567890n);

		await cosmicGameProxy.connect(owner).setMarketingReward(1234567890n);
		expect(await cosmicGameProxy.marketingReward()).to.equal(1234567890n);

		await cosmicGameProxy.connect(owner).setMaxMessageLength(1234567890n);
		expect(await cosmicGameProxy.maxMessageLength()).to.equal(1234567890n);

		await expect(cosmicGameProxy.connect(addr1).setErc20RewardMultiplier(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setErc20RewardMultiplier(99n);
		expect(await cosmicGameProxy.erc20RewardMultiplier()).to.equal(99n);

		expect(await cosmicGameProxy.getSystemMode()).to.equal(2);

		await expect(cosmicGameProxy.connect(owner).prepareMaintenance()).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode");
		await expect(cosmicGameProxy.connect(addr1).setRuntimeMode()).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.setRuntimeMode();

		await cosmicGameProxy.connect(owner).transferOwnership(addr2.address);
		expect((await cosmicGameProxy.owner()).toString()).to.equal(addr2.address.toString());
		await cosmicGameProxy.connect(addr2).transferOwnership(owner.address);
		expect((await cosmicGameProxy.owner()).toString()).to.equal(owner.address.toString());
	});
	it("Setters are not available in run-time mode", async function () {
		let runtimeMode = true;
		const [contractDeployerAcct] = await hre.ethers.getSigners();
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();

		let sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal("0");
		let testAcct;
		testAcct = hre.ethers.Wallet.createRandom();

		let revertStr = "System must be in MODE_MAINTENANCE";
		await expect(cosmicGameProxy.connect(owner).setCharity(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRandomWalk(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRaffleWallet(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setStakingWalletCosmicSignatureNft(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setStakingWalletRWalk(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNumRaffleETHWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersStakingRWalk(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setTokenReward(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setMarketingReward(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setCharityPercentage(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRafflePercentage(6n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setStakingPercentage(6n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setTokenContract(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNftContract(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setMarketingWallet(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setTimeIncrease(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setTimeoutClaimPrize(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setPriceIncrease(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNanoSecondsExtra(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setInitialSecondsUntilPrize(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setPrizePercentage(26n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).updateInitialBidAmountFraction(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setActivationTime(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRoundStartCSTAuctionLength(3600n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setMaxMessageLength(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setErc20RewardMultiplier(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode");
		await expect(cosmicGameProxy.connect(owner).setRuntimeMode()).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await cosmicGameProxy.connect(owner).prepareMaintenance();
	});
	it("In maintenance mode, runtime-mode funtions are not available", async function () {
		let runtimeMode = false;
		const [contractDeployerAcct] = await hre.ethers.getSigners();
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();

		let revertStr="System in maintenance mode";

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.bidAndDonateNFT(params, owner.address, 0, { value: bidPrice })).to.be.revertedWithCustomError(cosmicGameProxy, "SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.bidWithCST("")).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.claimPrize()).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2);
		await expect(cosmicGameProxy.claimDonatedNFT(0)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.claimManyDonatedNFTs([0])).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(owner.sendTransaction({ to: await cosmicGameProxy.getAddress(), value: bidPrice})).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.donate({value: bidPrice})).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.donateWithInfo("{}",{value: bidPrice})).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await randomWalkNFT.connect(addr1).setApprovalForAll(await cosmicGameProxy.getAddress(), true);
		await expect(cosmicGameProxy.connect(addr1).donateNFT(await randomWalkNFT.getAddress(),0n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
	});
	it("Check access to privileged functions", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);

		const [owner, addr1] = await hre.ethers.getSigners();
		await expect(
			cosmicToken.connect(addr1).mint(addr1.address, 10000n)
		).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCharity(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRandomWalk(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount")
		await expect(cosmicGameProxy.connect(addr1).setRaffleWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleETHWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleNFTWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleNFTWinnersStakingRWalk(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setPrizePercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCharityPercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRafflePercentage(1n))
		.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingPercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTokenContract(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNftContract(addr1.address))
		.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMarketingWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingWalletCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingWalletRWalk(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTimeIncrease(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTimeoutClaimPrize(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setPriceIncrease(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNanoSecondsExtra(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setInitialSecondsUntilPrize(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).updateInitialBidAmountFraction(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setActivationTime(1n))
		.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMaxMessageLength(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMarketingReward(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(charityWallet.connect(addr1).setCharity(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicSignature.connect(addr1).setBaseURI("://uri"))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	});
	it("timeUntilActivation() method works properly", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRWalk
		} = await basicDeploymentAdvanced(
			'CosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		let bnum = await hre.ethers.provider.getBlockNumber();
		let bdata = await hre.ethers.provider.getBlock(bnum);
		let ts = bdata.timestamp;
		ts = ts + 60;
		await cosmicGameProxy.setActivationTime(ts);
		await cosmicGameProxy.setRuntimeMode();
		let at = await cosmicGameProxy.activationTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts-1]);
		await hre.ethers.provider.send("evm_mine");
		let tua = await cosmicGameProxy.timeUntilActivation();
		expect(tua).to.equal(1);
	});
	it('Maintenance mode works as expected', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let ownableErr = cosmicGameProxy.interface.getError('OwnableUnauthorizedAccount');

		let cosmicGameAddr = await cosmicGameProxy.getAddress();
		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		let bidParams = { msg: '', rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		let sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('0');

		await cosmicGameProxy.connect(owner).prepareMaintenance();
		await expect(cosmicGameProxy.connect(addr1).prepareMaintenance()).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");

		sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('1');

		const prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await hre.ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).claimPrize();

		sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('2');

		await cosmicGameProxy.setRuntimeMode();
		sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('0');

		// make another bid just to make sure runtime mode is enabled
		bidParams = { msg: '', rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
	});
	it("upgradeTo() works", async function () {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		let brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await cosmicGameProxy.upgradeTo(await brokenCharity.getAddress());
		await expect(contractDeployerAcct.sendTransaction({ to: await cosmicGameProxy.getAddress(), value: 1000000000000000000n})).to.be.revertedWith("Test deposit failed");
	})
	it("initialize() is disabled", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		await expect(cosmicGameProxy.initialize(owner.address)).revertedWithCustomError(cosmicGameProxy,"InvalidInitialization");
	})
	it("Only owner can upgrade proxy", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		await expect(cosmicGameProxy.connect(addr2).upgradeTo(addr1.address)).revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	})
})
