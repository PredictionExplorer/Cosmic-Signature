const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Cosmic", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
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

    const RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
    const raffleWallet = await RaffleWallet.deploy();

    const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
    const randomWalkNFT = await RandomWalkNFT.deploy();

    await cosmicGame.setTokenContract(cosmicToken.address);
    await cosmicGame.setNftContract(cosmicSignature.address);
    await cosmicGame.setCharity(charityWallet.address);
    await cosmicGame.setRandomWalk(randomWalkNFT.address);
    await cosmicGame.setRaffleWallet(raffleWallet.address);
    await cosmicGame.setActivationTime(0);

    return {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet};

  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      expect(await cosmicGame.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
      expect(await cosmicToken.totalSupply()).to.equal(0);
    });
    it("Should be possible to bid", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      let donationAmount = ethers.utils.parseEther('10');
      await cosmicGame.donate({value: donationAmount});
      expect(await cosmicGame.prizeAmount()).to.equal(donationAmount.mul(25).div(100));
      await expect(cosmicGame.connect(addr1).bid("", {value: 1})).to.be.revertedWith("The value submitted with this transaction is too low.");
      let bidPrice = await cosmicGame.getBidPrice();
      await expect(cosmicGame.connect(addr1).bid("", {value: bidPrice.sub(1)})).to.be.revertedWith("The value submitted with this transaction is too low.");

      let prizeTime = await cosmicGame.timeUntilPrize();
      expect(prizeTime).to.equal(0);

      // check that if we sent too much, we get our money back
      await cosmicGame.connect(addr1).bid("", {value: bidPrice.add(1000)}); // this works
      const contractBalance = await ethers.provider.getBalance(cosmicGame.address);
      expect(contractBalance).to.equal(donationAmount.add(bidPrice));

      let nanoSecondsExtra = await cosmicGame.nanoSecondsExtra();
      prizeTime = await cosmicGame.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr1).bid("", {value: bidPrice});
      prizeTime = await cosmicGame.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).mul(2).add(24 * 3600 - 1));

      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr1).bid("", {value: bidPrice});
      prizeTime = await cosmicGame.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).mul(3).add(24 * 3600 - 2)); // not super clear why we are subtracting 2 here and 1 above

      await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr2).bid("", {value: bidPrice});
      await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      prizeTime = await cosmicGame.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.sub(100).toNumber()]);
      await ethers.provider.send("evm_mine");
      await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine");

      await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Only the last bidder can claim the prize during the first 24 hours.");


      let prizeAmount = await cosmicGame.prizeAmount();
      let charityAmount = await cosmicGame.charityAmount();
      let raffleAmount = await cosmicGame.raffleAmount();
      await cosmicGame.connect(addr2).claimPrize();
      let prizeAmount2 = await cosmicGame.prizeAmount();
      let balance = await ethers.provider.getBalance(cosmicGame.address);
      let expectedprizeAmount = balance.mul(25).div(100);
      expect(prizeAmount2).to.equal(expectedprizeAmount);

      // after the prize has been claimed, let's bid again!

      await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("There is no last bidder.");

      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr1).bid("", {value: bidPrice});
      await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

      prizeTime = await cosmicGame.timeUntilPrize();
      expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
      await ethers.provider.send("evm_mine");

      prizeAmount = await cosmicGame.prizeAmount();
      charityAmount = await cosmicGame.charityAmount();
      await cosmicGame.connect(addr1).claimPrize();
      prizeAmount2 = await cosmicGame.prizeAmount();
      balance = await ethers.provider.getBalance(cosmicGame.address);
      expectedPrizeAmount = balance.mul(25).div(100);
      expect(prizeAmount2).to.equal(expectedPrizeAmount);


      // 3 hours after the deadline, anyone should be able to claim the prize
      await cosmicGame.connect(addr1).bid("", {value: bidPrice});
      prizeTime = await cosmicGame.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
      await ethers.provider.send("evm_mine");

      await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("Only the last bidder can claim the prize during the first 24 hours.");

      await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      await ethers.provider.send("evm_mine");

      await cosmicGame.connect(addr2).claimPrize();
      expect(await cosmicGame.lastBidder()).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Should be possible to bid with RandomWalk token", async function () {
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      let tokenPrice = await randomWalkNFT.getMintPrice();
      await randomWalkNFT.connect(addr1).mint({value: tokenPrice});	// tokenId=0

      // switch to another account and attempt to use tokenId=0 which we don't own
      await expect(cosmicGame.connect(owner).bidWithRWLK(ethers.BigNumber.from("0"), "")).to.be.revertedWith("You must be the owner of the RandomWalkNFT."); //tokenId=0

      tokenPrice = await randomWalkNFT.getMintPrice();
      let tx = await randomWalkNFT.connect(owner).mint({value: tokenPrice});
      let receipt = await tx.wait();
      let topic_sig = randomWalkNFT.interface.getEventTopic("MintEvent");
      let log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
      let parsed_log = randomWalkNFT.interface.parseLog(log);
      let token_id = parsed_log.args[0]
      await cosmicGame.connect(owner).bidWithRWLK(token_id, "");

      // try to mint again using the same tokenId
      await expect(cosmicGame.connect(owner).bidWithRWLK(ethers.BigNumber.from(token_id), "")).to.be.revertedWith("This RandomWalkNFT has already been used for bidding."); //tokenId=0
    });
    it("Should not be possible to mint CosmicSignature token by anyone", async function () {

      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
	await expect(cosmicSignature.connect(owner).mint(owner.address)).to.be.revertedWith("Only the CosmicGame contract can mint.")
     });

    it("Should be possible to setTokenName()", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      let bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr1).bid("", {value:bidPrice});
      let prizeTime = await cosmicGame.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
      let tx = await cosmicGame.connect(addr1).claimPrize();
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
            .to.be.revertedWith("setTokenName caller is not owner nor approved.");
      await expect(cosmicSignature.connect(addr1)
            .setTokenName(token_id,"012345678901234567890123456789012"))
            .to.be.revertedWith("Token name is too long.");
    });
    it("Should not be possible to mint ERC721 tokens by anyone", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      await expect(cosmicSignature.connect(addr1).mint(addr1.address)).
            to.be.revertedWith("Only the CosmicGame contract can mint.");
	});
    it("Should not be possible to donate 0 value", async function () {
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      await expect(cosmicGame.connect(addr1).donate()).
            to.be.revertedWith("Donation amount must be greater than 0.");
    });
    it("Raffle deposits sent should match raffle deposits received", async function () {
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet} = await loadFixture(deployCosmic);
      [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await ethers.getSigners();

      let topic_sig = raffleWallet.interface.getEventTopic("RaffleDepositEvent");
      let tx,receipt,log,parsed_log,bidPrice,winner;

      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr1).bid("", {value:bidPrice});
      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr2).bid("", {value:bidPrice});
      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr3).bid("", {value:bidPrice});

      let prizeTime = await cosmicGame.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
      await ethers.provider.send("evm_mine");

      tx = await cosmicGame.connect(addr3).claimPrize();
      receipt = await tx.wait();
      // log indices: 8,9,10 where the b1167d06 event signature (RaffleDeposit) is located
      parsed_log = raffleWallet.interface.parseLog(receipt.logs[8]);
      expect(parsed_log.args.deposit_id.toNumber()).to.equal(0);
      parsed_log = raffleWallet.interface.parseLog(receipt.logs[9]);
      expect(parsed_log.args.deposit_id.toNumber()).to.equal(1);
      parsed_log = raffleWallet.interface.parseLog(receipt.logs[10]);
      expect(parsed_log.args.deposit_id.toNumber()).to.equal(2);

      // NFT Raffle winners
      expect(await cosmicSignature.totalSupply()).to.equal(1);
      w1 = await cosmicGame.raffleNFTWinners(addr1.address);
      i1 = await cosmicSignature.balanceOf(addr1.address);
      for (let i = 0; i < w1; i++) {
        await cosmicGame.connect(addr1).claimRaffleNFT();
      }
      await expect(cosmicGame.connect(addr1).claimRaffleNFT()).to.be.revertedWith("You have no unclaimed raffle NFTs.");
      expect(await cosmicSignature.balanceOf(addr1.address)).to.equal(w1.add(i1));

      w2 = await cosmicGame.raffleNFTWinners(addr2.address);
      i2 = await cosmicSignature.balanceOf(addr2.address);
      for (let i = 0; i < w2; i++) {
        await cosmicGame.connect(addr2).claimRaffleNFT();
      }
      await expect(cosmicGame.connect(addr2).claimRaffleNFT()).to.be.revertedWith("You have no unclaimed raffle NFTs.");
      expect(await cosmicSignature.balanceOf(addr2.address)).to.equal(w2.add(i2));

      w3 = await cosmicGame.raffleNFTWinners(addr3.address);
      i3 = await cosmicSignature.balanceOf(addr3.address);
      for (let i = 0; i < w3; i++) {
        await cosmicGame.connect(addr3).claimRaffleNFT();
      }
      await expect(cosmicGame.connect(addr3).claimRaffleNFT()).to.be.revertedWith("You have no unclaimed raffle NFTs.");
      expect(await cosmicSignature.balanceOf(addr3.address)).to.equal(w3.add(i3));
      expect(await cosmicSignature.totalSupply()).to.equal(6);

      // let's begin a new round
      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr1).bid("", {value:bidPrice});
      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr2).bid("", {value:bidPrice});
      bidPrice = await cosmicGame.getBidPrice();
      await cosmicGame.connect(addr3).bid("", {value:bidPrice});

      prizeTime = await cosmicGame.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
      await ethers.provider.send("evm_mine");

      let raffleAmount = await cosmicGame.raffleAmount();
      tx = await cosmicGame.connect(addr3).claimPrize();
      receipt = await tx.wait();
      // log indices: 8,9,10 where the b1167d06 event signature (RaffleDeposit) is located
      parsed_log = raffleWallet.interface.parseLog(receipt.logs[8]);
      expect(parsed_log.args.deposit_id.toNumber()).to.equal(3);
      expect(parsed_log.args.round.toNumber()).to.equal(1);
      expect(parsed_log.args.amount.toNumber()).to.equal(raffleAmount.toNumber());

      parsed_log = raffleWallet.interface.parseLog(receipt.logs[9]);
      expect(parsed_log.args.deposit_id.toNumber()).to.equal(4);
      expect(parsed_log.args.round.toNumber()).to.equal(1);
      expect(parsed_log.args.amount.toNumber()).to.equal(raffleAmount.toNumber());

      parsed_log = raffleWallet.interface.parseLog(receipt.logs[10]);
      expect(parsed_log.args.deposit_id.toNumber()).to.equal(5);
      expect(parsed_log.args.round.toNumber()).to.equal(1);
      expect(parsed_log.args.amount.toNumber()).to.equal(raffleAmount.toNumber());

      expect(await cosmicSignature.totalSupply()).to.equal(7);
      w1 = await cosmicGame.raffleNFTWinners(addr1.address);
      i1 = await cosmicSignature.balanceOf(addr1.address);
      for (let i = 0; i < w1; i++) {
        await cosmicGame.connect(addr1).claimRaffleNFT();
      }
      await expect(cosmicGame.connect(addr1).claimRaffleNFT()).to.be.revertedWith("You have no unclaimed raffle NFTs.");
      expect(await cosmicSignature.balanceOf(addr1.address)).to.equal(w1.add(i1));

      w2 = await cosmicGame.raffleNFTWinners(addr2.address);
      i2 = await cosmicSignature.balanceOf(addr2.address);
      for (let i = 0; i < w2; i++) {
        await cosmicGame.connect(addr2).claimRaffleNFT();
      }
      await expect(cosmicGame.connect(addr2).claimRaffleNFT()).to.be.revertedWith("You have no unclaimed raffle NFTs.");
      expect(await cosmicSignature.balanceOf(addr2.address)).to.equal(w2.add(i2));

      w3 = await cosmicGame.raffleNFTWinners(addr3.address);
      i3 = await cosmicSignature.balanceOf(addr3.address);
      for (let i = 0; i < w3; i++) {
        await cosmicGame.connect(addr3).claimRaffleNFT();
      }
      await expect(cosmicGame.connect(addr3).claimRaffleNFT()).to.be.revertedWith("You have no unclaimed raffle NFTs.");
      expect(await cosmicSignature.balanceOf(addr3.address)).to.equal(w3.add(i3));
      expect(await cosmicSignature.totalSupply()).to.equal(12);


    })
    it("There is an exeuction path for all bidders being RWalk token bidders", async function () {
     async function mint_rwalk(a) {
      tokenPrice = await randomWalkNFT.getMintPrice();
      let tx = await randomWalkNFT.connect(a).mint({value: tokenPrice});
      let receipt = await tx.wait();
      let topic_sig = randomWalkNFT.interface.getEventTopic("MintEvent");
      let log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
      let parsed_log = randomWalkNFT.interface.parseLog(log);
      let token_id = parsed_log.args[0]
      return token_id;
    }

      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet} = await loadFixture(deployCosmic);
      [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await ethers.getSigners();
      let token_id = await mint_rwalk(addr1)
      await  cosmicGame.connect(addr1).bidWithRWLK(token_id,"bidWithRWLK");
      token_id = await mint_rwalk(addr2)
      await  cosmicGame.connect(addr2).bidWithRWLK(token_id,"bidWithRWLK");
      token_id = await mint_rwalk(addr3)
      await  cosmicGame.connect(addr3).bidWithRWLK(token_id,"bidWithRWLK");
      token_id = await mint_rwalk(addr4)
      await  cosmicGame.connect(addr4).bidWithRWLK(token_id,"bidWithRWLK");
      token_id = await mint_rwalk(addr5)
      await  cosmicGame.connect(addr5).bidWithRWLK(token_id,"bidWithRWLK");

      let prizeTime = await cosmicGame.timeUntilPrize();
      await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
      await ethers.provider.send("evm_mine");
      await expect(cosmicGame.connect(addr5).claimPrize()).not.to.be.revertedWith('panic code 0x12'); // divide by zero
	});
  });
})
