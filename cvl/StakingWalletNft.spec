methods {

	function game() external returns (address) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function actionCounter() external returns (uint256) envfree;
	function getStakeActionAddr(uint256 index) external returns (address) envfree;
	function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
	function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
}
persistent ghost mathint actionCounterDiff;
hook Sstore currentContract.actionCounter uint256 newVal (uint256 oldVal) {
	actionCounterDiff = actionCounterDiff  + (newVal - oldVal);
}
rule actionCounterValidation() 
{	
	// verification policy:
	//		- One state variable per rule
	//		- Uses generic method matcher (i.e.: f(e,args) ) construct to prove that no other method touches our state variable
	//					unless explicitly stated in the rule logic
	uint256 ac = currentContract.actionCounter();
	require actionCounterDiff == 0;

    method f; env e; calldataarg args;
	require f.isPayable == false;
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
