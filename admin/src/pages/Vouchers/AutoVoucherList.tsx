import React, { useMemo, useState } from "react";
import { formatVND } from "../../utils/currency";

export type AutoVoucherRow = {
  voucherCode: string;
  voucherName: string;
  rewardType: string;
  rewardYear: number;
  voucherType?: "FOOD" | "DRINK" | "FOOD_DRINK" | "SHIPPING";
  type?: "product" | "shipping";
  discountType?: "amount" | "percent";
  discountValue?: number;
  minOrderValue?: number;
  maxUsage?: number;
  usagePerUser?: number;
  applyFor?: "all" | "category" | "product";
  categoryId?: string | null;
  productIds?: string[];
  startDate?: string;
  endDate?: string;
  status?: "active" | "inactive";
  grantedCount?: number;
  usedCount?: number;
};

const formatDate = (value?: string) => {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleDateString("vi-VN");
};

const rewardTypeLabel = (value?: string) => {
  const t = String(value || "").toLowerCase();
  if (t === "birthday") return "Sinh nhật";
  if (t === "comeback") return "Quay lại";
  if (t === "welcome") return "User mới";
  if (t === "monthly") return "Hàng tháng";
  if (t === "loyalty") return "Loyalty";
  if (t === "happy_hour") return "Happy hour";
  if (t === "delivery") return "Giao hàng";
  if (t === "order_value") return "Theo đơn";
  if (t === "bad_review") return "Đánh giá tệ";
  return t || "--";
};

