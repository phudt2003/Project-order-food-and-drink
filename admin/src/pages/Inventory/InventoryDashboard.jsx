import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getInventoryDashboard } from "../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const StatCard = ({ title, value, tone = "default", children }) => {
  const valueClass =
    tone === "danger"
      ? "text-red-500"
      : tone === "warning"
        ? "text-amber-500"
        : tone === "success"
          ? "text-green-500"
          : "text-green-500";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <div className="text-sm font-semibold text-gray-600">{title}</div>
      <div className={["mt-2 text-2xl font-bold", valueClass].join(" ")}>{value}</div>
      {children ? <div className="mt-3 text-sm text-gray-600">{children}</div> : null}
    </div>
  );
};

const TopList = ({ items }) => (
  <div className="mt-3 space-y-2">
    {items.length === 0 ? (
      <div className="text-sm text-stone-500">Chưa có dữ liệu</div>
    ) : (
      items.slice(0, 5).map((row) => (
        <div key={String(row.ingredientId)} className="flex items-center justify-between text-sm">
          <span className="truncate pr-3 font-semibold text-[var(--text-primary)]">{row.name || "--"}</span>
          <span className="shrink-0 font-semibold text-stone-700">
            {row.quantity} {row.unit || ""}
          </span>
        </div>
      ))
    )}
  </div>
);

const InventoryDashboard = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await getInventoryDashboard(url);
      if (!result?.success) throw new Error(result?.message || "Không thể tải dashboard kho.");
      setData(result.data || null);
    } catch (error) {
      toast.error(error?.message || "Không thể tải dashboard kho.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [url]);

  const topToday = Array.isArray(data?.topUsed?.today) ? data.topUsed.today : [];
  const top7 = Array.isArray(data?.topUsed?.days7) ? data.topUsed.days7 : [];
  const top30 = Array.isArray(data?.topUsed?.days30) ? data.topUsed.days30 : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-stone-500">{loading ? "Đang tải..." : ""}</div>
        <button
          type="button"
          onClick={load}
          className="btn btn-square btn-add"
        >
          Tải lại
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Tổng nguyên liệu" value={toNumber(data?.totalIngredients, 0)} />
        <StatCard title="Nguyên liệu sắp hết" value={toNumber(data?.lowStockCount, 0)} tone="danger">
          Cảnh báo khi <span className="font-semibold">stock ≤ minStock</span>
        </StatCard>

        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="text-sm font-semibold text-[var(--text-secondary)]">Top hôm nay</div>
          <TopList items={topToday} />
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="text-sm font-semibold text-[var(--text-secondary)]">Top 7 ngày</div>
          <TopList items={top7} />
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="text-sm font-semibold text-[var(--text-secondary)]">Top 30 ngày</div>
          <TopList items={top30} />
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard;
