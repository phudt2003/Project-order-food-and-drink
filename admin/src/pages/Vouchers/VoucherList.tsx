import React, { useMemo, useState } from "react";
import { formatVND } from "../../utils/currency";

export type VoucherRow = {
  _id: string;
  voucherCode: string;
  voucherName: string;
  issueType?: string;
  voucherType?: "FOOD" | "DRINK" | "FOOD_DRINK" | "SHIPPING";
  type?: "product" | "shipping";
  discountType?: "amount" | "percent";
  discountValue?: number;
  startDate?: string;
  endDate?: string;
  status?: "active" | "inactive";
  usedCount?: number;
  maxUsage?: number;
  createdAt?: string;
  updatedAt?: string;
};

const ISSUE_TYPE_OPTIONS = [
  { value: "", label: "Tất cả loại phát" },
  { value: "manual", label: "Manual" },
  { value: "flash_sale", label: "Flash sale" },
  { value: "new_user", label: "User mới" },
  { value: "birthday", label: "Sinh nhật" },
  { value: "comeback", label: "Quay lại" },
  { value: "monthly_rank", label: "Hàng tháng" },
  { value: "coin_exchange", label: "Đổi Xu" },
  { value: "auto_bad_review", label: "Voucher đánh giá tệ" },
  { value: "personalized", label: "Cá nhân hóa" },
];

const formatDate = (value?: string) => {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleDateString("vi-VN");
};

const voucherTypeLabel = (voucher: VoucherRow) => {
  const t = String(voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase();
  if (t === "SHIPPING") return "Ship";
  if (t === "FOOD_DRINK") return "Đồ ăn & đồ uống";
  if (t === "DRINK") return "Đồ uống";
  return "Món ăn";
};

const discountText = (voucher: VoucherRow) => {
  const vt = String(voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase();
  const discountType = String(voucher?.discountType || "amount");
  const discountValue = Number(voucher?.discountValue || 0);
  if (vt === "SHIPPING") return `${formatVND(discountValue)} ship`;
  if (discountType === "percent") return `${discountValue}%`;
  return formatVND(discountValue);
};

const dateRangeText = (voucher: VoucherRow) => {
  const issueType = String(voucher?.issueType || "").trim().toLowerCase();
  if (["birthday", "comeback", "monthly_rank", "new_user", "personalized", "auto_bad_review"].includes(issueType))
    return "Tự động";
  return `${formatDate(voucher.startDate)} - ${formatDate(voucher.endDate)}`;
};

export default function VoucherList({
  vouchers,
  loading,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  vouchers: VoucherRow[];
  loading: boolean;
  onEdit: (voucher: VoucherRow) => void;
  onDelete: (voucher: VoucherRow) => void;
  onToggleStatus: (voucher: VoucherRow) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [type, setType] = useState<"" | "FOOD" | "DRINK" | "FOOD_DRINK" | "SHIPPING">("");
  const [issueType, setIssueType] = useState("");

  const filtered = useMemo(() => {
    const query = String(q || "").trim().toLowerCase();
    return (Array.isArray(vouchers) ? vouchers : []).filter((v) => {
      const code = String(v?.voucherCode || "").toLowerCase();
      const name = String(v?.voucherName || "").toLowerCase();
      if (query && !code.includes(query) && !name.includes(query)) return false;
      if (status && String(v?.status || "") !== status) return false;
      if (type) {
        const vt = String(v?.voucherType || (v?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase();
        if (vt !== type) return false;
      }
      if (issueType) {
        const it = String(v?.issueType || "").trim().toLowerCase();
        if (it !== issueType) return false;
      }
      return true;
    });
  }, [q, status, type, issueType, vouchers]);

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-800">Danh sách voucher</h2>
          <p className="mt-1 text-sm text-stone-500">Tìm kiếm, lọc, sửa/xóa và bật/tắt nhanh.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="h-11 w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            placeholder="Tìm theo mã / tên..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="">Tất cả loại</option>
            <option value="FOOD">Món ăn</option>
            <option value="DRINK">Đồ uống</option>
            <option value="FOOD_DRINK">Đồ ăn & đồ uống</option>
            <option value="SHIPPING">Ship</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ISSUE_TYPE_OPTIONS.map((opt) => {
          const active = issueType === opt.value;
          return (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => setIssueType(opt.value)}
              className={`btn ${active ? "btn-view" : "btn-cancel"}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-stone-500">Đang tải voucher...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Chưa có voucher phù hợp.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber-200 bg-amber-50 text-left text-stone-700">
                <th className="px-3 py-2 font-semibold">Mã</th>
                <th className="px-3 py-2 font-semibold">Tên</th>
                <th className="px-3 py-2 font-semibold">Loại</th>
                <th className="px-3 py-2 font-semibold">Giảm</th>
                <th className="px-3 py-2 font-semibold">Ngày áp dụng</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold">Lượt dùng</th>
                <th className="px-3 py-2 font-semibold text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((voucher) => {
                const maxUsage = Number(voucher?.maxUsage || 0);
                const usedCount = Number(voucher?.usedCount || 0);
                return (
                  <tr
                    key={String(voucher._id)}
                    className="border-b border-amber-100 align-top hover:bg-orange-50/40"
                    onClick={() => onEdit(voucher)}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-3 py-2 font-semibold text-stone-800">{voucher.voucherCode}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-stone-800">{voucher.voucherName}</div>
                      <div className="text-xs text-stone-500">Click để sửa nhanh</div>
                    </td>
                    <td className="px-3 py-2">{voucherTypeLabel(voucher)}</td>
                    <td className="px-3 py-2">{discountText(voucher)}</td>
                    <td className="px-3 py-2">
                      {dateRangeText(voucher)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          voucher.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-stone-200 text-stone-600"
                        }`}
                      >
                        {voucher.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {usedCount} / {maxUsage > 0 ? maxUsage : "∞"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => onEdit(voucher)} className="btn btn-edit">
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleStatus(voucher)}
                          className={`btn ${voucher.status === "active" ? "btn-cancel" : "btn-confirm"}`}
                        >
                          {voucher.status === "active" ? "Tắt" : "Bật"}
                        </button>
                        <button type="button" onClick={() => onDelete(voucher)} className="btn btn-delete">
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
