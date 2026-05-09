export const formatVND = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat("vi-VN").format(safeAmount)} VNĐ`;
};

