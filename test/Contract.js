const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const {basicDeployment} = require("../src/Deploy.js");

describe("Contract", function () {
  async function deployCosmic(deployerAcct) {
	  let contractDeployerAcct;
      [contractDeployerAcct] = await ethers.getSigners();
      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT} = await basicDeployment(contractDeployerAcct,"",0,"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",true);

    return {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet};
  }
    it("Contract can win prize", async function () {

      const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT} = await loadFixture(deployCosmic);

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
    const BidderContract = await ethers.getContractFactory("BidderContract");
	let bidderContract = await BidderContract.connect(owner).deploy(cosmicGame.address);
    await bidderContract.deployed();


    let bidPrice;
	bidPrice = await cosmicGame.getBidPrice();
	await cosmicGame.connect(owner).bid("owner bids", {value: bidPrice});
    bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(addr1).bid("addr1 bids", {value: bidPrice});
    bidPrice = await cosmicGame.getBidPrice();
    await cosmicGame.connect(addr2).bid("addr2 bids", {value: bidPrice});

    let randomWalkAddr = await cosmicGame.randomWalk();
    let randomWalk = await ethers.getContractAt("RandomWalkNFT",randomWalkAddr);
    let rwalkPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(owner).setApprovalForAll(cosmicGame.address, true);
    await randomWalk.connect(owner).setApprovalForAll(bidderContract.address, true);
    let tx = await randomWalk.connect(owner).mint({value: rwalkPrice});
    let receipt = await tx.wait();
    let topic_sig = randomWalk.interface.getEventTopic("MintEvent");
    let log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
    let parsed_log = randomWalk.interface.parseLog(log);
    let donated_token_id = parsed_log.args.tokenId;
    bidPrice = await cosmicGame.getBidPrice();
    await randomWalk.connect(owner).transferFrom(owner.address,bidderContract.address,donated_token_id)
    await bidderContract.connect(owner).doBidAndDonate(randomWalkAddr,donated_token_id,{value:bidPrice});

    bidPrice = await cosmicGame.getBidPrice();
    await bidderContract.connect(owner).doBid({value:bidPrice});

    rwalkPrice = await randomWalk.getMintPrice();
    tx = await randomWalk.connect(owner).mint({value: rwalkPrice});
    receipt = await tx.wait();
    topic_sig = randomWalk.interface.getEventTopic("MintEvent");
    log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
    parsed_log = randomWalk.interface.parseLog(log);
    let rwalk_token_id = parsed_log.args.tokenId;
    await randomWalk.connect(owner).transferFrom(owner.address,bidderContract.address,rwalk_token_id)
    await bidderContract.connect(owner).doBidRWalk(rwalk_token_id);
    let prizeTime = await cosmicGame.timeUntilPrize();
    await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
    tx = await bidderContract.connect(owner).doClaim();
    receipt = await tx.wait();
    topic_sig = cosmicSignature.interface.getEventTopic("MintEvent");
	let mint_logs = receipt.logs.filter(x=>x.topics.indexOf(topic_sig)>=0);
	await bidderContract.withdrawAll();

	for (let i=0; i<mint_logs.length; i++) {
		let parsed_log = cosmicSignature.interface.parseLog(mint_logs[i]);
		if (parsed_log.args.owner != bidderContract.address) {
			continue;
		}
		let tokId = parsed_log.args.tokenId;
		let ownerAddr = await cosmicSignature.ownerOf(tokId);
		expect(ownerAddr).to.equal(owner.address);
	}
	let donatedTokenOwner = await randomWalk.ownerOf(donated_token_id);
	expect(donatedTokenOwner).to.equal(owner.address);

  });
})