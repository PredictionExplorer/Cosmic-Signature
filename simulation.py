class Simulation:

    def __init__(self):
        self.balance = 1
        self.initialBidAmountFraction = 2000
        self.bid = self.balance / self.initialBidAmountFraction
        self.price_increase = 1.03
        self.time_extra = 1
        self.time_increase = 1.00003
        self.charityPercentage = 0.10
        self.withdrawalPercentage = 0.30

    def simulate_time(self):
        num_bids = 0
        num_hours = 0
        num_days = 0
        print_target = 365
        while num_days < 36:
            num_bids += 1
            num_hours += self.time_extra
            self.time_extra *= self.time_increase
            num_days = num_hours / 24
            if num_days > print_target:
                print("num bids", num_bids, "years", num_days / 365, "time extra", time_extra)
                print_target += 365

    def simulate_bids(self, num_years):
        num_withdrawals = 0
        days_withdraw = 0
        hours = 0
        BID_LIMIT = 1
        num_bids = 0
        while hours / (24 * 365) < num_years:
            num_bids += 1
            self.balance += self.bid
            self.bid *= self.price_increase
            prize = self.balance * self.withdrawalPercentage
            charity = self.balance * self.charityPercentage
            ratio = prize / self.bid
            hours += self.time_extra
            self.time_extra *= self.time_increase
            if self.bid > BID_LIMIT:
                num_withdrawals += 1
                days = hours / 24
                print(f"years: {days / 365:.2f} days: {days:.2f} days between: {days - days_withdraw:.2f} num bids: {num_bids} num withdrawals: {num_withdrawals} "
                      f"bid size: {self.bid:.4f} prize: {prize:.2f} ratio: {ratio:.2f} charity: {charity:.2f} balance: {self.balance:.2f}")
                days_withdraw = days
                self.balance -= prize
                self.balance -= charity
                old_bid = self.bid
                self.bid = self.balance / (self.initialBidAmountFraction * 2)
                print(f"bid: {self.bid:.4f} old bid new bid ratio: {old_bid / self.bid:.2f}")
                hours += 24

s = Simulation()
s.simulate_bids(10)
