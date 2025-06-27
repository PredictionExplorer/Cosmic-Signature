methods {

	function game() external returns (address) envfree;
}

rule genericMethodMatcher() {

    method f; env e; calldataarg args;
    require currentContract != e.msg.sender;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }
	require f.selector != sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector;

	mathint actionCounterBefore = currentContract.actionCounter(e);	

    f(e, args);

	mathint actionCounterAfter = currentContract.actionCounter(e);

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)
	) {
		assert (actionCounterBefore + 1) == actionCounterAfter,"Action counter must be increemented only by +1";
	} else {
	}

	satisfy true;
}
