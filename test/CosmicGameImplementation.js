const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment,basicDeploymentAdvanced } = require("../src/Deploy.js");
const SKIP_LONG_TESTS = "1";

describe("CosmicGameImplementation", function () {
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
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
			cosmicGameImplementation,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			cosmicGameImplementation,
		};
	}
	it("Upgrade of CosmicGameImplementation contract works", async function () {
		const CGVersions = await ethers.getContractFactory("CGVersions");
		let cosmicGameProxy = await CGVersions.deploy();
		await cosmicGameProxy.deployed();

		const LogicVers1 = await ethers.getContractFactory("LogicVers1");
		let logic1 = await LogicVers1.deploy();
		await logic1.deployed();
		await cosmicGameProxy.setBusinessLogicContract(logic1.address);

		await cosmicGameProxy.write(); // write() in version1
		let value1 = await cosmicGameProxy.roundNum();
		expect(value1).to.equal(10001);
		let value2 = await cosmicGameProxy.extraStorage(10001);
		expect(value2).to.equal(10001);
		let addr1 = await cosmicGameProxy.cosmicGameImplementation();
		expect(addr1).to.equal(logic1.address);

		// do the upgrade of CosmicGameImplementation contract
		const LogicVers2 = await ethers.getContractFactory("LogicVers2");
		let logic2 = await LogicVers2.deploy();
		await logic2.deployed();
		await cosmicGameProxy.setBusinessLogicContract(logic2.address);

		// call write() , but not it is version2 of the contract
		await cosmicGameProxy.write();
		value1 = await cosmicGameProxy.roundNum();
		expect(value1).to.equal(10002);
		value2 = await cosmicGameProxy.extraStorage(10002);
		expect(value2).to.equal(10002);
		let addr2 = await cosmicGameProxy.cosmicGameImplementation();
		expect(addr2).to.equal(logic2.address);

		// now back to first logic
		await cosmicGameProxy.setBusinessLogicContract(logic1.address);
		await cosmicGameProxy.write(); // write() in version1
		value1 = await cosmicGameProxy.roundNum();
		expect(value1).to.equal(10001);
		value2 = await cosmicGameProxy.extraStorage(10001);
		expect(value2).to.equal(10001);
		addr1 = await cosmicGameProxy.cosmicGameImplementation();
		expect(addr1).to.equal(logic1.address);
	});
	it("Simple CALL to CosmicGameImplementation does't have access to CosmicGameProxy", async function () {
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
			cosmicGameImplementation,
		} = await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameImplementation.bid(params, { value: bidPrice, gasLimit: 10000000 })).to.be.reverted;
	});
	it("Fallback function is executing bid", async function () {
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
			cosmicGameImplementation,
		} = await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		const [owner, otherAccount] = await ethers.getSigners();
		await owner.sendTransaction({
			to: cosmicGameProxy.address,
			value: bidPrice,
		});
		let bidPriceAfter = await cosmicGameProxy.getBidPrice();
		expect(bidPriceAfter).not.to.equal(bidPrice);
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGameProxy",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy();
		await newToken.deployed();
		await cosmicGameProxy.setTokenContractRaw(newToken.address);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"ERC20Mint");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		async function getCSTPrice() {
			let input = cosmicGameProxy.interface.encodeFunctionData("currentCSTPrice",[]);
			let message = await cosmicGameProxy.provider.call({
				to: cosmicGameProxy.address,
				data: input
			});
			let res = cosmicGameProxy.interface.decodeFunctionResult("currentCSTPrice",message)
			let priceBytes = res[0].slice(130,194)
			let cstPriceArr = ethers.utils.defaultAbiCoder.decode(["uint256"],'0x'+priceBytes);
			let cstPrice = cstPriceArr[0];
			return cstPrice;
		}
		if (SKIP_LONG_TESTS == "1") return;
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =

		await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await ethers.getSigners();
		let timeBump = 24*3600;
		let balance,cstPrice;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });
	 	for (let i=0; i<numIterationsMain; i++) {
			let b = await ethers.provider.getBalance(owner.address);
			let j=0;
			while (true) {
				bidPrice = await cosmicGameProxy.getBidPrice();
				balance = await cosmicToken.balanceOf(owner.address);
				cstPrice = await getCSTPrice();
				await cosmicGameProxy.bid(params, { value: bidPrice });
				if (balance.gt(cstPrice)) {
					break;
				}
				j++;
				if (j>= numIterationsSecondary) {
					break;
				}
			}
			try {
				await cosmicGameProxy.bidWithCST("");
			} catch (e) {
				console.log(e);
				let balanceEth = await ethers.provider.getBalance(owner.address);
				let tb = await cosmicToken.balanceOf(owner.address);
				process.exit(1);
			}
			await ethers.provider.send("evm_increaseTime", [timeBump]);
			await ethers.provider.send("evm_mine");
			let CSTAuctionLength = await cosmicGameProxy.CSTAuctionLength();
		}
	})
});
