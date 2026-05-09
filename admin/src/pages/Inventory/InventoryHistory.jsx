import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { listIngredients, listInventoryLogs } from "../../api/inventoryApi";
import ExportExcelButton from "../../components/ExportExcelButton";
import InventoryTable from "../../components/InventoryTable";
import { formatDateTimeVn } from "../../utils/datetime";

const formatDateTime = (value) => {
  if (!value) return "--";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "--";
  return d.toLocaleString("vi-VN");
};

const InventoryHistory = ({ url }) => {
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

  const columns = useMemo(
    () => [
      { key: "createdAt", header: "Ngày", render: (r) => formatDateTime(r.createdAt) },
      { key: "ingredient", header: "Nguyên liệu", render: (r) => r?.ingredientId?.name || "--" },
      {
        key: "type",
        header: "Loại",
        render: (r) =>
          r.type === "import" || r.type === "export" ? (
            <span className={r.type === "import" ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
              {r.type === "import" ? "Nhập" : "Xuất"}
            </span>
          ) : (
            <span className="text-stone-700">{r.type || "--"}</span>
          ),
      },
      { key: "quantity", header: "Số lượng", headerClassName: "text-right", cellClassName: "text-right font-semibold", render: (r) => `${r.quantity} ${r?.ingredientId?.unit || ""}` },
      { key: "stockBefore", header: "Tồn trước", headerClassName: "text-right", cellClassName: "text-right", render: (r) => r.stockBefore ?? "--" },
      {
        key: "stockAfter",
        header: "Tồn sau",
        headerClassName: "text-right border-r border-gray-200 pr-6",
        cellClassName: "text-right border-r border-gray-200 pr-6",
        render: (r) => r.stockAfter ?? "--",
      },
      {
        key: "note",
        header: "Ghi chú",
        headerClassName: "border-l border-gray-200 pl-6",
        cellClassName: "border-l border-gray-200 pl-6",
        render: (r) => (String(r.note || "").trim() ? r.note : "-"),
      },
    ],
    [logs]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Lịch sử kho</div>
            <div className="text-sm text-stone-500">Filter theo nguyên liệu / loại / khoảng ngày.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportExcelButton
              data={logs.map((r) => ({
                createdAt: r.createdAt,
                ingredient: r?.ingredientId?.name || "",
                type: r.type === "import" ? "Nhập" : r.type === "export" ? "Xuất" : r.type,
                quantity: r.quantity,
                unit: r?.ingredientId?.unit || "",
                stockBefore: r.stockBefore,
                stockAfter: r.stockAfter,
                note: String(r.note || "").trim() ? r.note : "-",
              }))}
              fileName="inventory-history.xlsx"
              sheetName="InventoryHistory"
              columns={[
                { header: "Ngày (VN)", key: "createdAt", value: (row) => formatDateTimeVn(row?.createdAt) },
                { header: "Nguyên liệu", key: "ingredient" },
                { header: "Loại", key: "type" },
                { header: "Số lượng", key: "quantity" },
                { header: "Đơn vị", key: "unit" },
                { header: "Tồn trước", key: "stockBefore" },
                { header: "Tồn sau", key: "stockAfter" },
                { header: "Ghi chú", key: "note" },
              ]}
              disabled={logs.length === 0}
            />
            <button
              type="button"
              onClick={loadLogs}
              className={reloadButtonStyle}
            >
              {loading ? "Đang tải..." : "Tải lại"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-6">
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
            <option value="import">Nhập</option>
            <option value="export">Xuất</option>
            <option value="order">Order</option>
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
            onClick={() => {
              setFilters((p) => ({ ...p, page: 1 }));
              loadLogs();
            }}
            className={filterButtonStyle}
          >
            Lọc
          </button>
        </div>

        <div className="mt-4">
          <InventoryTable columns={columns} rows={logs} rowKey={(r) => String(r._id)} />
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

export default InventoryHistory;
