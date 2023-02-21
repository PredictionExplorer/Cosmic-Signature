async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const BiddingWar = await hre.ethers.getContractFactory("BidingWar");
  const BiddingWarHRE = await BiddingWar.deploy();
  await BiddingWarHRE.deployed();

  console.log("BiddingWarHRE address:", BiddingWarHRE.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
