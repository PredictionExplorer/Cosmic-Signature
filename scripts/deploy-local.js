const hre = require("hardhat");
const {basicDeployment} = require("../src/Deploy.js");

async function main() {

  const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT    } = await basicDeployment(undefined,0,undefined,true);
  [owner, addr1] = await ethers.getSigners();
  let etherStr = "10";
  let donationAmount = hre.ethers.utils.parseEther(etherStr);
  await cosmicGame.connect(addr1).donate({value: donationAmount});
  console.log("CosmicGame address:", cosmicGame.address);
  console.log("CosmicToken address:", cosmicToken.address);
  console.log("CosmicSignature address:", cosmicSignature.address);
  console.log("CharityWallet address:", charityWallet.address);
  console.log("CosmicDAO address", cosmicDAO.address);
  console.log("RaffleWallet address:", raffleWallet.address);
  console.log("randomWalkNFT address:", randomWalkNFT.address);
  console.log("Donation of "+etherStr+" ETH complete");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
