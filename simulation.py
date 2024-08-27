class Simulation:

    def __init__(self):
        self.contract_balance = 40

        self.first_round_bid_price = 1 / 10000

        self.initialBidAmountFraction = 4000
        self.bid = self.first_round_bid_price
        self.price_increase = 1.01
        self.time_extra = 1
        self.time_increase = 1.00003
        self.bid_limit_eth = 0.1

        self.nft_counts = {
            'last_bidder': 1,
            'endurance_champion': 1,
            'chrono_warrior': 1,
            'stellar_spender': 1,
            'random_walk_stakers': 4,
            'raffle': 5
        }

        self.cst_prizes = {
            'bid': 100,
            'last_bidder': 1000,
            'endurance_champion': 1000,
            'chrono_warrior': 1000,
            'stellar_spender': 1000,
            'random_walk_stakers': 4000,
            'raffle': 5000
        }

        self.num_new_nfts = sum(self.nft_counts.values())

        self.percentages = {
            'charity': 0.10,
            'raffle': 0.09,
            'prize': 0.25,
            'chrono_warrior': 0.1,
            'endurance_champion': 0.1,
            'staking': 0.10
        }

        print(sum(self.percentages.values()))

    def simulate_bids(self, num_years):
        num_withdrawals = 0
        days_withdraw = 0
        hours = 0
        num_bids = 0
        while hours / (24 * 365) < num_years:
            num_bids += 1
            self.contract_balance += self.bid
            self.bid *= self.price_increase
            hours += self.time_extra
            self.time_extra *= self.time_increase
            if self.bid > self.bid_limit_eth:
                distributions = {key: self.contract_balance * percentage 
                                 for key, percentage in self.percentages.items()}
                ratio = distributions['prize'] / self.bid
                raffle_ratio = (distributions['raffle'] / 3) / self.bid
                num_withdrawals += 1
                total_num_nfts = num_withdrawals * self.num_new_nfts
                days = hours / 24

                total_cst_amount = sum(self.cst_prizes.values())
                total_cst_amount += self.cst_prizes['bid'] * (num_bids - 1)

                print(f"{'*' * 80}\n"
                      f"Years:            {days / 365:.2f}\n"
                      f"Days:             {days:.2f}\n"
                      f"Days Between:     {days - days_withdraw:.2f}\n"
                      f"Num Bids:         {num_bids}\n"
                      f"Num Withdrawals:  {num_withdrawals}\n"
                      f"Num NFTs:         {total_num_nfts}\n"
                      f"Time Extra:       {self.time_extra:.2f}\n"
                      f"Bid Size:         {self.bid:.4f}\n"
                      f"Prize:            {distributions['prize']:.2f}\n"
                      f"Ratio:            {ratio:.2f}\n"
                      f"Raffle Ratio:     {raffle_ratio:.2f}\n"
                      f"Raffle:           {distributions['raffle'] / 3:.2f}\n"
                      f"Staking:          {distributions['staking']:.2f}\n"
                      f"Charity:          {distributions['charity']:.2f}\n"
                      f"Chrono Warrior:   {distributions['chrono_warrior']:.2f}\n"
                      f"Endurance Champ:  {distributions['endurance_champion']:.2f}\n"
                      f"Balance:          {self.contract_balance:.2f}\n"
                      f"Total CST Amount: {total_cst_amount:.2f}\n"
                      f"{'*' * 80}")
                days_withdraw = days
                self.contract_balance -= sum(distributions.values())
                old_bid = self.bid
                self.bid = self.contract_balance / self.initialBidAmountFraction
                print(f"bid: {self.bid:.4f} old bid new bid ratio: {old_bid / self.bid:.2f}")
                hours += 24

def main():
    s = Simulation()
    s.simulate_bids(num_years=10)

if __name__ == '__main__':
    main()
