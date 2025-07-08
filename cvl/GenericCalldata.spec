methods {

    function game() external returns (address) envfree;
    function numStakedNfts() external returns (uint256) envfree;
    function actionCounter() external returns (uint256) envfree;
    function getStakeActionAddr(uint256 index) external returns (address) envfree;
    function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
    function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
	function calldataGetUint256(bytes calldataarg) external returns (uint256) envfree;
	function wasTokenUsed(uint256 tokenId) external returns (bool) envfree;
}
rule calldataCheck() 
{
	// rule to test Certora's calldata argument can be decoded and uses inside the rule
	uint256 ac = currentContract.actionCounter();
	require ac == 0;
	method f; env e; calldataarg args;
	require currentContract != e.msg.sender;
	require e.msg.sender != 0;
	require f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector;
	require currentContract.wasTokenUsed(currentContract.calldataGetUint256(args)) == false;
	f(e, args);     // generic method matcher like this is a requirement for 100% bug-free verification
	bool tokenUsed = currentContract.wasTokenUsed(currentContract.calldataGetUint256(args));
	assert tokenUsed == true;
}
/*
	//uint256 inputTokenId = currentContract.calldataGetUint256(args);
	//require inputTokenId == 24;
*/
