// Comment-202409255 relates.
const { basicDeployment } = require("../src/Deploy.js");

const fs = require("fs");

task("deploy-cosmicsignature", "Deploys contracts to a network", async (args, hre) => {
	const configFile = args.deployconfig;
	if (typeof configFile === "undefined" || configFile.length == 0) {
		console.log("Please provide config file : --deployconfig [file_path]");
		return;
	}
	const config_params_file = fs.readFileSync(configFile, "utf8");
	let config_params;
	try {
		config_params = JSON.parse(config_params_file);
	} catch (err) {
		console.error("Error while parsing JSON data:", err);
		return;
	}
	const param_copy = JSON.parse(JSON.stringify(config_params));
	param_copy.privKey = '*******';
	console.log("Using file:");
	console.log(param_copy);
	const deployerAcct = new hre.ethers.Wallet(config_params.privKey, hre.ethers.provider);
	if (config_params.charityAddr.length === 0) {
		const signers = await hre.ethers.getSigners();
		config_params.charityAddr = signers[1].address;
	}
	const {
		cosmicSignatureGameProxy,
		cosmicSignatureNft,
		cosmicSignatureToken,
		cosmicSignatureDao,
		charityWallet,
		prizesWallet,
		randomWalkNft,
		stakingWalletCosmicSignatureNft,
		stakingWalletRandomWalkNft,
		marketingWallet,
		cosmicSignatureGame,
	} = await basicDeployment(
		deployerAcct,
		config_params.randomWalkNftAddr,
		config_params.activationTime,
		config_params.charityAddr,
		config_params.transferOwnership

		// // todo-0 There is no such thing as runtime and maintenance modes any more. Now activation time plays that role.
		// // todo-0 So I have commented this out.
		// config_params.switchToRuntime
	);
	console.log("contracts deployed");
	if (config_params.donateToContract == true) {
		const ethValue = "2";
		const donationAmount = hre.ethers.parseEther(ethValue);
		await cosmicSignatureGameProxy.connect(deployerAcct).donate({value:donationAmount});
		console.log("Donated " + ethValue + " ETH to contract.");
	}
	console.log("CosmicSignatureGame proxy address:", await cosmicSignatureGameProxy.getAddress());
	console.log("CosmicSignatureNft address:", await cosmicSignatureNft.getAddress());
	console.log("CosmicSignatureToken address:", await cosmicSignatureToken.getAddress());
	console.log("CosmicSignatureDao address:", await cosmicSignatureDao.getAddress());
	console.log("CharityWallet address:", await charityWallet.getAddress());
	console.log("PrizesWallet address:", await prizesWallet.getAddress());
	console.log("RandomWalkNFT address:", await randomWalkNft.getAddress());
	console.log("StakingWalletCosmicSignatureNft address:", await stakingWalletCosmicSignatureNft.getAddress());
	console.log("StakingWalletRandomWalkNft address:", await stakingWalletRandomWalkNft.getAddress());
	console.log("MarketingWallet address:", await marketingWallet.getAddress());
	console.log("CosmicSignatureGame address:", await cosmicSignatureGame.getAddress());
	console.log(
		"INSERT INTO cg_contracts VALUES('" +
			await cosmicSignatureGameProxy.getAddress() +
			"','" +
			await cosmicSignatureNft.getAddress() +
			"','" +
			await cosmicSignatureToken.getAddress() +
			"','" +
			await cosmicSignatureDao.getAddress() +
			"','" +
			await charityWallet.getAddress() +
			"','" +
			await prizesWallet.getAddress() +
			"','" +
			await randomWalkNft.getAddress() +
			"','" +
			await stakingWalletCosmicSignatureNft.getAddress() +
			"','" +
			await stakingWalletRandomWalkNft.getAddress() +
			"','" +
			await marketingWallet.getAddress() +
			"','" +

			// Issue. According to Comment-202412059, this is the same as `cosmicSignatureGameProxy`.
			await cosmicSignatureGame.getAddress() +

			"')",
	);
}).addParam("deployconfig", "Config file (JSON)");
