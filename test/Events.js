const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CosmicAI", function () {
  let CosmicGame, cosmicGame, CosmicToken, CharityWallet, charityWallet, token, CosmicSignature, nft, RandomWalkNFT, randomWalk;
  let owner, charity, donor, bidder1, bidder2, bidder3, daoOwner;;
  let INITIAL_AMOUNT = ethers.utils.parseEther('10');

  beforeEach(async function () {

    [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();

    CosmicGame = await ethers.getContractFactory("CosmicGame");
    cosmicGame = await CosmicGame.deploy();
    await cosmicGame.deployed();

    CosmicToken = await ethers.getContractFactory("CosmicToken");
    token = await CosmicToken.deploy();
    await token.deployed();
    token.transferOwnership(cosmicGame.address);

    CharityWallet = await ethers.getContractFactory("CharityWallet");
    charityWallet = await CharityWallet.deploy();
    await charityWallet.transferOwnership(daoOwner.address);

    CosmicSignature = await ethers.getContractFactory("CosmicSignature");
    nft = await CosmicSignature.deploy(cosmicGame.address);
    await nft.deployed();

    RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
    randomWalk = await RandomWalkNFT.deploy();
    await randomWalk.deployed();

    // Set contracts
    await cosmicGame.setTokenContract(token.address);
    await cosmicGame.setNftContract(nft.address);
    await cosmicGame.setRandomWalk(randomWalk.address);
    await cosmicGame.setActivationTime(0);
    await cosmicGame.setCharity(charityWallet.address);

    await cosmicGame.donate({value: INITIAL_AMOUNT});

  });

  it("should emit the correct events in the CosmicSignature contract", async function () {
    let bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(bidder1).bid("", { value: bidPrice });
    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");
    const tx = await cosmicGame.connect(bidder1).claimPrize();
    await tx.wait();
    let seed = await nft.seeds(0);
    expect(tx).to.emit(nft, "MintEvent").withArgs(0, bidder1.address, seed);

    const tx2 = await cosmicGame.connect(bidder1).claimRaffleNFT();
    await tx2.wait();
    seed = await nft.seeds(1);
    expect(tx2).to.emit(nft, "MintEvent").withArgs(1, bidder1.address, seed);

    await expect(nft.connect(bidder1).setTokenName(1, "abc123"))
      .to.emit(nft, "TokenNameEvent")
      .withArgs(1, "abc123");
  });

  it("should emit the correct events in the CharityWallet contract", async function () {
    // DonationReceivedEvent
    let bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(bidder1).bid("", { value: bidPrice });
    let charityAmount = await cosmicGame.charityAmount();
    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");
    await expect(cosmicGame.connect(bidder1).claimPrize())
      .to.emit(charityWallet, "DonationReceivedEvent")
      .withArgs(cosmicGame.address, charityAmount);
    let balance = await ethers.provider.getBalance(charityWallet.address);
    expect(balance).to.equal(charityAmount);

    // CharityUpdatedEvent
    await expect(charityWallet.connect(daoOwner).setCharity(bidder3.address))
      .to.emit(charityWallet, "CharityUpdatedEvent")
      .withArgs(bidder3.address);

    // CharityUpdatedEvent
    await expect(charityWallet.connect(bidder2).send())
      .to.emit(charityWallet, "DonationSentEvent")
      .withArgs(bidder3.address, balance);
  });


  it("should emit DonationEvent on successful donation", async function () {
    const donationAmount = ethers.utils.parseEther("1");

    await expect(
      cosmicGame.connect(donor).donate({ value: donationAmount })
    )
      .to.emit(cosmicGame, "DonationEvent")
      .withArgs(donor.address, donationAmount);

    const contractBalance = await ethers.provider.getBalance(cosmicGame.address);
    expect(contractBalance).to.equal(donationAmount.add(INITIAL_AMOUNT));
  });

  it("should emit PrizeClaimEvent and update winner on successful prize claim", async function () {
    let bidPrice = await cosmicGame.getBidPrice();

    let mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});

    await randomWalk.connect(donor).setApprovalForAll(cosmicGame.address, true);

    await cosmicGame.connect(donor).bidAndDonateNFT("", randomWalk.address, 0, { value: bidPrice });

    bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(bidder1).bid("", { value: bidPrice });

    await expect(cosmicGame.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith("You are not the winner of the round.");
    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");

    let prizeAmountBeforeClaim = await cosmicGame.prizeAmount();

    await expect(cosmicGame.connect(bidder1).claimPrize())
      .to.emit(cosmicGame, "PrizeClaimEvent")
      .withArgs(0, bidder1.address, prizeAmountBeforeClaim);

    const winner = await cosmicGame.winners(0);
    expect(winner).to.equal(bidder1.address);

    const prizeAmountAfterClaim = await cosmicGame.prizeAmount();
    balance = await ethers.provider.getBalance(cosmicGame.address);
    expectedPrizeAmount = balance.mul(25).div(100);
    expect(prizeAmountAfterClaim).to.equal(expectedPrizeAmount);

    await expect(cosmicGame.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWith("The donated NFT does not exist.");
    await expect(cosmicGame.connect(bidder2).claimDonatedNFT(0)).to.be.revertedWith("You are not the winner of the round.");

    await cosmicGame.connect(bidder1).claimDonatedNFT(0);
    await expect(cosmicGame.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith("The NFT has already been claimed.");

    mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});
    mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});

    bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(bidder1).bid("", { value: bidPrice });

    await cosmicGame.connect(donor).bidWithRWLKAndDonateNFT(1, "hello", randomWalk.address, 2);

    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");

    prizeAmountBeforeClaim = await cosmicGame.prizeAmount();
    await expect(cosmicGame.connect(donor).claimPrize())
      .to.emit(cosmicGame, "PrizeClaimEvent")
      .withArgs(1, donor.address, prizeAmountBeforeClaim);

    await expect(cosmicGame.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWith("You are not the winner of the round.");

    expect(await randomWalk.balanceOf(donor.address)).to.equal(1);
    await cosmicGame.connect(donor).claimDonatedNFT(1);
    expect(await randomWalk.balanceOf(donor.address)).to.equal(2);

    expect(await cosmicGame.roundNum()).to.equal(2);

  });

  it("should not be possible to bid before activation", async function () {
    const sevenDays = 7 * 24 * 60 * 60;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;

    await cosmicGame.connect(owner).setActivationTime(timestampBefore + 100);

    let bidPrice = await cosmicGame.getBidPrice();
    await expect(cosmicGame.connect(bidder1).bid("", { value: bidPrice })).to.be.revertedWith("Not active yet.");

    await expect(bidder2.sendTransaction({
      to: cosmicGame.address,
      value: bidPrice
    })).to.be.revertedWith("Not active yet.");

    await ethers.provider.send('evm_increaseTime', [100]);
    await ethers.provider.send('evm_mine');

    await cosmicGame.connect(bidder1).bid("", { value: bidPrice });
    expect (await cosmicGame.getBidPrice() > bidPrice);

  });

  it("should be possible to bid by sending to the contract", async function () {
    let bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(bidder1).bid("", { value: bidPrice });
    expect(await cosmicGame.getBidPrice() > bidPrice);

    bidPrice = await cosmicGame.getBidPrice();
    await bidder2.sendTransaction({
      to: cosmicGame.address,
      value: bidPrice
    });
    expect(await cosmicGame.getBidPrice() > bidPrice);
  });

});
