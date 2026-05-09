export const RANKS = [
  {
    key: "member",
    label: "Member",
    minSpend: 0,
    color: "gray",
    coinMultiplier: 1,
    checkinCoins: 5,
    monthlyVoucher: { code: "MONTHLY10", discountValue: 10000, minOrderValue: 50000, expireDays: 7 },
    benefits: [
      "Check-in mỗi ngày nhận +5 xu",
      "Voucher tháng 10.000đ",
      "Tích xu x1 mỗi đơn hàng",
    ],
  },
  {
    key: "silver",
    label: "Silver",
    minSpend: 1000000,
    color: "slate",
    coinMultiplier: 1.2,
    checkinCoins: 7,
    monthlyVoucher: { code: "MONTHLY20", discountValue: 20000, minOrderValue: 60000, expireDays: 7 },
    benefits: [
      "Check-in mỗi ngày nhận +7 xu",
      "Voucher tháng 20.000đ",
      "Tích xu x1.2 mỗi đơn hàng",
    ],
  },
  {
    key: "gold",
    label: "Gold",
    minSpend: 2000000,
    color: "amber",
    coinMultiplier: 1.5,
    checkinCoins: 10,
    monthlyVoucher: { code: "MONTHLY30", discountValue: 30000, minOrderValue: 80000, expireDays: 7 },
    benefits: [
      "Check-in mỗi ngày nhận +10 xu",
      "Voucher tháng 30.000đ",
      "Freeship ưu đãi",
      "Flash Sale riêng cho Gold",
      "Tích xu x1.5 mỗi đơn hàng",
    ],
  },
  {
    key: "diamond",
    label: "Diamond",
    minSpend: 5000000,
    color: "cyan",
    coinMultiplier: 2,
    checkinCoins: 15,
    monthlyVoucher: { code: "MONTHLY50", discountValue: 50000, minOrderValue: 100000, expireDays: 7 },
    benefits: [
      "Check-in mỗi ngày nhận +15 xu",
      "Voucher tháng 50.000đ",
      "Freeship ưu tiên",
      "Flash Sale riêng cho Diamond",
      "Tích xu x2 mỗi đơn hàng",
    ],
  },
];

export const getRankBySpend = (totalSpend = 0) => {
  const spend = Math.max(0, Number(totalSpend) || 0);
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (spend >= rank.minSpend) current = rank;
  }
  const currentIndex = RANKS.findIndex((r) => r.key === current.key);
  const next = currentIndex >= 0 && currentIndex < RANKS.length - 1 ? RANKS[currentIndex + 1] : null;
  return { current, next };
};

export const REDEEM_SHOP = [
  { id: "coin_5k", coinCost: 500, voucher: { code: "COIN5K", discountValue: 5000, minOrderValue: 30000, expireDays: 7 } },
  { id: "coin_10k", coinCost: 1000, voucher: { code: "COIN10K", discountValue: 10000, minOrderValue: 50000, expireDays: 7 } },
  { id: "coin_20k", coinCost: 2000, voucher: { code: "COIN20K", discountValue: 20000, minOrderValue: 60000, expireDays: 7 } },
];

export const MISSIONS = [
  { key: "order_today", title: "Đặt 1 đơn", rewardCoins: 20, description: "Hoàn thành khi có 1 đơn đã thanh toán trong hôm nay." },
  { key: "review_today", title: "Review món", rewardCoins: 10, description: "Hoàn thành khi bạn tạo 1 review trong hôm nay." },
];
