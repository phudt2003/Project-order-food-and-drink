import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { listIngredients, listInventoryLogs } from "../../../api/inventoryApi";

const formatDateTime = (value) => {
  if (!value) return "--";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "--";
  return d.toLocaleString("vi-VN");
};

const HistoryTab = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState([]);

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const buttonBase = "btn inline-flex h-11 items-center justify-center rounded-lg px-6 text-sm font-medium";
  const reloadButtonStyle = `${buttonBase} btn-add`;
  const filterButtonStyle = `${buttonBase} btn-cancel`;

  const [filters, setFilters] = useState({
    ingredientId: "",
    type: "",
    from: "",
    to: "",
    page: 1,
    limit: 50,
  });

  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50 });

  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [ingredients]
  );

  const loadIngredients = async () => {
    if (!url) return;
    try {
      const result = await listIngredients(url);
      if (!result?.success) throw new Error(result?.message || "Không thể tải nguyên liệu.");
      setIngredients(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error(error?.message || "Không thể tải nguyên liệu.");
      setIngredients([]);
    }
  };

  const loadLogs = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await listInventoryLogs(url, filters);
      if (!result?.success) throw new Error(result?.message || "Không thể tải lịch sử kho.");
      setLogs(Array.isArray(result.data) ? result.data : []);
      setPagination(result.pagination || { total: 0, page: 1, limit: 50 });
    } catch (error) {
      toast.error(error?.message || "Không thể tải lịch sử kho.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIngredients();
  }, [url]);

  useEffect(() => {
    loadLogs();
  }, [url, filters.page]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-800">Lịch sử kho</h3>
          <button
            type="button"
            className={reloadButtonStyle}
            onClick={loadLogs}
          >
            Tải lại
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
          <select
            value={filters.ingredientId}
            onChange={(e) => setFilters((p) => ({ ...p, ingredientId: e.target.value, page: 1 }))}
            className={[inputStyle, "md:col-span-2"].join(" ")}
          >
            <option value="">Tất cả nguyên liệu</option>
            {ingredientOptions.map((ing) => (
              <option key={String(ing._id)} value={String(ing._id)}>
                {ing.name}
              </option>
            ))}
          </select>

          <select
            value={filters.type}
            onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value, page: 1 }))}
            className={inputStyle}
          >
            <option value="">Tất cả loại</option>
            <option value="import">import</option>
            <option value="export">export</option>
            <option value="order">order</option>
          </select>

          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value, page: 1 }))}
            className={inputStyle}
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value, page: 1 }))}
            className={inputStyle}
          />

          <button
            type="button"
            className={filterButtonStyle}
            onClick={loadLogs}
          >
            {loading ? "Đang tải..." : "Lọc"}
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-700">
              <tr>
                <th className="p-3 text-left">Ngày</th>
                <th className="p-3 text-left">Nguyên liệu</th>
                <th className="p-3 text-left">Loại</th>
                <th className="p-3 min-w-[80px] text-right font-semibold">Số lượng</th>
                <th className="p-3 min-w-[120px] text-right font-semibold">Tồn trước</th>
                <th className="p-3 min-w-[120px] text-right font-semibold border-r border-gray-200 pr-6">Tồn sau</th>
                <th className="p-3 max-w-[250px] text-left border-l border-gray-200 pl-6">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-3 text-center text-stone-500">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={String(row._id)} className="border-t">
                    <td className="p-3">{formatDateTime(row.createdAt)}</td>
                    <td className="p-3 font-medium text-stone-800">
                      {row?.ingredientId?.name || "--"}
                    </td>
                    <td className="p-3">
                      {row.type === "import" || row.type === "export" ? (
                        <span
                          className={[
                            "font-semibold",
                            row.type === "import" ? "text-green-600" : "text-red-600",
                          ].join(" ")}
                        >
                          {row.type === "import" ? "Nhập" : "Xuất"}
                        </span>
                      ) : (
                        <span className="text-stone-700">{row.type || "--"}</span>
                      )}
                    </td>
                    <td className="p-3 min-w-[80px] text-right font-mono">
                      {row.quantity} {row?.ingredientId?.unit || ""}
                    </td>
                    <td className="p-3 min-w-[120px] text-right font-mono">{row.stockBefore ?? "--"}</td>
                    <td className="p-3 min-w-[120px] text-right font-mono border-r border-gray-200 pr-6">{row.stockAfter ?? "--"}</td>
                    <td className="p-3 max-w-[250px] truncate border-l border-gray-200 pl-6">
                      {String(row.note || "").trim() ? row.note : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-stone-600">
          <div>
            Tổng: {pagination.total} • Trang {pagination.page}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-200 disabled:opacity-60"
              onClick={() => setFilters((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              disabled={pagination.page <= 1}
            >
              Trước
            </button>
            <button
              type="button"
              className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-200 disabled:opacity-60"
              onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryTab;
