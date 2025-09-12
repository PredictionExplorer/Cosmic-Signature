/* ===================== Ghosts for ERC721 ===================== */
/* custody of each NFT inside PrizesWallet, keyed by (token, tokenId) */
persistent ghost mapping(address => mapping(uint256 => mathint)) gHeld721;
/* receipts per (token, receiver, tokenId) */
persistent ghost mapping(address => mapping(address => mapping(uint256 => mathint))) gRecv721;

/* Update helper for ERC721 transferFrom calls that originate from PrizesWallet */
function cvlNftTransferFrom(address token, address from, address to, uint256 id, address caller) {
	if (caller == currentContract) {
		if (to == currentContract) {
			gHeld721[token][id] = gHeld721[token][id] + 1;
		}
		if (from == currentContract) {
			require gHeld721[token][id] > 0, "NFT custody underflow";
			gHeld721[token][id] = gHeld721[token][id] - 1;
			gRecv721[token][to][id] = gRecv721[token][to][id] + 1;
		}
	}
}

/* ================================ Methods ================================= */
methods {
	/* summarize the actual ERC721Mock.transferFrom → update ghosts, no havoc */
	function ERC721Mock.transferFrom(address from, address to, uint256 tokenId) external with(env e)
		=> cvlNftTransferFrom(calledContract, from, to, tokenId, e.msg.sender);

	/* read-only helpers we use in rules */
	function PrizesWallet.game() external returns (address) envfree;
	function PrizesWallet.nextDonatedNftIndex() external returns (uint256) envfree;
	function PrizesWallet.roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
	function PrizesWallet.mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
}

/* ===== Case A: prizeWinner claims before timeout ===== */
rule nft_donate_then_prize_claims {
	address donor;
	address prizeWinner;
	address token;	/* ERC721 contract address */
	uint round;
	uint tokenId;

	env eGame;
	env ePrize;

	require donor != 0x0, "donor!=0";
	require prizeWinner != 0x0, "prizeWinner!=0";
	require donor != prizeWinner, "donor!=prizeWinner";

	require eGame.msg.sender == currentContract.game(), "only game may donate/register";
	require ePrize.msg.sender == prizeWinner, "claimer is prizeWinner";

	/* baselines */
	mathint custody_before = gHeld721[token][tokenId];
	mathint prize_before_mi = gRecv721[token][prizeWinner][tokenId];

	/* capture index before donation */
	uint idx_before = currentContract.nextDonatedNftIndex();

	/* 1) donate (real body; transferFrom summarized to ghosts) */
	currentContract.donateNft(eGame, round, donor, token, tokenId);

	/* deposit must be exactly one NFT */
	mathint custody_after = gHeld721[token][tokenId];
	require custody_after == custody_before + 1, "donation must add exactly 1";

	/* idx = idx_after - 1 (safe cast) */
	uint idx_after = currentContract.nextDonatedNftIndex();
	require idx_after == idx_before + 1, "index must advance by 1";
	mathint idx_mi = idx_after - 1;
	require idx_mi >= 0, "idx>=0";
	uint idx; require idx == idx_mi, "cast idx";

	/* 2) close round (sets prizeWinner + timeout) */
	currentContract.registerRoundEnd(eGame, round, prizeWinner);

	/* 3) prizeWinner claims that exact index */
	currentContract.claimDonatedNft(ePrize, idx);

	/* custody back to baseline */
	assert gHeld721[token][tokenId] == custody_before,
		"NFT custody not back to baseline after prize claim";

	/* prizeWinner received exactly one tokenId from token */
	mathint prize_after_mi = gRecv721[token][prizeWinner][tokenId];
	mathint gain_mi = prize_after_mi - prize_before_mi;
	require gain_mi >= 0, "gain>=0";
	uint gain; require gain == gain_mi, "cast gain";
	assert gain == 1, "prizeWinner did not receive exactly 1 NFT";
}

/* ===== Case B: timeout path — anyPlayer (≠ prizeWinner) claims after timeout ===== */
rule nft_donate_then_any_after_timeout_claims {
	address donor;
	address prizeWinner;
	address anyPlayer;
	address token;	/* ERC721 contract address */
	uint round;
	uint tokenId;

	env eGame;
	env eAny;

	require donor != 0x0, "donor!=0";
	require prizeWinner != 0x0, "prizeWinner!=0";
	require anyPlayer != 0x0, "anyPlayer!=0";
	require donor != prizeWinner, "donor!=prizeWinner";
	require anyPlayer != prizeWinner, "anyPlayer!=prizeWinner";

	require eGame.msg.sender == currentContract.game(), "only game may donate/register";
	require eAny.msg.sender == anyPlayer, "claimer is anyPlayer";

	/* baselines */
	mathint custody_before = gHeld721[token][tokenId];
	mathint any_before_mi = gRecv721[token][anyPlayer][tokenId];

	/* capture index before donation */
	uint idx_before = currentContract.nextDonatedNftIndex();

	/* 1) donate */
	currentContract.donateNft(eGame, round, donor, token, tokenId);

	/* deposit must be exactly one NFT */
	mathint custody_after = gHeld721[token][tokenId];
	require custody_after == custody_before + 1, "donation must add exactly 1";

	/* idx = idx_after - 1 (safe cast) */
	uint idx_after = currentContract.nextDonatedNftIndex();
	require idx_after == idx_before + 1, "index must advance by 1";
	mathint idx_mi = idx_after - 1;
	require idx_mi >= 0, "idx>=0";
	uint idx; require idx == idx_mi, "cast idx";

	/* 2) close round + read timeout */
	currentContract.registerRoundEnd(eGame, round, prizeWinner);
	uint timeout = currentContract.roundTimeoutTimesToWithdrawPrizes(round);
	require timeout > 0, "timeout set";

	/* ensure the late claim happens AFTER timeout */
	require eAny.block.timestamp >= timeout, "late claim must be after timeout";

	/* 3) anyPlayer claims this NFT by index */
	currentContract.claimDonatedNft(eAny, idx);

	/* custody back to baseline */
	assert gHeld721[token][tokenId] == custody_before,
		"NFT custody not back to baseline after late claim";

	/* anyPlayer received exactly one tokenId from token */
	mathint any_after_mi = gRecv721[token][anyPlayer][tokenId];
	mathint gain_mi = any_after_mi - any_before_mi;
	require gain_mi >= 0, "any gain>=0";
	uint gain; require gain == gain_mi, "cast any gain";
	assert gain == 1, "anyPlayer did not receive exactly 1 NFT";
}

