// #region

"use strict";

// #endregion
// #region

const hre = require("hardhat");
const { basicDeployment } = require("./Deploy.js");

// #endregion
// #region `deployContractsForTesting`

/// This function is to be passed to `loadFixture`.
async function deployContractsForTesting() {
	const signers = await hre.ethers.getSigners();
	// todo-1 Both `owner` and charity accounts should be separate accounts, not the built-in ones.
	// todo-1 let deployerAcct = new hre.ethers.Wallet("0xfbb0d948732e1c57bed348838598aac6be168dddd9d5d0593965ac8e21becd53", hre.ethers.provider);
	// todo-1 let charityAcct = new hre.ethers.Wallet("0x48e859305ea5465f919bdd031a6bdaf756c3cc81d73b6435c23b82c9ac6639b2", hre.ethers.provider);
	// todo-1 Then send some 10 ETH to `deployerAcct`.
	const [owner, addr1,] = signers;
	const contracts =
		await basicDeployment(
			owner,
			"",
			addr1.address,
			false,
			1
		);
	// todo-1 Add `deployerAcct` and `charityAcct` to this object too.
	contracts.signers = signers;
	return contracts;
}

// #endregion
// #region

module.exports = {
	deployContractsForTesting,
};

// #endregion
