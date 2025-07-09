methods {
	function game() external returns (address) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function actionCounter() external returns (uint256) envfree;
	function getStakeActionAddr(uint256 index) external returns (address) envfree;
	function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
	function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
}
persistent ghost mathint actionCounterDiff;
persistent ghost mathint gStakeActionNftIdSet;
persistent ghost mathint gStakeActionOwnerSet;
persistent ghost mathint gStakeActionAmountSet;
persistent ghost bytes4 currentMethodSignature;

hook Sstore currentContract.actionCounter uint256 newVal (uint256 oldVal) {
	actionCounterDiff = actionCounterDiff  + (newVal - oldVal);
}
hook Sstore stakeActions[INDEX uint256 idx].nftId uint256 newValue (uint256 oldValue) {
	assert (
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector))
	);
	gStakeActionNftIdSet = 1;
}
hook Sstore stakeActions[INDEX uint256 idx].nftOwnerAddress address newValue (address oldValue) {
	assert (
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector))
	);
	gStakeActionOwnerSet = 1;
}
hook Sstore stakeActions[INDEX uint256 idx].initialRewardAmountPerStakedNft uint256 newValue (uint256 oldValue) {
	assert (
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector))
	);
	gStakeActionAmountSet = 1;
}
rule actionCounterValidation() 
{	
	// verification policy:
	//		- One state variable per rule
	//		- Uses generic method matcher (i.e.: f(e,args) also called "Parametric rules" ) construct to prove that 
	//				no other method touches our state variable unless explicitly stated in the rule logic
	uint256 ac = currentContract.actionCounter();
	require actionCounterDiff == 0;

    method f; env e; calldataarg args;
    if (f.selector != sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		require f.isPayable == false;
	}
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }
	mathint actionCounterBefore = currentContract.actionCounter(e);	

    f(e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

	mathint actionCounterAfter = currentContract.actionCounter(e);

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector)
	) {
		assert ((actionCounterBefore + 1)== actionCounterAfter),"Action counter must be increemented only by +1";
	} else {
		if (
			(f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) ||
			(f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)
		) {
			assert ((actionCounterBefore + actionCounterDiff) == actionCounterAfter),"...Many() method doesn't increment actionCounter correctly";
		} else {
			assert (actionCounterBefore == actionCounterAfter), "Action counter must remain unchanged";
		}
	}
}
rule onlyStakeUnstakeOperationsCanChangeStakeActions() 
{	

	require gStakeActionNftIdSet == 0;
	require gStakeActionOwnerSet == 0;
	require gStakeActionAmountSet == 0;
    method f; env e; calldataarg args;
    if (f.selector != sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		require f.isPayable == false;
	}
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }
	currentMethodSignature = to_bytes4(f.selector);
    f(e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)
	) {
		assert (
			(gStakeActionNftIdSet == 1) &&
			(gStakeActionOwnerSet == 1) &&
			(gStakeActionAmountSet == 1)
		), "stakeActions[] element was partially modified";
	} else {
		assert (
			(gStakeActionNftIdSet == 0) &&
			(gStakeActionOwnerSet == 0) &&
			(gStakeActionAmountSet == 0)
		), "stakeActions[] element was modified by method that does't have permissions to do that";
	}
}
