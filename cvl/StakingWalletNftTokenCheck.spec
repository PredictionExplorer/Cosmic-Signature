methods {
	function game() external returns (address) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function actionCounter() external returns (uint256) envfree;
	function tokenOwnerOf(uint256 tokenId) external returns (address) envfree;
	function CosmicSignatureNft.ownerOf(uint256) external returns (address) envfree;
	function rewardAmountPerStakedNft() external returns (uint256) envfree;
	function getStakeActionAddr(uint256 index) external returns (address) envfree;
	function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
	function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
	function getNftUsedStatus(uint256 index) external returns (uint256) envfree;
}
function genericFunctionMatcher(method f,env e,address charity,uint256 round,uint256 nftId,uint256 actionId,uint256[] manyActionIds) returns bool {

    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		deposit(e,round);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		stake(e,nftId);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		unstake(e,actionId);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.pureUnstake(uint256).selector) {
		pureUnstake(e,actionId);
	 } else if (f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector) {
		stakeMany(e,manyActionIds);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
		unstakeMany(e,manyActionIds);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
		bool success = tryPerformMaintenance(e,charity);
		return success;
	} else {
		calldataarg args;
		f(e,args);
	}
	return false;
}
rule tokenBalanceCheck() 
{	
    method f; env e; calldataarg args;
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
		require f.isPayable == true;
		require e.msg.value > 0;
    }
	uint256 ac = currentContract.actionCounter();
	uint256 acNext;
	require acNext == (ac + 1);
    if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		// before stake() all state variables must have 0-values
    	require currentContract.getStakeActionTokenId(acNext) == 0;
    	require currentContract.getStakeActionInitialReward(acNext) == 0;
    	require currentContract.getStakeActionAddr(acNext) == 0;
		require currentContract.getNftUsedStatus(acNext) == 0;
    } else if (f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector) {
		// before stake() all state variables must have 0-values
    	require currentContract.getStakeActionTokenId(acNext) == 0;
    	require currentContract.getStakeActionInitialReward(acNext) == 0;
    	require currentContract.getStakeActionAddr(acNext) == 0;
		require currentContract.getNftUsedStatus(acNext) == 0;
		uint256 acNext2;
		require acNext2 == (ac + 2);
    	require currentContract.getStakeActionTokenId(acNext2) == 0;
    	require currentContract.getStakeActionInitialReward(acNext2) == 0;
    	require currentContract.getStakeActionAddr(acNext2) == 0;
		require currentContract.getNftUsedStatus(acNext2) == 0;
		uint256 acNext3;
		require acNext3 == (ac + 3);
    	require currentContract.getStakeActionTokenId(acNext3) == 0;
    	require currentContract.getStakeActionInitialReward(acNext3) == 0;
    	require currentContract.getStakeActionAddr(acNext3) == 0;
		require currentContract.getNftUsedStatus(acNext3) == 0;
    }
	address charity;
	require charity != currentContract;
	require charity != 0;

	mathint initialReward;
	uint256 tokenId;
	uint256 actionId;
	uint256[] manyActionIds;
	uint256 round;
	address ownershipBefore = currentContract.tokenOwnerOf(tokenId);
    if (f.selector == sig:StakingWalletCosmicSignatureNft.pureUnstake(uint256).selector) {
		require currentContract.numStakedNfts() > 0 ;
    	require currentContract.getStakeActionTokenId(actionId) > 0;
    	require currentContract.getStakeActionInitialReward(actionId) > 0;
    	require currentContract.getStakeActionAddr(actionId) != 0;
		require (actionId > 0) && (actionId < currentContract.actionCounter());
		require initialReward == currentContract.getStakeActionInitialReward(actionId);
		require(ownershipBefore != 0);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		require(ownershipBefore != currentContract);
		require(ownershipBefore != 0);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
		require manyActionIds.length == 3;
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector) {
		require manyActionIds.length == 3;
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
		require nativeBalances[currentContract] > 0;
	}

	address cc;
	require cc == currentContract;

	genericFunctionMatcher(f,e,charity,round,tokenId,actionId,manyActionIds);

	address ownershipAfter = currentContract.tokenOwnerOf(tokenId);

	if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		assert(ownershipAfter == currentContract,"token ownership check failed for stake()");
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.pureUnstake(uint256).selector) {
		assert(ownershipAfter == e.msg.sender,"token ownership check failed for unstake()");
	} else {
		assert ownershipBefore == ownershipAfter,"token ownership changed, while the method did not consider it";
	}
}
