"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { format } = require("node:util");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const privateKey = "test-only-private-key-sentinel";
const configuredPrivateKey = "test-only-configured-private-key-sentinel";
const apiKey = "test-only-api-key-sentinel";
const ownerAddress = "0x0000000000000000000000000000000000000001";
const implementationAddress = "0x0000000000000000000000000000000000000002";

function loadModule(file_, modules_, console_, extraGlobals_ = {}) {
	const module_ = { exports: {} };
	vm.runInNewContext(fs.readFileSync(path.join(root, file_), "utf8"), {
		module: module_,
		require(name_) {
			assert(Object.hasOwn(modules_, name_), `Unexpected dependency: ${name_}`);
			return modules_[name_];
		},
		console: console_,
		...extraGlobals_,
	}, { filename: file_ });
	return module_.exports;
}

function createHarness(configurationKey_ = "", failDeployment_ = false, invalidWallet_ = false) {
	const config_ = {
		deployerPrivateKey: configurationKey_,
		cosmicSignatureGameContractName: "CosmicSignatureGame",
		randomWalkNftAddress: ownerAddress,
		charityAddress: ownerAddress,
		transferContractOwnershipToCosmicSignatureDao: false,
		roundActivationTime: 0,
		donateEthToCosmicSignatureGame: false,
		reportFilePath: "report.json",
		unrelatedCredential: { apiKey },
	};
	const files_ = new Map([["deploy.json", JSON.stringify(config_)]]);
	const logs_ = [];
	const parsedConfigurations_ = [];
	const signerKeys_ = [];
	const tasks_ = new Map();
	const console_ = Object.fromEntries(["info", "warn", "error", "log"].map(name_ => [name_, (...args_) => logs_.push(format(...args_))]));
	const fileSystem_ = {
		existsSync: file_ => files_.has(file_),
		promises: {
			readFile: file_ => Promise.resolve(files_.get(file_)),
			mkdir: () => Promise.resolve(),
			writeFile: (file_, contents_) => { files_.set(file_, contents_); return Promise.resolve(); },
		},
	};
	const hre_ = {
		network: { name: "arbitrumSepolia" },
		ethers: {
			provider: {},
			Wallet: class {
				constructor(key_) {
					if (invalidWallet_) throw new Error(`Invalid wallet value: ${key_}`);
					signerKeys_.push(key_);
					this.privateKey = key_;
					this.address = ownerAddress;
				}
			},
			getContractFactory: (name_, signer_) => Promise.resolve({ name: name_, signer: signer_ }),
		},
		run(name_) { assert.equal(name_, "compile"); return Promise.resolve(); },
		upgrades: {
			erc1967: { getImplementationAddress: () => Promise.resolve(ownerAddress) },
			upgradeProxy(proxy_, factory_, options_) {
				assert.equal(options_.call, "reinitialize");
				assert.equal(options_.unsafeAllowRenames, false);
				assert.equal(options_.unsafeSkipStorageCheck, false);
				return Promise.resolve();
			},
		},
	};
	const modules_ = {
		"node:os": require("node:os"),
		"node:path": path,
		"node:fs": fileSystem_,
		"hardhat/config": {
			vars: { get: () => privateKey },
			task(name_, description_, action_) {
				tasks_.set(name_, action_);
				return { addParam() { return this; } };
			},
		},
		"../../src/Helpers.js": {
			waitForTransactionReceipt: value_ => value_,
			safeErc1967GetChangedImplementationAddress: () => Promise.resolve(implementationAddress),
		},
		"../../src/ContractDeploymentHelpers.js": {
			deployContractsAdvanced(signer_) {
				assert.equal(signer_.address, ownerAddress);
				if (failDeployment_) return Promise.reject(new Error("Simulated deployment failure"));
				const names_ = ["cosmicSignatureToken", "randomWalkNft", "cosmicSignatureNft", "prizesWallet", "stakingWalletRandomWalkNft", "stakingWalletCosmicSignatureNft", "marketingWallet", "charityWallet", "cosmicSignatureDao", "cosmicSignatureGameImplementation", "cosmicSignatureGameProxy"];
				return Promise.resolve(Object.fromEntries(names_.map(name_ => [name_ + "Address", ownerAddress])));
			},
		},
	};
	const exports_ = loadModule("tasks/src/cosmic-signature-tasks.js", modules_, console_, {
		JSON: {
			parse(value_) { const parsed_ = JSON.parse(value_); parsedConfigurations_.push(parsed_); return parsed_; },
			stringify: JSON.stringify,
		},
	});
	return { config: config_, files: files_, logs: logs_, parsedConfigurations: parsedConfigurations_, signerKeys: signerKeys_, tasks: tasks_, console: console_, fileSystem: fileSystem_, hre: hre_, exports: exports_ };
}

