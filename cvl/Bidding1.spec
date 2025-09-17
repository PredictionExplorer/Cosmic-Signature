/* ========================================================================= */
/*  All-in-one CVL: Token summaries + PrizesWallet summaries + lastBidder    */
/* ========================================================================= */

/* ====================== ERC-20 ghosts & helpers ========================== */
persistent ghost mapping(address => mapping(address => mathint)) gErc20Bal;
persistent ghost mapping(address => mapping(address => mapping(address => mathint))) gErc20Allow;
persistent ghost mapping(address => mathint) gErc20Total;

/* transfer (from → to) */
function cvlErc20Transfer(address token, address from, address to, uint256 amount) returns bool {
	mathint amt = amount; require amt >= 0, "erc20 amount < 0";
	require from != 0, "erc20 from!=0";
	require to != 0, "erc20 to!=0";
	require gErc20Bal[token][from] >= amt, "erc20: insufficient balance";
	gErc20Bal[token][from] = gErc20Bal[token][from] - amt;
	gErc20Bal[token][to] = gErc20Bal[token][to] + amt;
	return true;
}

/* transferFrom (spender pulls from owner) */
function cvlErc20TransferFrom(address token, address spender, address owner, address to, uint256 amount) returns bool {
	mathint amt = amount; require amt >= 0, "erc20 amount < 0";
	require owner != 0, "erc20 owner!=0";
	require to != 0, "erc20 to!=0";
	require gErc20Bal[token][owner] >= amt, "erc20: insufficient owner balance";
	require gErc20Allow[token][owner][spender] >= amt, "erc20: insufficient allowance";
	gErc20Bal[token][owner] = gErc20Bal[token][owner] - amt;
	gErc20Bal[token][to] = gErc20Bal[token][to] + amt;
	gErc20Allow[token][owner][spender] = gErc20Allow[token][owner][spender] - amt;
	return true;
}

/* approve */
function cvlErc20Approve(address token, address owner, address spender, uint256 amount) returns bool {
	mathint amt = amount; require amt >= 0, "erc20 amount < 0";
	require owner != 0, "erc20 owner!=0";
	require spender != 0, "erc20 spender!=0";
	gErc20Allow[token][owner][spender] = amt;
	return true;
}

/* mint (kept; many mocks expose it) */
function cvlErc20Mint(address token, address to, uint256 amount) {
	mathint amt = amount; require amt >= 0, "erc20 mint<0";
	require to != 0, "erc20 mint to!=0";
	gErc20Bal[token][to] = gErc20Bal[token][to] + amt;
	gErc20Total[token] = gErc20Total[token] + amt;
}

/* reads */
function cvlErc20BalanceOf(address token, address who) returns uint256 {
	mathint bal = gErc20Bal[token][who]; require bal >= 0, "erc20 bal<0";
	uint256 ret; require ret == bal, "erc20 bal cast";
	return ret;
}
function cvlErc20AllowanceOf(address token, address owner, address spender) returns uint256 {
	mathint al = gErc20Allow[token][owner][spender]; require al >= 0, "erc20 allow<0";
	uint256 ret; require ret == al, "erc20 allow cast";
	return ret;
}
function cvlErc20TotalOf(address token) returns uint256 {
	mathint ts = gErc20Total[token]; require ts >= 0, "erc20 total<0";
	uint256 ret; require ret == ts, "erc20 total cast";
	return ret;
}

/* ====================== ERC-721 ghosts & helpers ========================= */
persistent ghost mapping(address => mapping(uint256 => address)) gOwner721;

/* transfer/ownership updates (approvals abstracted away) */
function cvlNftTransferFrom(address token, address from, address to, uint256 id, address caller) {
	require to != 0, "erc721 to!=0";
	if (from != 0) { require gOwner721[token][id] == from, "erc721 wrong owner"; }
	gOwner721[token][id] = to;
}

/* ============================ PrizesWallet ghosts ======================== */
/* custody (round, token) and receipts (token, receiver) */
persistent ghost mapping(uint256 => mapping(address => mathint)) gHeld;
persistent ghost mapping(address => mapping(address => mathint)) gRecv;

/* donation simply increases custody */
function cvlPWDonate(uint256 round, address token, uint256 amount) {
	mathint amt = amount; require amt >= 0, "PW donate amt<0";
	gHeld[round][token] = gHeld[round][token] + amt;
}

/* simplified claim: move from custody to receiver (no timing check here) */
function cvlPWClaim(uint256 round, address token, uint256 amount, address to) {
	mathint amt = amount; require amt >= 0, "PW claim amt<0";
	require gHeld[round][token] >= amt, "claim: insufficient custody";
	gHeld[round][token] = gHeld[round][token] - amt;
	gRecv[token][to] = gRecv[token][to] + amt;
}

