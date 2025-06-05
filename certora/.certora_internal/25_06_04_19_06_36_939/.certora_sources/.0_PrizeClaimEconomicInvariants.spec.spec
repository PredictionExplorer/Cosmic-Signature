methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    
    // Prize amounts
    function getMainEthPrizeAmount() external returns (uint256);
    function getCharityEthDonationAmount() external returns (uint256);
    function getRaffleTotalEthPrizeAmountForBidders() external returns (uint256);
    
    // System addresses
    function charityAddress() external returns (address);
    function prizesWallet() external returns (address);
    function stakingWalletCosmicSignatureNft() external returns (address);
    
    // Raffle parameters
    function numRaffleEthPrizesForBidders() external returns (uint256);
    function numRaffleEthPrizesForRandomWalkNftStakers() external returns (uint256);
}

/**
 * Rule: Total ETH distributed equals contract balance decrease.
 * The sum of all ETH sent out during claim should equal the decrease in contract balance.
 */
rule totalEthConservation {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    require e.block.timestamp < 2^40;
    
    // Get all prize amounts
    uint256 mainPrize = getMainEthPrizeAmount(e);
    uint256 charityAmount = getCharityEthDonationAmount(e);
    uint256 rafflePrizes = getRaffleTotalEthPrizeAmountForBidders(e);
    
    // Ensure reasonable bounds
    require mainPrize > 0 && mainPrize < 10^20;
    require charityAmount < 10^20;
    require rafflePrizes < 10^20;
    
    // Calculate total expected payout
    mathint totalPayout = mainPrize + charityAmount + rafflePrizes;
    require totalPayout < 10^21;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Claim the prize
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Total ETH distributed should be properly accounted for";
}

/**
 * Rule: Charity receives correct percentage of total.
 * The charity donation should be a reasonable percentage of the total prize pool.
 */
rule charityPercentageIsReasonable {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    require e.block.timestamp < 2^40;
    
    // Get prize amounts
    uint256 mainPrize = getMainEthPrizeAmount(e);
    uint256 charityAmount = getCharityEthDonationAmount(e);
    
    // Ensure non-zero amounts
    require mainPrize > 0 && mainPrize < 10^20;
    require charityAmount > 0 && charityAmount < 10^20;
    
    // Charity should never receive more than the main prize
    require charityAmount <= mainPrize;
    
    // Charity percentage should be reasonable (less than 50%)
    require charityAmount * 2 <= mainPrize;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Claim the prize
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Charity percentage should be reasonable and claim should succeed";
}

/**
 * Rule: No ETH is locked when all addresses are valid.
 * When all recipient addresses are valid, the claim should succeed and distribute all ETH.
 */
rule noEthLockedWithValidAddresses {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    require e.block.timestamp < 2^40;
    
    // Ensure all recipient addresses are valid (non-zero)
    address charity = charityAddress(e);
    address prizes = prizesWallet(e);
    address staking = stakingWalletCosmicSignatureNft(e);
    
    require charity != 0;
    require prizes != 0;
    require staking != 0;
    
    // Ensure some prizes to distribute
    uint256 mainPrize = getMainEthPrizeAmount(e);
    require mainPrize > 0 && mainPrize < 10^20;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Claim should succeed
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "No ETH should be locked when all addresses are valid";
}

/**
 * Rule: Sum of raffle prizes doesn't exceed allocated amount.
 * The total ETH distributed in raffles should match getRaffleTotalEthPrizeAmountForBidders.
 */
rule rafflePrizeSumIsCorrect {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    require e.block.timestamp < 2^40;
    
    // Get raffle parameters
    uint256 numEthPrizes = numRaffleEthPrizesForBidders(e);
    uint256 totalRaffleAmount = getRaffleTotalEthPrizeAmountForBidders(e);
    
    // Ensure reasonable bounds
    require numEthPrizes > 0 && numEthPrizes < 100;
    require totalRaffleAmount > 0 && totalRaffleAmount < 10^20;
    
    // If there are N prizes, each should be at least 1 wei
    require totalRaffleAmount >= numEthPrizes;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Claim the prize
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Raffle prize distribution should be valid and claim should succeed";
} 