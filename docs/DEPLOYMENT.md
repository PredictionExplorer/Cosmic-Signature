

# Deployment

## Deploying CosmicGame contracts

Deployment of CosmicGame contracts is executed as Hardhat task. To check available tasks run:

	npx hardhat

You will see all available tasks, the task to deploy contracts is:

    deploy-cosmicgame

## Deployment process

### Step 1

Create config file (deployment.json) , with the following content

```
{
  privKey: '[YOUR_PRIVATE_KEY]',
  randomWalkAddr: '',
  activationTime: 0,
  charityAddr: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  transferOwnership: false,
  switchToRuntime: false,
  donateToContract: false
}
```

Field description:

- `randomWalkAddr`		The address of RandomWalk contract
- `activationTime`		Timestamp when the game becomes activated
- `charityAddr`			Address of the receiver of charitable funds (deposited by contract)
- `transferOwnership`		Set to 'true' if ownership of CharityWallet needs to be transferred to the CosmicDao contract
- `switchToRuntime`		set to 'true' if right after deploying all the contracts the game has to enter run-time mode
- `donateToContract`	Set to 'true' if at the end of the deployment process a donation needs to be made to the CosmicGame contract	

Note; if `donateToContract` is set to true, then `switchtoRuntime` must be also set to true (otherwise the process will trigger a revert)

### Step 2

Start Hardhat node (only required for local chain deployment)

    npx hardhat node

Run the deployment task:

	npx hardhat deploy-cosmicgame --deployconfig ~/deploy-configs/deploy-local.json  --network localhost

(change the network parameter accordingly)

You will get the following output
```
Using file:
{
  privKey: '*******',
  randomWalkAddr: '',
  activationTime: 0,
  charityAddr: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  transferOwnership: false,
  switchToRuntime: false,
  donateToContract: false
}
contracts deployed
CosmicGame address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
CosmicToken address: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
CosmicSignature address: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
CharityWallet address: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
CosmicDAO address 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
RaffleWallet address: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
BidLogic address: 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
randomWalkNFT address: 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
StakingWalletCST address: 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
StakingWalletRWalk address: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
MarketingWallet address: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
INSERT INTO cg_contracts VALUES('0x5FbDB2315678afecb367f032d93F642f64180aa3','0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9','0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512','0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9','0x5FC8d32690cc91D4c39d9d3abcBD16989F875707','0xa513E6E4b8f2a923D98304ec87F64353C4D5C853','0x8A791620dd6260079BF849Dc5567aDC3F2FdC318','0x610178dA211FEF7D417bC0e6FeD39F05609AD788','0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e','0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6','0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0')
```

After successful deployment the commmand will output the addresses for all the deployed contracts.

### Step 3

After deploying the contracts, (optionally) you can verify that bidding and claim-prize features are working correctly. Follow instructions in `scripts/README.md`
