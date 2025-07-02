methods {

	function game() external returns (address) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function actionCounter() external returns (uint256) envfree;
	function getStakeActionAddr(uint256 index) external returns (address) envfree;
	function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
	function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
}
persistent ghost mathint numStakes;
persistent ghost mathint numUnstakes;
hook Sstore currentContract.stakeActions[INDEX uint256 id].nftOwnerAddress address newVal (address oldVal) {
	if ((newVal == 0) && (oldVal != 0)) { // delete
		numUnstakes = numUnstakes + 1;	
	} else {
		if ((newVal != 0) && (oldVal == 0)) { // new action
			numStakes = numStakes + 1;
		} else {
			assert false, "nftOwnerAddress changed to another which is not allowed";
		}
	}
}

rule genericMethodMatcher() {

	require numStakes == 0;
	require numUnstakes == 0;
	require currentContract.actionCounter() == 0;
	require currentContract.numStakedNfts() == 0;
	require currentContract.getStakeActionAddr(currentContract.actionCounter()) == 0;
	require currentContract.getStakeActionTokenId(currentContract.actionCounter()) == 0;
	require currentContract.getStakeActionInitialReward(currentContract.actionCounter()) == 0;

    method f; env e; calldataarg args;
	require f.isPayable == false;
    require currentContract != e.msg.sender;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }

	mathint actionCounterBefore = currentContract.actionCounter(e);	

    f(e, args);

	mathint actionCounterAfter = currentContract.actionCounter(e);

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector)
	) {
		assert (actionCounterBefore + 1) == actionCounterAfter,"Action counter must be increemented only by +1";
	} else {
		if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
			assert (actionCounterBefore == actionCounterAfter, "Action counter must remain unchanged");
		} else {
			if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
				assert (actionCounterBefore + numUnstakes) == actionCounterAfter,"unstakeMany() doesn't increment actionCounter correctly";
			}
		}
	}

	satisfy true;
}
