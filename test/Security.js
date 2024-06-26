const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment } = require("../src/Deploy.js");

describe("Security", function () {
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	async function deployCosmic() {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await basicDeployment(contractDeployerAcct, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);

		return { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet };
	}
	it("Vulnerability to claimPrize() multiple times", async function () {
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		await cosmicGame.setTokenContract(cosmicToken.address);
		await cosmicGame.setNftContract(cosmicSignature.address);
		await cosmicGame.setCharity(charityWallet.address);
		await cosmicGame.setRaffleWallet(raffleWallet.address);
		await cosmicGame.setRandomWalk(randomWalkNFT.address);
		await cosmicGame.setActivationTime(0);
		let prizePercentage = "10";
		await cosmicGame.setPrizePercentage(ethers.BigNumber.from(prizePercentage));
		await cosmicGame.setRuntimeMode();

		const ReClaim = await ethers.getContractFactory("ReClaim");
		const reclaim = await ReClaim.deploy(cosmicGame.address);

		let donationAmount = hre.ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });

		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice }); // this works
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(24 * 3600).toNumber()]);
		await ethers.provider.send("evm_mine");

		let prizeAmount = await cosmicGame.prizeAmount();
		let reclaim_bal_before = await ethers.provider.getBalance(reclaim.address);
		// Make sure there is no re-entrancy
		await expect(reclaim.connect(addr3).claimAndReset(ethers.BigNumber.from("1"))).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
	});
	it("Is possible to take prize before activation", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT } = await loadFixture(
			deployCosmic,
		);
		[owner, addr1, ...addrs] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		await ethers.provider.send("evm_mine"); // begin
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
		await ethers.provider.send("evm_mine");
		let prizeAmount = await cosmicGame.prizeAmount();
		let balance_before = await addr1.getBalance();
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"NoLastBidder");
	});
});
