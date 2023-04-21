class Simulation:

    def __init__(self):
        self.balance = 1
        self.initialBidAmountFraction = 200
        self.bid = self.balance / self.initialBidAmountFraction
        self.price_increase = 1.01
        self.time_extra = 1
        self.time_increase = 1.0001
        self.charityPercentage = 0.10
        self.rafflePercentage = 0.05
        self.num_raffle_winners = 3
        self.withdrawalPercentage = 0.25
        self.bid_limit_eth = 3

    def simulate_bids(self, num_years):
        num_withdrawals = 0
        days_withdraw = 0
        hours = 0
        num_bids = 0
        while hours / (24 * 365) < num_years:
            num_bids += 1
            self.balance += self.bid
            self.bid *= self.price_increase
            prize = self.balance * self.withdrawalPercentage
            charity = self.balance * self.charityPercentage
            raffle = self.balance * self.rafflePercentage
            ratio = prize / self.bid
            hours += self.time_extra
            self.time_extra *= self.time_increase
            if self.bid > self.bid_limit_eth:
                num_withdrawals += 1
                total_num_nfts = num_withdrawals * 6
                days = hours / 24
                print(f"years: {days / 365:.2f} days: {days:.2f} days between: {days - days_withdraw:.2f} num bids: {num_bids} num withdrawals: {num_withdrawals} num nfts: {total_num_nfts} time extra: {self.time_extra} "
                      f"bid size: {self.bid:.4f} prize: {prize:.2f} ratio: {ratio:.2f} raffle: {raffle:.2f} charity: {charity:.2f} balance: {self.balance:.2f}")
                print("*" * 80)
                days_withdraw = days
                self.balance -= prize
                self.balance -= charity
                self.balance -= raffle * self.num_raffle_winners
                old_bid = self.bid
                self.bid = prize / (self.initialBidAmountFraction)
                print(f"bid: {self.bid:.4f} old bid new bid ratio: {old_bid / self.bid:.2f}")
                hours += 24

    def simulate_worst_case(self, num_years):
        # Suppose only 1 player is participating
        num_withdrawals = 0
        days_withdraw = 0
        hours = 0
        num_bids = 0
        while hours / (24 * 365) < num_years:
            num_bids += 1
            self.balance += self.bid
            self.bid *= self.price_increase
            prize = self.balance * self.withdrawalPercentage
            charity = self.balance * self.charityPercentage
            raffle = self.balance * self.rafflePercentage
            hours += self.time_extra
            self.time_extra *= self.time_increase
            num_withdrawals += 1
            total_num_nfts = num_withdrawals * 5
            days = hours / 24
            print(f"years: {days / 365:.2f} days: {days:.2f} days between: {days - days_withdraw:.2f} num bids: {num_bids} num withdrawals: {num_withdrawals} num nfts: {total_num_nfts} time extra: {self.time_extra} "
                  f"bid size: {self.bid:.4f} prize: {prize:.2f} raffle: {raffle:.2f} charity: {charity:.2f} balance: {self.balance:.2f}")
            print("*" * 80)
            days_withdraw = days
            self.balance -= prize
            self.balance -= charity
            self.balance -= raffle * self.num_raffle_winners
            old_bid = self.bid
            self.bid = prize / (self.initialBidAmountFraction)
            hours += 24

s = Simulation()
s.simulate_bids(10)
