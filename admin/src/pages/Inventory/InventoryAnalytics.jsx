import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import http from "../../api/http";
import { getStockByDay, getTopUsedIngredients, listIngredients } from "../../api/inventoryApi";
import ExportExcelButton from "../../components/ExportExcelButton";
import InventoryTable from "../../components/InventoryTable";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

const toLocalDateInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const InventoryAnalytics = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState([]);

  const [topUsed, setTopUsed] = useState([]);
  const [topCustom, setTopCustom] = useState(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 6); // mặc định 7 ngày gần nhất
    return { from: toLocalDateInput(from), to: toLocalDateInput(now) };
  });
  const [quickKey, setQuickKey] = useState("7d");

  const [range, setRange] = useState({ from: "", to: "", ingredientIds: [] });
  const [stock, setStock] = useState(null);

  const [exportRange, setExportRange] = useState({ from: "", to: "" });

  const controlBase =
    "h-12 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const inputStyle = `w-full ${controlBase}`;
  const selectAutoStyle = `w-auto ${controlBase}`;
  const multiSelectStyle =
    "min-h-12 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const tallMultiSelectStyle = `${multiSelectStyle} h-44`;

  const buttonBase = "btn inline-flex h-11 items-center justify-center rounded-lg px-6 text-sm font-medium";
  const viewButtonStyle = `${buttonBase} btn-add`;
  const quickButtonStyle = "h-9 rounded-lg px-3 text-xs font-semibold text-white shadow-sm transition";
  const barColors = [
    "#f59e0b",
    "#0ea5e9",
    "#8b5cf6",
    "#22c55e",
    "#ef4444",
    "#10b981",
    "#3b82f6",
    "#a855f7",
    "#fb923c",
    "#06b6d4",
  ];
  const shortenLabel = (value, maxLen = 12) => {
    const str = String(value || "").trim();
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1).trimEnd() + "…";
  };

  const setTopRangeDays = (days, key) => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - Math.max(0, days - 1));
    setTopCustom({ from: toLocalDateInput(from), to: toLocalDateInput(now) });
    setQuickKey(key || null);
  };

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

  const normalizeTopUsed = (list = []) =>
    list.map((item, idx) => {
      const quantity = Number(item?.quantity ?? item?.value ?? 0);
      const name = item?.name || "Chưa đặt tên";
      return {
        ...item,
        ingredientId: String(item?.ingredientId || item?._id || idx),
        name,
        shortName: shortenLabel(name, 14),
        value: quantity,
        quantity,
        unit: item?.unit || "",
        color: barColors[idx % barColors.length],
      };
    });

  const loadTopUsed = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const hasCustomRange = Boolean(topCustom.from && topCustom.to);
      const params = hasCustomRange
        ? { from: topCustom.from || undefined, to: topCustom.to || undefined }
        : { range: "7d" };
      const result = await getTopUsedIngredients(url, params);
      if (!result?.success) throw new Error(result?.message || "Không thể tải thống kê.");
      const normalized = normalizeTopUsed(Array.isArray(result.data) ? result.data : []);
      console.log("Top used ingredients (debug)", normalized);
      setTopUsed(normalized);
    } catch (error) {
      toast.error(error?.message || "Không thể tải thống kê.");
      setTopUsed([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStockByDay = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const params = {
        from: range.from || undefined,
        to: range.to || undefined,
        ingredientIds: range.ingredientIds.length ? range.ingredientIds.join(",") : undefined,
      };
      const result = await getStockByDay(url, params);
      if (!result?.success) throw new Error(result?.message || "Không thể tải tồn kho theo ngày.");
      setStock(result.data || null);
    } catch (error) {
      toast.error(error?.message || "Không thể tải tồn kho theo ngày.");
      setStock(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadFullReport = async () => {
    if (!url) return;
    try {
      const params = {};
      if (exportRange.from) params.fromDate = exportRange.from;
      if (exportRange.to) params.toDate = exportRange.to;

      const response = await http.get(`${url}/api/export`, {
        params,
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: response.headers["content-type"] });
      const link = document.createElement("a");
      const urlObject = URL.createObjectURL(blob);
      link.href = urlObject;
      link.download = "bao-cao-kho.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(urlObject);
    } catch (error) {
      toast.error(error?.message || "Không thể tải báo cáo.");
    }
  };

  useEffect(() => {
    loadIngredients();
  }, [url]);

  useEffect(() => {
    loadTopUsed();
  }, [url, topCustom.from, topCustom.to]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Export tổng hợp</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={exportRange.from}
              onChange={(e) => setExportRange((p) => ({ ...p, from: e.target.value }))}
              className={selectAutoStyle}
            />
            <span className="text-sm text-stone-500">đến</span>
            <input
              type="date"
              value={exportRange.to}
              onChange={(e) => setExportRange((p) => ({ ...p, to: e.target.value }))}
              className={selectAutoStyle}
            />
            <button type="button" className={viewButtonStyle} onClick={downloadFullReport} disabled={loading}>
              {loading ? "Đang xử lý..." : "Tải Excel"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Top nguyên liệu dùng nhiều nhất</div>
            <p className="text-sm text-stone-500">Dựa trên inventoryLogs type = order.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["today", "3d", "7d", "30d"].map((key) => {
              const map = { today: 1, "3d": 3, "7d": 7, "30d": 30 };
              return (
                <button
                  key={key}
                  type="button"
                  className={`${quickButtonStyle} ${
                    quickKey === key ? "bg-[#06b6d4]" : "bg-[#f59e0b]"
                  } hover:brightness-95`}
                  onClick={() => setTopRangeDays(map[key], key)}
                >
                  {key === "today" ? "Hôm nay" : `${map[key]} ngày`}
                </button>
              );
            })}
            <input
              type="date"
              value={topCustom.from}
              onChange={(e) => {
                setTopCustom((p) => ({ ...p, from: e.target.value }));
                setQuickKey(null);
              }}
              className={selectAutoStyle}
            />
            <input
              type="date"
              value={topCustom.to}
              onChange={(e) => {
                setTopCustom((p) => ({ ...p, to: e.target.value }));
                setQuickKey(null);
              }}
              className={selectAutoStyle}
            />
            <button type="button" className={viewButtonStyle} onClick={loadTopUsed} disabled={loading}>
              {loading ? "Đang tải..." : "Lấy dữ liệu"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <InventoryTable
            columns={[
              {
                header: "Nguyên liệu",
                key: "name",
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.color || "#f59e0b" }}
                    />
                    <span>{row.name}</span>
                  </div>
                ),
              },
              {
                header: "Số lượng đã dùng",
                key: "value",
                render: (row) => `${row.value} ${row.unit || ""}`.trim(),
              },
            ]}
            rows={topUsed}
            loading={loading}
          />
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topUsed} margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="shortName"
                  tickLine={false}
                  tick={false}
                  height={0}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b">
                  {topUsed.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || barColors[index % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Tồn kho theo ngày</div>
            <p className="text-sm text-stone-500">Chọn nguyên liệu và khoảng ngày để xuất Excel.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
              className={selectAutoStyle}
            />
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
              className={selectAutoStyle}
            />
            <select
              multiple
              value={range.ingredientIds}
              onChange={(e) =>
                setRange((p) => ({ ...p, ingredientIds: Array.from(e.target.selectedOptions, (o) => o.value) }))
              }
              className={tallMultiSelectStyle}
            >
              {ingredientOptions.map((ing) => (
                <option key={String(ing._id)} value={String(ing._id)}>
                  {ing.name}
                </option>
              ))}
            </select>
            <button type="button" className={viewButtonStyle} onClick={loadStockByDay} disabled={loading}>
              {loading ? "Đang tải..." : "Lấy dữ liệu"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          {stock ? (
            <ExportExcelButton
              data={stock.rows}
              columns={stock.columns}
              fileName="ton-kho-theo-ngay.xlsx"
              sheetName="Tồn kho theo ngày"
              label="Tải Excel"
            />
          ) : (
            <p className="text-sm text-stone-500">Chọn nguyên liệu và khoảng thời gian để tải dữ liệu.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryAnalytics;
