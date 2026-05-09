import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { getStockByDay, getTopUsedIngredients, listIngredients } from "../../../api/inventoryApi";
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
} from "recharts";

const AnalyticsTab = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState([]);

  const [topRange, setTopRange] = useState("7d");
  const [topUsed, setTopUsed] = useState([]);

  const [range, setRange] = useState({ from: "", to: "", ingredientIds: [] });
  const [stock, setStock] = useState(null);

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

  const loadTopUsed = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await getTopUsedIngredients(url, { range: topRange });
      if (!result?.success) throw new Error(result?.message || "Không thể tải thống kê.");
      setTopUsed(Array.isArray(result.data) ? result.data : []);
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

  useEffect(() => {
    loadIngredients();
  }, [url]);

  useEffect(() => {
    loadTopUsed();
  }, [url, topRange]);

  const stockIngredients = Array.isArray(stock?.ingredients) ? stock.ingredients : [];
  const stockRows = Array.isArray(stock?.rows) ? stock.rows : [];
  const stockChartIngredient = stockIngredients.length === 1 ? stockIngredients[0] : null;
  const stockChartData = stockChartIngredient
    ? stockRows.map((row) => ({
        date: row.date,
        stock: row?.stocks?.[String(stockChartIngredient._id)] ?? null,
      }))
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-800">Top nguyên liệu dùng nhiều nhất</h3>
          <div className="flex gap-1">
            {[
              { value: "today", label: "Hôm nay" },
              { value: "3d", label: "3 ngày" },
              { value: "7d", label: "7 ngày" },
              { value: "30d", label: "30 ngày" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTopRange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  topRange === opt.value
                    ? "bg-[rgb(6,182,212)] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-700">
              <tr>
                <th className="px-3 py-2 text-left">Nguyên liệu</th>
                <th className="px-3 py-2 text-right">Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {topUsed.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-center text-stone-500">
                    Chưa có dữ liệu
                  </td>
                </tr>
              ) : (
                topUsed.map((row) => (
                  <tr key={String(row.ingredientId)} className="border-t">
                    <td className="px-3 py-2 font-medium text-stone-800">{row.name || "--"}</td>
                    <td className="px-3 py-2 text-right">
                      {row.quantity} {row.unit || ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topUsed.map((row) => ({ name: row.name || "--", quantity: row.quantity }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-10} height={60} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="quantity" fill="#d97706" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-800">Tồn kho theo ngày</h3>
          <button
            type="button"
            className="btn btn-square btn-add"
            onClick={loadStockByDay}
          >
            {loading ? "Đang tải..." : "Xem"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-all duration-200 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-all duration-200 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <select
            multiple
            value={range.ingredientIds}
            onChange={(e) => {
              const selected = [...e.target.options].filter((o) => o.selected).map((o) => o.value);
              setRange((p) => ({ ...p, ingredientIds: selected }));
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-all duration-200 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 md:col-span-4"
          >
            {ingredientOptions.map((ing) => (
              <option key={String(ing._id)} value={String(ing._id)}>
                {ing.name} ({ing.unit})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 text-xs text-stone-500">Giữ Ctrl/Command để chọn nhiều nguyên liệu.</div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-700">
              <tr>
                <th className="px-3 py-2 text-left">Ngày</th>
                {stockIngredients.map((ing) => (
                  <th key={String(ing._id)} className="px-3 py-2 text-right">
                    {ing.name} ({ing.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockRows.length === 0 ? (
                <tr>
                  <td colSpan={1 + stockIngredients.length} className="px-3 py-3 text-center text-stone-500">
                    Chưa có dữ liệu
                  </td>
                </tr>
              ) : (
                stockRows.map((row) => (
                  <tr key={row.date} className="border-t">
                    <td className="px-3 py-2">{row.date}</td>
                    {stockIngredients.map((ing) => (
                      <td key={String(ing._id)} className="px-3 py-2 text-right">
                        {row?.stocks?.[String(ing._id)] ?? "--"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {stockChartIngredient ? (
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-stone-800">
              Biểu đồ tồn kho: {stockChartIngredient.name} ({stockChartIngredient.unit})
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stockChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="stock" stroke="#0f766e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-stone-500">
              Chọn đúng 1 nguyên liệu để hiển thị biểu đồ đường.
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-stone-500">
            Chọn đúng 1 nguyên liệu để hiển thị biểu đồ đường.
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
