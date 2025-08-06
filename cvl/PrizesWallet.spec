// SPDX-License-Identifier: CC0-1.0
methods {
    function mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
    function getDonatedTokenBalanceAmount(uint256, address) external returns (uint256) envfree;
    function roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
	function _.balanceOf(address) external envfree;
	function game() external returns (address) envfree;
	function getUserEthBalance(address) external returns (uint256) envfree;
}

function genericFunctionMatcher(method f, env e, address winner,uint256 round, bool ethWithdrawal, IPrizesWallet.DonatedTokenToClaim erc20List, uint256[] erc721List,address donorAddr, address tokenAddr, uint256 amount, uint256 nftIf, uint256 nftIndex, uint256[] nftIndices, uint256 timeoutVal, IPrizesWallet.EthDeposit[] ethDeposits) {

	require winner != 0;
	require e.msg.sender != currentContract;
	if (f.selector == sig:PrizesWallet.depositEth(uint256,address).selector) {
    	require currentContract.game() == e.msg.sender;
		require winner != 0;

		require amount > 0;
		require e.msg.value == amount;
		depositEth(e,round,winner);
	} else if (f.selector == sig:PrizesWallet.setTimeoutDurationToWithdrawPrizes(uint256).selector) {
		require e.msg.sender != currentContract;
		setTimeoutDurationToWithdrawPrizes(e,timeoutVal);
	} else if (f.selector == sig:PrizesWallet.registerRoundEndAndDepositEthMany(uint256,address,IPrizesWallet.EthDeposit[]).selector) {
    	require currentContract.game() == e.msg.sender;
		registerRoundEndAndDepositEthMany(e,round,winner,ethDeposits);
	} else if (f.selector == sig:PrizesWallet.registerRoundEnd(uint256,address).selector) {
		require winner != 0;
		registerRoundEnd(e,round,winner);
	} else if (f.selector == sig:PrizesWallet.withdrawEth(address).selector) {
		require currentContract.getUserEthBalance(e.msg.sender) > 0;
		require e.msg.sender == winner;
		withdrawEth(e,winner);
	} else if (f.selector == sig:PrizesWallet.donateToken(uint256,address,address,uint256).selector) {
		require tokenAddr != 0;
		require donorAddr != 0;
		require tokenAddr.balanceOf(e,tokenAddr)>=amount;
		donateToken(e,round,donorAddr,tokenAddr,amount);
	} else if (f.selector == sig:PrizesWallet.claimDonatedToken(uint256,address,uint256).selector) {
		require tokenAddr != 0;
		claimDonatedToken(e,round,tokenAddr,amount);
	}
}
rule balanceChangesCorrectly() {

	method f;
	env e;
	address winner;
	uint256 round;
	bool ethWithdrawal;
	IPrizesWallet.DonatedTokenToClaim erc20List;
	uint256[] erc721List;
	address donorAddr;
	address tokenAddr;
	uint256 amount;
	uint256 nftId;
	uint256 nftIndex;
	uint256[] nftIndices;
	uint256 timeoutVal;
	IPrizesWallet.EthDeposit[] ethDeposits;
	
	uint256 balanceBefore = nativeBalances[currentContract];
	genericFunctionMatcher(f,e,winner,round,ethWithdrawal,erc20List,erc721List,donorAddr,tokenAddr,amount,nftId,nftIndex,nftIndices,timeoutVal,ethDeposits);
	uint256 balanceAfter = nativeBalances[currentContract];

	if (f.selector == sig:PrizesWallet.depositEth(uint256,address).selector) {
		assert balanceBefore < balanceAfter, "balance of PrizesWallet did not increase";
	} else if (f.selector == sig:PrizesWallet.withdrawEth().selector) {
		assert balanceBefore > balanceAfter, "balance of PrizesWallet did not decrease";
	} else {
		assert balanceBefore == balanceAfter, "balance of PrizesWallet changed while it should not change";
	}
}
