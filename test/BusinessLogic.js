const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment } = require("../src//Deploy.js");

describe("BusinessLogic", function () {
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
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
			bLogic,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bLogic,
		};
	}
	it("Upgrade of BusinessLogic contract works", async function () {
		const CGVersions = await ethers.getContractFactory("CGVersions");
		let cosmicGame = await CGVersions.deploy();
		await cosmicGame.deployed();

		const LogicVers1 = await ethers.getContractFactory("LogicVers1");
		let logic1 = await LogicVers1.deploy();
		await logic1.deployed();
		await cosmicGame.setBusinessLogicContract(logic1.address);

		await cosmicGame.write(); // write() in version1
		let value1 = await cosmicGame.roundNum();
		expect(value1).to.equal(10001);
		let value2 = await cosmicGame.extraStorage(10001);
		expect(value2).to.equal(10001);
		let addr1 = await cosmicGame.bLogic();
		expect(addr1).to.equal(logic1.address);

		// do the upgrade of BusinessLogic contract
		const LogicVers2 = await ethers.getContractFactory("LogicVers2");
		let logic2 = await LogicVers2.deploy();
		await logic2.deployed();
		await cosmicGame.setBusinessLogicContract(logic2.address);

		// call write() , but not it is version2 of the contract
		await cosmicGame.write();
		value1 = await cosmicGame.roundNum();
		expect(value1).to.equal(10002);
		value2 = await cosmicGame.extraStorage(10002);
		expect(value2).to.equal(10002);
		let addr2 = await cosmicGame.bLogic();
		expect(addr2).to.equal(logic2.address);

		// now back to first logic
		await cosmicGame.setBusinessLogicContract(logic1.address);
		await cosmicGame.write(); // write() in version1
		value1 = await cosmicGame.roundNum();
		expect(value1).to.equal(10001);
		value2 = await cosmicGame.extraStorage(10001);
		expect(value2).to.equal(10001);
		addr1 = await cosmicGame.bLogic();
		expect(addr1).to.equal(logic1.address);
	});
	it("Simple CALL to BusinessLogic does't have access to CosmicGame", async function () {
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
			bLogic,
		} = await loadFixture(deployCosmic);
		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(bLogic.bid(params, { value: bidPrice, gasLimit: 10000000 })).to.be.reverted;
	});
	it("Fallback function is executing bid", async function () {
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
			bLogic,
		} = await loadFixture(deployCosmic);
		let bidPrice = await cosmicGame.getBidPrice();
		let numETHBids = await cosmicGame.numETHBids();
		const [owner, otherAccount] = await ethers.getSigners();
		await owner.sendTransaction({
			to: cosmicGame.address,
			value: bidPrice,
		});
		let newNumETHBids = await cosmicGame.numETHBids();
		expect(newNumETHBids).to.equal(numETHBids.add(1));
	});
	it("Shouldn't be possible to claim prize if StakingWallet fails to receive deposit", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(cBidder.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await cosmicGame.setStakingWallet(newStakingWallet.address);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await cosmicGame.connect(addr1).claimPrize();

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Staking deposit failed.");
	});
	it("Shouldn't be possible to claim prize if CosmicSignature NFT fails to mint()", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const BrokenToken = await ethers.getContractFactory("BrokenToken");
		let newCosmicSignature = await BrokenToken.deploy();
		await newCosmicSignature.deployed();
		await cosmicGame.setNftContract(newCosmicSignature.address);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("CosmicSignature mint() failed to mint NFT.");
	});
	it("Shouldn't be possible to claim prize if deposit to charity fails", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const BrokenCharity = await ethers.getContractFactory("BrokenCharity");
		let newCharity= await BrokenCharity.deploy();
		await newCharity.deployed();
		await cosmicGame.setCharity(newCharity.address);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Transfer to charity contract failed.");
	});
});
