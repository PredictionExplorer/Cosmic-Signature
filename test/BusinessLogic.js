const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment,basicDeploymentAdvanced } = require("../src/Deploy.js");
const SKIP_LONG_TESTS = "1";

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
		const [owner, otherAccount] = await ethers.getSigners();
		await owner.sendTransaction({
			to: cosmicGame.address,
			value: bidPrice,
		});
		let bidPriceAfter = await cosmicGame.getBidPrice();
		expect(bidPriceAfter).not.to.equal(bidPrice);
	});
	it("Shouldn't be possible to claim prize if StakingWallet fails to receive deposit", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		let StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(cBidder.address, owner.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();

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
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
	});
	it("Shouldn't be possible to claim prize if CosmicSignature NFT fails to mint()", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const BrokenToken = await ethers.getContractFactory("BrokenToken");
		let newCosmicSignature = await BrokenToken.deploy();
		await newCosmicSignature.deployed();
		await cosmicGame.setNftContractRaw(newCosmicSignature.address);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"ERC721Mint");
	});
	it("Shouldn't be possible to claim prize if deposit to charity fails", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const BrokenCharity = await ethers.getContractFactory("BrokenCharity");
		let newCharity= await BrokenCharity.deploy();
		await newCharity.deployed();
		await cosmicGame.setCharityRaw(newCharity.address);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy();
		await newToken.deployed();
		await cosmicGame.setTokenContractRaw(newToken.address);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"ERC20Mint");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		async function getCSTPrice() {
			let input = cosmicGame.interface.encodeFunctionData("currentCSTPrice",[]);
			let message = await cosmicGame.provider.call({
				to: cosmicGame.address,
				data: input
			});
			let res = cosmicGame.interface.decodeFunctionResult("currentCSTPrice",message)
			let priceBytes = res[0].slice(130,194)
			let cstPriceArr = ethers.utils.defaultAbiCoder.decode(["uint256"],'0x'+priceBytes);
			let cstPrice = cstPriceArr[0];
			return cstPrice;
		}
		if (SKIP_LONG_TESTS == "1") return;
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =

		await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await ethers.getSigners();
		let timeBump = 24*3600;
		let balance,cstPrice;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.bid(params, { value: bidPrice });
	 	for (let i=0; i<numIterationsMain; i++) {
			let b = await ethers.provider.getBalance(owner.address);
			let j=0;
			while (true) {
				bidPrice = await cosmicGame.getBidPrice();
				balance = await cosmicToken.balanceOf(owner.address);
				cstPrice = await getCSTPrice();
				await cosmicGame.bid(params, { value: bidPrice });
				if (balance.gt(cstPrice)) {
					break;
				}
				j++;
				if (j>= numIterationsSecondary) {
					break;
				}
			}
			try {
				await cosmicGame.bidWithCST("");
			} catch (e) {
				console.log(e);
				let balanceEth = await ethers.provider.getBalance(owner.address);
				let tb = await cosmicToken.balanceOf(owner.address);
				process.exit(1);
			}
			await ethers.provider.send("evm_increaseTime", [timeBump]);
			await ethers.provider.send("evm_mine");
			let CSTAuctionLength = await cosmicGame.CSTAuctionLength();
		}
	})
});
