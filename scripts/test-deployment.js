// Confirms that deployed contracts are fully operational
const hre = require("hardhat");
const { expect } = require("chai");
async function getCosmicGameContract() {

  let cosmicGameAddr = process.env.COSMIC_GAME_ADDRESS;
  if ((typeof cosmicGameAddr === 'undefined') || (cosmicGameAddr.length != 42) )  {
      console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
	  process.exit(1);
  }
  let cosmicGame = await ethers.getContractAt("CosmicGame",cosmicGameAddr)
  return cosmicGame;
}

async function main() {
  let privKey = process.env.PRIVKEY;
  if ((typeof privKey === 'undefined') || (privKey.length == 0) )  {
      console.log("Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js");
      process.exit(1);
  }
  let testingAcct = new hre.ethers.Wallet(privKey,hre.ethers.provider);
  let cosmicGame = await getCosmicGameContract();

  let bidPrice = await cosmicGame.getBidPrice();
  let tx = await cosmicGame.connect(testingAcct).bid("test bid",{value:bidPrice});
  let receipt = await tx.wait();
  let topic_sig = cosmicGame.interface.getEventTopic("BidEvent");
  let event_logs = receipt.logs.filter(x=>x.topics.indexOf(topic_sig)>=0);
  let parsed_log = cosmicGame.interface.parseLog(event_logs[0])
  expect(parsed_log.args.message).to.equal("test bid");
  expect(parsed_log.args.bidPrice).to.equal(bidPrice);
  expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);

  console.log("Test result: success");
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

