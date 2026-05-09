import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getInventoryDashboard } from "../../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DashboardTab = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await getInventoryDashboard(url);
      console.log("DashboardTab load result:", result);
      if (!result?.success) throw new Error(result?.message || "Không thể tải dashboard kho.");
      setData(result.data || null);
    } catch (error) {
      console.error("DashboardTab load error:", error);
      toast.error(error?.message || "Không thể tải dashboard kho.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [url]);

  const low = Array.isArray(data?.lowStockIngredients) ? data.lowStockIngredients : [];
  const topToday = Array.isArray(data?.topUsed?.today) ? data.topUsed.today : [];
  const top7 = Array.isArray(data?.topUsed?.days7) ? data.topUsed.days7 : [];
  const top30 = Array.isArray(data?.topUsed?.days30) ? data.topUsed.days30 : [];

  const renderTop = (title, list) => (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <div className="text-sm font-semibold text-stone-800">{title}</div>
      <div className="mt-2 space-y-2">
        {list.length === 0 ? (
          <div className="text-sm text-stone-500">Chưa có dữ liệu</div>
        ) : (
          list.map((row) => (
            <div key={String(row.ingredientId)} className="flex items-center justify-between text-sm">
              <span className="text-stone-800">{row.name || "--"}</span>
              <span className="font-semibold text-stone-900">
                {row.quantity} {row.unit || ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-stone-600">{loading ? "Đang tải..." : ""}</div>
        <button
          type="button"
          className="btn btn-square btn-add"
          onClick={load}
        >
          Tải lại
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="text-sm text-stone-600">Tổng nguyên liệu</div>
          <div className="mt-1 text-2xl font-bold text-green-500">
            {toNumber(data?.totalIngredients, 0)}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="text-sm text-stone-600">Sắp hết</div>
          <div className="mt-1 text-2xl font-bold text-red-500">
            {toNumber(data?.lowStockCount, 0)}
          </div>
          <div className="mt-1 text-xs text-stone-500">stock ≤ minStock</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="text-sm text-stone-600">Gợi ý</div>
          <div className="mt-1 text-sm text-stone-700">
            Cấu hình công thức trước khi bán để trừ kho tự động.
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="text-base font-semibold text-stone-800">⚠ Nguyên liệu sắp hết</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-700">
              <tr>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-right">Tồn</th>
                <th className="px-3 py-2 text-right">Cảnh báo</th>
              </tr>
            </thead>
            <tbody>
              {low.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-center text-stone-500">
                    Không có nguyên liệu sắp hết
                  </td>
                </tr>
              ) : (
                low.map((row) => (
                  <tr key={String(row._id)} className="border-t">
                    <td className="px-3 py-2 font-medium text-stone-800">{row.name}</td>
                    <td className="px-3 py-2 text-right">
                      {row.stock} {row.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-600">
                      {row.minStock} {row.unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {renderTop("Top hôm nay", topToday)}
        {renderTop("Top 7 ngày", top7)}
        {renderTop("Top 30 ngày", top30)}
      </div>
    </div>
  );
};

export default DashboardTab;
