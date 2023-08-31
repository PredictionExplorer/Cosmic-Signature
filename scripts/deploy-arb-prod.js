const hre = require("hardhat");
const {basicDeployment} = require("../src/Deploy.js");
// Deploy on Arbitrum
const transferOwnership = true;
const activationTime = 0;
const charityAddr = "0x41626BA92c0C2a1aD38fC83920300434082B1870"; //https://l2beat.com/donate
const randomWalkAddr = "0x895a6F444BE4ba9d124F61DF736605792B35D66b";
async function main() {

  let privKey = process.env.PRIVKEY;
  if ((typeof privKey === 'undefined') || (privKey.length == 0) )  {
	  console.log("Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js");
	  process.exit(1);
  }
  let deployerAcct = new hre.ethers.Wallet(privKey,hre.ethers.provider);
  const {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT    } = await basicDeployment(deployerAcct,undefined,0,undefined,true);
  console.log("Deploying from "+deployerAcct.address);
  console.log("CosmicGame address:", cosmicGame.address);
  console.log("CosmicToken address:", cosmicToken.address);
  console.log("CosmicSignature address:", cosmicSignature.address);
  console.log("CharityWallet address:", charityWallet.address);
  console.log("CosmicDAO address", cosmicDAO.address);
  console.log("RaffleWallet address:", raffleWallet.address);
  console.log("randomWalkNFT address:", randomWalkNFT.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
