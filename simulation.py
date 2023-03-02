class Simulation:

    def __init__(self):
        self.balance = 10
        self.initialBidAmountFraction = 1000
        self.bid = self.balance / self.initialBidAmountFraction
        self.price_increase = 1.01
        self.time_extra = 1
        self.time_increase = 1.0001
        self.charityPercentage = 0.10
        self.withdrawalPercentage = 0.50

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

    def simulate_bids(self, num_bids):
        num_withdrawals = 0
        for num_bids in range(num_bids):
            self.balance += self.bid
            self.bid *= self.price_increase
            prize = self.balance * self.withdrawalPercentage
            charity = self.balance * self.charityPercentage
            ratio = self.bid / prize
            days = num_bids // 24

            if self.bid > 2:
                num_withdrawals += 1
                print(f"days: {days} num bids: {num_bids:} num withdrawals: {num_withdrawals} bid size: {self.bid:.2f} prize: {prize:.2f} ratio: {ratio:.2f}")
                self.balance -= prize
                self.balance -= charity
                self.bid = self.balance / (self.initialBidAmountFraction * 2)

s = Simulation()
s.simulate_bids(10_000)
