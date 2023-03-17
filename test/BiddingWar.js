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
      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      let donationAmount = ethers.utils.parseEther('10');
      await biddingWar.donate({value: donationAmount});
      expect(await biddingWar.prizeAmount()).to.equal(donationAmount.div(2));
      await expect(biddingWar.connect(addr1).bid("", {value: 1})).to.be.revertedWith("The value submitted with this transaction is too low.");
      let bidPrice = await biddingWar.getBidPrice();
      await expect(biddingWar.connect(addr1).bid("", {value: bidPrice.sub(1)})).to.be.revertedWith("The value submitted with this transaction is too low.");

      let prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(0);

      // check that if we sent too much, we get our money back
      await biddingWar.connect(addr1).bid("", {value: bidPrice.add(1000)}); // this works
      const contractBalance = await ethers.provider.getBalance(biddingWar.address);
      expect(contractBalance).to.equal(donationAmount.add(bidPrice));

      let nanoSecondsExtra = await biddingWar.nanoSecondsExtra();
      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid("", {value: bidPrice});
      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).mul(2).add(24 * 3600 - 1));

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid("", {value: bidPrice});
      prizeTime = await biddingWar.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).mul(3).add(24 * 3600 - 2)); // not super clear why we are subtracting 2 here and 1 above

      await expect(biddingWar.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");
      await expect(biddingWar.connect(addr2).claimPrize()).to.be.revertedWith("Only last bidder can claim the prize.");

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr2).bid("", {value: bidPrice});
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
      await biddingWar.connect(addr1).bid("", {value: bidPrice});
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
    it("Should be possible to bid with RandomWalk token", async function () {
      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      let tokenPrice = await randomWalkNFT.getMintPrice();
      await randomWalkNFT.connect(addr1).mint({value: tokenPrice});	// tokenId=0

      // switch to another account and attempt to use tokenId=0 which we don't own
      await expect(biddingWar.connect(owner).bidWithRWLK(ethers.BigNumber.from("0"), "")).to.be.revertedWith("you must be the owner of the token"); //tokenId=0

      tokenPrice = await randomWalkNFT.getMintPrice();
      let tx = await randomWalkNFT.connect(owner).mint({value: tokenPrice});
      let receipt = await tx.wait();
      let topic_sig = randomWalkNFT.interface.getEventTopic("MintEvent");
      let log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
      let parsed_log = randomWalkNFT.interface.parseLog(log);
      let token_id = parsed_log.args[0]
      await  biddingWar.connect(owner).bidWithRWLK(token_id, "");

      // try to mint again using the same tokenId
      await expect(biddingWar.connect(owner).bidWithRWLK(ethers.BigNumber.from(token_id), "")).to.be.revertedWith("token with this ID was used already"); //tokenId=0
    });
    it("Should not be possible to mint CosmicSignature token by anyone", async function () {

      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
	await expect(cosmicSignature.connect(owner).mint(owner.address)).to.be.revertedWith("only BiddingWar contract can mint")
     });
    it("Should be possible to setTokenName()", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      let bidPrice = await biddingWar.getBidPrice();
      let addr1_bal = await ethers.provider.getBalance(addr1.address);
      await biddingWar.connect(addr1).bid("", {value:bidPrice});
      let prizeTime = await biddingWar.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
      let tx = await biddingWar.connect(addr1).claimPrize();
      let receipt = await tx.wait();
      let topic_sig = cosmicSignature.interface.getEventTopic("MintEvent");
      let log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
      let parsed_log = cosmicSignature.interface.parseLog(log);
      let token_id = parsed_log.args.tokenId;
      await cosmicSignature.connect(addr1).setTokenName(token_id,"name 0");
      let remote_token_name = await cosmicSignature.connect(addr1).tokenNames(token_id);
      expect(remote_token_name).to.equal("name 0");

      await expect(cosmicSignature.connect(addr2)
            .setTokenName(token_id,"name 000"))
            .to.be.revertedWith("setTokenName caller is not owner nor approved");
      await expect(cosmicSignature.connect(addr1)
            .setTokenName(token_id,"012345678901234567890123456789012"))
            .to.be.revertedWith("Token name is too long.");
    });
    it("Should not be possible to mint ERC721 tokens by anyone()", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      await expect(cosmicSignature.connect(addr1).mint(addr1.address)).
            to.be.revertedWith("only BiddingWar contract can mint");
	});
    it("Should not be possible to donate 0 value", async function () {
      const {biddingWar, cosmicSignatureToken, cosmicSignature, charityWallet, cosmicSignatureDAO, randomWalkNFT} = await loadFixture(deployBiddingWar);
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      await expect(biddingWar.connect(addr1).donate()).
            to.be.revertedWith("amount to donate must be greater than 0");
    });
  });
})