/* ================================ Methods ================================= */
/* --- ERC-20: wildcard summaries --- */
methods {
	function ERC20Mock.transfer(address to, uint256 amount) external with(env e)
		=> cvlErc20Transfer(calledContract, e.msg.sender, to, amount) expect bool;

	function ERC20Mock.transferFrom(address from, address to, uint256 amount) external with(env e)
		=> cvlErc20TransferFrom(calledContract, e.msg.sender, from, to, amount) expect bool;

	function ERC20Mock.approve(address spender, uint256 amount) external with(env e)
		=> cvlErc20Approve(calledContract, e.msg.sender, spender, amount) expect bool;

	function ERC20Mock.mint(address to, uint256 amount) external with(env e)
		=> cvlErc20Mint(calledContract, to, amount) expect void;

	function ERC20Mock.balanceOf(address account) external
		=> cvlErc20BalanceOf(calledContract, account) expect uint256;

	function ERC20Mock.allowance(address owner, address spender) external
		=> cvlErc20AllowanceOf(calledContract, owner, spender) expect uint256;

	function ERC20Mock.totalSupply() external
		=> cvlErc20TotalOf(calledContract) expect uint256;
}

/* --- ERC-721: wildcard summaries --- */
methods {
	function ERC721Mock.transferFrom(address from, address to, uint256 tokenId) external with(env e)
		=> cvlNftTransferFrom(calledContract, from, to, tokenId, e.msg.sender) expect void;

	function ERC721Mock.safeTransferFrom(address from, address to, uint256 tokenId) external with(env e)
		=> cvlNftTransferFrom(calledContract, from, to, tokenId, e.msg.sender) expect void;

	function ERC721Mock.ownerOf(uint256 tokenId) external
		=> gOwner721[calledContract][tokenId] expect address;
}

/* --- PrizesWallet API: wildcard summaries (timing-agnostic) --- */
methods {
	function _.donateToken(uint256 roundNum_, address donorAddress_, address tokenAddress_, uint256 amount_) external
		=> cvlPWDonate(roundNum_, tokenAddress_, amount_) expect void;

	function _.claimDonatedToken(uint256 roundNum_, address tokenAddress_, uint256 amount_) external with(env e)
		=> cvlPWClaim(roundNum_, tokenAddress_, amount_, e.msg.sender) expect void;
}

/* =================== lastBidderAddress Delta (parametric rule) =========== */
/* We assume currentContract = CosmicSignatureGame in your .conf */

methods {
	function lastBidderAddress() external returns (address) envfree;
}

/* ghosts for tracking writes to lastBidderAddress */
persistent ghost bytes4 currentMethodSignature;
persistent ghost mathint gLastBidderChanged;
persistent ghost address gLastBidderOld;
persistent ghost address gLastBidderNew;

/* detect writes */
hook Sstore currentContract.lastBidderAddress address newValue (address oldValue) {
	gLastBidderChanged = 1;
	gLastBidderOld = oldValue;
	gLastBidderNew = newValue;
}

/* identify the six bidding entry points (selectors must match your ABI) */
function isBidSelector(bytes4 sel) returns bool {
	bytes4 s1 = to_bytes4(sig:CosmicSignatureGame.bidWithEth(int256,string).selector);
	bytes4 s2 = to_bytes4(sig:CosmicSignatureGame.bidWithEthAndDonateToken(int256,string,address,uint256).selector);
	bytes4 s3 = to_bytes4(sig:CosmicSignatureGame.bidWithEthAndDonateNft(int256,string,address,uint256).selector);
	bytes4 s4 = to_bytes4(sig:CosmicSignatureGame.bidWithCst(uint256,string).selector);
	bytes4 s5 = to_bytes4(sig:CosmicSignatureGame.bidWithCstAndDonateToken(uint256,string,address,uint256).selector);
	bytes4 s6 = to_bytes4(sig:CosmicSignatureGame.bidWithCstAndDonateNft(uint256,string,address,uint256).selector);
	return (sel == s1) || (sel == s2) || (sel == s3) || (sel == s4) || (sel == s5) || (sel == s6);
}

/* generic init + matcher (parametric rule infra) */
function genericFunctionInitializer(method f, env e) {
	gLastBidderChanged = 0;
	gLastBidderOld = currentContract.lastBidderAddress();
	gLastBidderNew = gLastBidderOld;
	currentMethodSignature = to_bytes4(f.selector);

	require e.msg.sender != 0;
	require currentContract != e.msg.sender;
}
function genericFunctionMatcher(method f, env e) returns bool {
	calldataarg args;
	f(e,args);
	return false;
}

/* Rule: non-bid methods must not change lastBidderAddress;
   bid methods that do change it must set it to msg.sender. */
rule lastBidderUpdatesOnlyOnBidsAndEqualsSender() {
	method f; env e;

	genericFunctionInitializer(f, e);
	genericFunctionMatcher(f, e);

	if (!isBidSelector(currentMethodSignature)) {
		assert gLastBidderChanged == 0, "Non-bidding method modified lastBidderAddress";
	} else {
		if (gLastBidderChanged == 1) {
			assert gLastBidderNew == e.msg.sender, "After a bid, lastBidderAddress must equal msg.sender";
		} else {
			assert true, "Bid did not modify lastBidderAddress (revert or no-op)";
		}
	}

	assert true, "end of rule";
}

