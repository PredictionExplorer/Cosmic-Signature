const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("BiddingWar", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployBiddingWar() {
    const [owner, otherAccount] = await ethers.getSigners();

    const BiddingWar = await ethers.getContractFactory("BiddingWar");
    const biddingWar = await BiddingWar.deploy();

    const CosmicSignatureToken = await ethers.getContractFactory("CosmicSignatureToken");
    const cosmicSignatureToken = await CosmicSignatureToken.deploy();
    cosmicSignatureToken.transferOwnership(biddingWar.address);

    const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
    const cosmicSignature = await CosmicSignature.deploy(biddingWar.address);

    const CosmicSignatureDAO = await ethers.getContractFactory("CosmicSignatureDAO");
    const cosmicSignatureDAO = await CosmicSignatureDAO.deploy(cosmicSignatureToken.address);

    const CharityWallet = await ethers.getContractFactory("CharityWallet");
    const charityWallet = await CharityWallet.deploy();
    await charityWallet.transferOwnership(cosmicSignatureDAO.address);

    const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
    const randomWalkNFT = await RandomWalkNFT.deploy();

    await biddingWar.setTokenContract(cosmicSignatureToken.address);
    await biddingWar.setNftContract(cosmicSignature.address);
    await biddingWar.setCharity(charityWallet.address);
    await biddingWar.setRandomWalk(randomWalkNFT.address);

    return {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT};
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      expect(await biddingWar.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
      expect(await cosmicSignatureToken.totalSupply()).to.equal(0);
    });

    it("Should be possible to bid", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {biddingWar, cosmicSignatureToken, cosmicSignature} = await loadFixture(deployBiddingWar);
      let donationAmount = ethers.utils.parseEther('10');
      await biddingWar.donate({value: donationAmount});
      expect(await biddingWar.prizeAmount()).to.equal(donationAmount.div(2));
      await expect(biddingWar.connect(addr1).bid({value: 1})).to.be.revertedWith("The value submitted with this transaction is too low.");
      let bidPrice = await biddingWar.getBidPrice();
      await expect(biddingWar.connect(addr1).bid({value: bidPrice.sub(1)})).to.be.revertedWith("The value submitted with this transaction is too low.");

      let prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(0);

      // check that if we sent too much, we get our money back
      await biddingWar.connect(addr1).bid({value: bidPrice.add(1000)}); // this works
      const contractBalance = await ethers.provider.getBalance(biddingWar.address);
      expect(contractBalance).to.equal(donationAmount.add(bidPrice));

      let nanoSecondsExtra = await biddingWar.nanoSecondsExtra();
      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid({value: bidPrice});
      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).mul(2).add(24 * 3600 - 1));

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid({value: bidPrice});
      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).mul(3).add(24 * 3600 - 2)); // not super clear why we are subtracting 2 here and 1 above

      await expect(biddingWar.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");
      await expect(biddingWar.connect(addr2).claimPrize()).to.be.revertedWith("Only last bidder can claim the prize.");

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr2).bid({value: bidPrice});
      await expect(biddingWar.connect(addr2).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      prizeTime = await biddingWar.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.sub(100).toNumber()]);
      await ethers.provider.send("evm_mine");
      await expect(biddingWar.connect(addr2).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine");

      await expect(biddingWar.connect(addr1).claimPrize()).to.be.revertedWith("Only last bidder can claim the prize.");


      let prizeAmount = await biddingWar.prizeAmount();
      let charityAmount = await biddingWar.charityAmount();
      await biddingWar.connect(addr2).claimPrize();
      let prizeAmount2 = await biddingWar.prizeAmount();
      let expectedprizeAmount = prizeAmount.sub(charityAmount).div(2);
      expect(prizeAmount2).to.equal(expectedprizeAmount);

      // after the prize has been claimed, let's bid again!

      await expect(biddingWar.connect(addr2).claimPrize()).to.be.revertedWith("Only last bidder can claim the prize.");

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid({value: bidPrice});
      await expect(biddingWar.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
      await ethers.provider.send("evm_mine");

      prizeAmount = await biddingWar.prizeAmount();
      charityAmount = await biddingWar.charityAmount();
      await biddingWar.connect(addr1).claimPrize();
      prizeAmount2 = await biddingWar.prizeAmount();
      expect(prizeAmount2).to.equal(prizeAmount.sub(charityAmount).div(2));
    });

  });
})