function assertNoCredentials(logs_, secrets_) {
	for (const secret_ of secrets_) assert(!logs_.join("\n").includes(secret_), "Captured output contains a test credential");
}

async function main() {
	for (const configuredKey_ of ["", configuredPrivateKey]) {
		await test(`deployment logs only public information with ${configuredKey_ ? "fixture" : "resolved"} credentials`, async () => {
			const harness_ = createHarness(configuredKey_);
			await harness_.tasks.get("deploy-cosmic-signature-contracts")({ deployconfigfilepath: "deploy.json" }, harness_.hre);
			assert.deepEqual(harness_.parsedConfigurations[0], harness_.config);
			assert.deepEqual(harness_.signerKeys, [configuredKey_ || privateKey]);
			assert(harness_.logs.some(line_ => line_.includes(ownerAddress)));
			assertNoCredentials(harness_.logs, [privateKey, configuredPrivateKey, apiKey]);
			assertNoCredentials([harness_.files.get("report.json")], [privateKey, configuredPrivateKey, apiKey]);
		});
	}
	await test("upgrade resolves its signer without mutating configuration or exposing credentials", async () => {
		const harness_ = createHarness();
		harness_.files.set("upgrade.json", JSON.stringify({ deploymentConfigurationFilePath: "deploy.json", reportFilePath: "upgrade-report.json", newCosmicSignatureGameContractName: "CosmicSignatureGameV3", newInitializerMethodName: "reinitialize", unsafeAllowRenames: false, unsafeSkipStorageCheck: false }));
		harness_.files.set("report.json", JSON.stringify({ cosmicSignatureGameProxyAddress: ownerAddress }));
		await harness_.tasks.get("upgrade-cosmic-signature-game")({ upgradeconfigfilepath: "upgrade.json" }, harness_.hre);
		assert.deepEqual(harness_.parsedConfigurations[1], harness_.config);
		assert.deepEqual(harness_.signerKeys, [privateKey]);
		assertNoCredentials(harness_.logs, [privateKey, apiKey]);
	});
	await test("invalid signer errors do not include rejected credential values", async () => {
		const harness_ = createHarness("", false, true);
		await assert.rejects(harness_.tasks.get("deploy-cosmic-signature-contracts")({ deployconfigfilepath: "deploy.json" }, harness_.hre), error_ => {
			assert(!error_.message.includes(privateKey));
			return /private key is missing or invalid/.test(error_.message);
		});
	});
	for (const [taskName_, malformedFile_] of [
		["deploy-cosmic-signature-contracts", "deploy.json"],
		["register-cosmic-signature-contracts", "deploy.json"],
		["register-cosmic-signature-contracts", "report.json"],
		["upgrade-cosmic-signature-game", "upgrade.json"],
		["upgrade-cosmic-signature-game", "deploy.json"],
		["upgrade-cosmic-signature-game", "report.json"],
		["register-upgraded-cosmic-signature-game", "upgrade.json"],
		["register-upgraded-cosmic-signature-game", "upgrade-report.json"],
	]) {
		await test(`${taskName_} does not expose malformed ${malformedFile_} contents`, async () => {
			const harness_ = createHarness();
			const secret_ = "KEYSECRET";
			harness_.files.set("upgrade.json", JSON.stringify({ deploymentConfigurationFilePath: "deploy.json", reportFilePath: "upgrade-report.json" }));
			harness_.files.set("report.json", JSON.stringify({ cosmicSignatureGameProxyAddress: ownerAddress }));
			if (taskName_ === "register-upgraded-cosmic-signature-game") harness_.files.set("upgrade-report.json", "{}");
			harness_.files.set(malformedFile_, secret_);
			const args_ = taskName_.includes("upgrade") ? { upgradeconfigfilepath: "upgrade.json" } : { deployconfigfilepath: "deploy.json" };
			await assert.rejects(harness_.tasks.get(taskName_)(args_, harness_.hre), error_ => {
				assert.match(error_.message, /^Invalid (deployment|upgrade) (configuration|report) JSON; its contents are not logged\.$/);
				assert.equal(error_.cause, undefined);
				assertNoCredentials([format("%o", error_), ...harness_.logs], [secret_, privateKey, apiKey]);
				return true;
			});
		});
	}
	for (const failDeployment_ of [false, true]) {
		await test(`live deployment never writes its generated key, including ${failDeployment_ ? "failure" : "success"}`, async () => {
			const harness_ = createHarness("", failDeployment_);
			const helper_ = loadModule("live-blockchain-testing/src/cosmic-signature-contracts-deployment/helpers.js", {
				"node:path": path,
				"node:fs": harness_.fileSystem,
				hardhat: harness_.hre,
				"../../../tasks/src/cosmic-signature-tasks.js": harness_.exports,
			}, harness_.console);
			const suppliedKey_ = "test-only-live-owner-key-sentinel";
			const deployment_ = helper_.runDeployCosmicSignatureContracts(suppliedKey_, "CosmicSignatureGame", ownerAddress, "live-config.json", "live-report.json");
			if (failDeployment_) await assert.rejects(deployment_, /Simulated deployment failure/);
			else await deployment_;
			assert.deepEqual(harness_.signerKeys, [suppliedKey_]);
			assert.equal(JSON.parse(harness_.files.get("live-config.json")).deployerPrivateKey, "");
			assertNoCredentials([...harness_.logs, harness_.files.get("live-config.json"), harness_.files.get("live-report.json") ?? ""], [suppliedKey_, privateKey, apiKey]);
		});
	}
	for (const [seedKind_, secretSeed_, valid_] of [
		["valid", "0x123456789abcdef", true],
		["malformed", "invalid-test-only-seed-sentinel", false],
		["negative", "-123456789", false],
		["oversized", "0x1" + "0".repeat(64), false],
	]) {
		await test(`live signer output does not expose a ${seedKind_} seed or derived keys`, () => {
			const source_ = fs.readFileSync(path.join(root, "live-blockchain-testing/src/live-blockchain-tests.js"), "utf8");
			const functions_ = source_.slice(source_.indexOf("function createAccountSigners()"), source_.indexOf("// #region `main`"));
			const harness_ = createHarness();
			const context_ = vm.createContext({
				console: harness_.console,
				nodeOsModule: require("node:os"),
				hre: harness_.hre,
				vars: { get: () => secretSeed_ },
				state: { accountEthPrizeRoundNums: {} },
				defaultAccountPrivateKeySeed: 1n,
				accountPrivateKeySeedSalts: { owner: 2n, bidder1: 3n },
				generateRandomUInt256: () => 4n,
				uint256ToPaddedHexString: value_ => "0x" + value_.toString(16).padStart(64, "0"),
				generateAccountPrivateKeyFromSeed: value_ => "derived-key-sentinel-" + value_.toString(16),
			});
			vm.runInContext(functions_, context_);
			if (valid_) vm.runInContext("createAccountSigners()", context_);
			else assert.throws(() => vm.runInContext("createAccountSigners()", context_), error_ => {
				assert(!error_.message.includes(secretSeed_));
				return /seed is invalid/.test(error_.message);
			});
			assertNoCredentials(harness_.logs, [secretSeed_, ...harness_.signerKeys]);
		});
	}
}

main().catch(error_ => { console.error(error_); process.exitCode = 1; });