const voucherTypeLabel = (voucher: AutoVoucherRow) => {
  const t = String(voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase();
  if (t === "SHIPPING") return "Ship";
  if (t === "FOOD_DRINK") return "Đồ ăn & đồ uống";
  if (t === "DRINK") return "Đồ uống";
  return "Món ăn";
};

const discountText = (voucher: AutoVoucherRow) => {
  const vt = String(voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase();
  const discountType = String(voucher?.discountType || "amount");
  const discountValue = Number(voucher?.discountValue || 0);
  if (vt === "SHIPPING") return `${formatVND(discountValue)} ship`;
  if (discountType === "percent") return `${discountValue}%`;
  return formatVND(discountValue);
};

const toDateInput = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

type AutoVoucherUpdatePayload = {
  voucherCode: string;
  rewardType: string;
  rewardYear: number;
  voucherName?: string;
  voucherType?: "FOOD" | "DRINK" | "FOOD_DRINK" | "SHIPPING";
  discountType?: "amount" | "percent";
  discountValue?: number;
  minOrderValue?: number;
  maxUsage?: number;
  usagePerUser?: number;
  startDate?: string;
  endDate?: string;
  status?: "active" | "inactive";
};

export default function AutoVoucherList({
  vouchers,
  loading,
  onUpdate,
  onDelete,
}: {
  vouchers: AutoVoucherRow[];
  loading: boolean;
  onUpdate: (payload: AutoVoucherUpdatePayload) => Promise<void> | void;
  onDelete: (row: AutoVoucherRow) => Promise<void> | void;
}) {
  const [q, setQ] = useState("");
  const [rewardType, setRewardType] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [editing, setEditing] = useState<AutoVoucherRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    voucherName: "",
    voucherType: "FOOD" as "FOOD" | "DRINK" | "FOOD_DRINK" | "SHIPPING",
    discountType: "amount" as "amount" | "percent",
    discountValue: "",
    minOrderValue: "",
    maxUsage: "",
    usagePerUser: "1",
    startDate: "",
    endDate: "",
    status: "active" as "active" | "inactive",
  });

  const filtered = useMemo(() => {
    const query = String(q || "").trim().toLowerCase();
    return (Array.isArray(vouchers) ? vouchers : []).filter((v) => {
      const code = String(v?.voucherCode || "").toLowerCase();
      const name = String(v?.voucherName || "").toLowerCase();
      if (query && !code.includes(query) && !name.includes(query)) return false;
      if (rewardType && String(v?.rewardType || "").toLowerCase() !== rewardType) return false;
      if (status && String(v?.status || "") !== status) return false;
      return true;
    });
  }, [q, rewardType, status, vouchers]);

  const openEdit = (voucher: AutoVoucherRow) => {
    const voucherType = String(voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase() as any;
    const discountType = String(voucher?.discountType || "amount") as any;

    setEditing(voucher);
    setForm({
      voucherName: String(voucher?.voucherName || ""),
      voucherType,
      discountType,
      discountValue: String(voucher?.discountValue ?? ""),
      minOrderValue: String(voucher?.minOrderValue ?? ""),
      maxUsage: String(voucher?.maxUsage ?? ""),
      usagePerUser: String(voucher?.usagePerUser ?? "1"),
      startDate: toDateInput(voucher?.startDate),
      endDate: toDateInput(voucher?.endDate),
      status: (voucher?.status || "active") as any,
    });
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.voucherName.trim()) return;
    if (!form.startDate || !form.endDate) return;
    if (new Date(form.startDate) > new Date(form.endDate)) return;

    setSaving(true);
    try {
      const payload: AutoVoucherUpdatePayload = {
        voucherCode: editing.voucherCode,
        rewardType: editing.rewardType,
        rewardYear: editing.rewardYear,
        voucherName: form.voucherName.trim(),
        voucherType: form.voucherType,
        discountType: form.discountType,
        discountValue: Number(form.discountValue || 0),
        minOrderValue: Number(form.minOrderValue || 0),
        maxUsage: Number(form.maxUsage || 0),
        usagePerUser: Number(form.usagePerUser || 1),
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status,
      };

      await onUpdate(payload);
      closeEdit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-stone-800">Voucher tự động</h2>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
              Hệ thống phát cho user
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Lấy từ voucher đã phát (collection user_voucher). Mỗi dòng là 1 nhóm theo mã + loại phát + kỳ.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="h-11 w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            placeholder="Tìm theo mã / tên..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            value={rewardType}
            onChange={(e) => setRewardType(e.target.value)}
          >
            <option value="">Tất cả loại phát</option>
            <option value="birthday">Sinh nhật</option>
            <option value="comeback">Quay lại</option>
            <option value="welcome">User mới</option>
            <option value="monthly">Hàng tháng</option>
            <option value="loyalty">Loyalty</option>
            <option value="bad_review">Đánh giá tệ</option>
          </select>
          <select
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-stone-500">Đang tải voucher tự động...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          Chưa có voucher tự động. (Job chưa chạy hoặc chưa đủ điều kiện để phát voucher)
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-emerald-200 bg-emerald-50 text-left text-stone-700">
                <th className="px-3 py-2 font-semibold">Mã</th>
                <th className="px-3 py-2 font-semibold">Tên</th>
                <th className="px-3 py-2 font-semibold">Loại phát</th>
                <th className="px-3 py-2 font-semibold">Loại</th>
                <th className="px-3 py-2 font-semibold">Giảm</th>
                <th className="px-3 py-2 font-semibold">Hiệu lực</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold">Đã phát</th>
                <th className="px-3 py-2 font-semibold">Đã dùng</th>
                <th className="px-3 py-2 font-semibold text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((voucher, idx) => (
                <tr key={`${voucher.voucherCode}-${voucher.rewardType}-${voucher.rewardYear}-${idx}`} className="border-b border-emerald-100 hover:bg-emerald-50/30">
                  <td className="px-3 py-2 font-semibold text-stone-800">{voucher.voucherCode}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-stone-800">{voucher.voucherName}</div>
                    <div className="text-xs text-stone-500">Kỳ: {voucher.rewardYear || "--"}</div>
                  </td>
                  <td className="px-3 py-2">{rewardTypeLabel(voucher.rewardType)}</td>
                  <td className="px-3 py-2">{voucherTypeLabel(voucher)}</td>
                  <td className="px-3 py-2">{discountText(voucher)}</td>
                  <td className="px-3 py-2">
                    {formatDate(voucher.startDate)} - {formatDate(voucher.endDate)}
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
                  <td className="px-3 py-2">{Number(voucher.grantedCount || 0).toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2">{Number(voucher.usedCount || 0).toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className="btn btn-edit" onClick={() => openEdit(voucher)}>
                        Sửa
                      </button>
                      <button type="button" className="btn btn-delete" onClick={() => onDelete(voucher)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-stone-800">Cập nhật voucher tự động</h3>
              <button type="button" className="btn btn-cancel" onClick={closeEdit} disabled={saving}>
                Đóng
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-semibold text-stone-700">Tên voucher</span>
                <input
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.voucherName}
                  onChange={(e) => setForm((prev) => ({ ...prev, voucherName: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Loại voucher</span>
                <select
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.voucherType}
                  onChange={(e) => setForm((prev) => ({ ...prev, voucherType: e.target.value as any }))}
                >
                  <option value="FOOD">Món ăn</option>
                  <option value="DRINK">Đồ uống</option>
                  <option value="FOOD_DRINK">Đồ ăn & đồ uống</option>
                  <option value="SHIPPING">Ship</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Kiểu giảm</span>
                <select
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.discountType}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as any }))}
                >
                  <option value="amount">VND</option>
                  <option value="percent">%</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Giá trị giảm</span>
                <input
                  type="number"
                  min={0}
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.discountValue}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Đơn tối thiểu</span>
                <input
                  type="number"
                  min={0}
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.minOrderValue}
                  onChange={(e) => setForm((prev) => ({ ...prev, minOrderValue: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Tổng lượt dùng</span>
                <input
                  type="number"
                  min={0}
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.maxUsage}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxUsage: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Lượt dùng / user</span>
                <input
                  type="number"
                  min={1}
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.usagePerUser}
                  onChange={(e) => setForm((prev) => ({ ...prev, usagePerUser: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Ngày bắt đầu</span>
                <input
                  type="date"
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.startDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-stone-700">Ngày kết thúc</span>
                <input
                  type="date"
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.endDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-semibold text-stone-700">Trạng thái</span>
                <select
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as any }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-cancel" onClick={closeEdit} disabled={saving}>
                Hủy
              </button>
              <button type="button" className="btn btn-edit" onClick={handleSave} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu cập nhật"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
