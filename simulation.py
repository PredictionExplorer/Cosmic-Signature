class Simulation:

    def __init__(self):
        self.balance = 1
        self.initialBidAmountFraction = 4000
        self.bid = self.balance / self.initialBidAmountFraction
        self.price_increase = 1.01
        self.time_extra = 1
        self.time_increase = 1.00003
        self.charity_percentage = 0.10
        self.raffle_percentage = 0.12
        self.prize_percentage = 0.25
        self.staking_percentage = 0.10
        self.bid_limit_eth = 0.1
        self.num_new_nfts = 10

    def simulate_bids(self, num_years):
        num_withdrawals = 0
        days_withdraw = 0
        hours = 0
        num_bids = 0
        while hours / (24 * 365) < num_years:
            num_bids += 1
            self.balance += self.bid
            self.bid *= self.price_increase
            hours += self.time_extra
            self.time_extra *= self.time_increase
            if self.bid > self.bid_limit_eth:
                prize = self.balance * self.prize_percentage
                charity = self.balance * self.charity_percentage
                raffle = self.balance * self.raffle_percentage
                staking = self.balance * self.staking_percentage
                ratio = prize / self.bid
                raffle_ratio = (raffle / 3) / self.bid
                num_withdrawals += 1
                total_num_nfts = num_withdrawals * self.num_new_nfts
                days = hours / 24
                print(f"{'*' * 80}\n"
                      f"Years:            {days / 365:.2f}\n"
                      f"Days:             {days:.2f}\n"
                      f"Days Between:     {days - days_withdraw:.2f}\n"
                      f"Num Bids:         {num_bids}\n"
                      f"Num Withdrawals:  {num_withdrawals}\n"
                      f"Num NFTs:         {total_num_nfts}\n"
                      f"Time Extra:       {self.time_extra}\n"
                      f"Bid Size:         {self.bid:.4f}\n"
                      f"Prize:            {prize:.2f}\n"
                      f"Ratio:            {ratio:.2f}\n"
                      f"Raffle Ratio:     {raffle_ratio:.2f}\n"
                      f"Raffle:           {raffle:.2f}\n"
                      f"Staking:          {staking:.2f}\n"
                      f"Charity:          {charity:.2f}\n"
                      f"Balance:          {self.balance:.2f}\n"
                      f"{'*' * 80}")
                days_withdraw = days
                self.balance -= prize
                self.balance -= charity
                self.balance -= raffle
                self.balance -= staking
                old_bid = self.bid
                self.bid = self.balance / self.initialBidAmountFraction
                print(f"bid: {self.bid:.4f} old bid new bid ratio: {old_bid / self.bid:.2f}")
                hours += 24

def main():
    s = Simulation()
    s.simulate_bids(num_years=10)

if __name__ == '__main__':
    main()
