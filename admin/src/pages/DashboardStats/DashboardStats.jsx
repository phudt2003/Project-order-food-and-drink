import React, { useEffect, useMemo, useState } from "react";
import http from "../../api/http";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Legend,
} from "recharts";

const RANGE_OPTIONS = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "3m", label: "3 tháng" },
  { value: "1y", label: "1 năm" },
];

const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];

const formatNumber = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat("vi-VN").format(num);
};

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(num);
};

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const StatCard = ({ title, value, sub, icon }) => (
  <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-stone-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-stone-800">{value}</p>
        {sub ? <p className="mt-1 text-xs text-stone-400">{sub}</p> : null}
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
        {icon}
      </div>
    </div>
  </div>
);

const DashboardStats = ({ url }) => {
  const apiBase = url || "";
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportTouched, setExportTouched] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = { range };
      const response = await http.get(`${apiBase}/api/stats/dashboard`, { params });
      setDashboard(response?.data?.data || null);
    } catch (error) {
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!apiBase) return;
    fetchStats();
  }, [range, apiBase]);

  const summary = dashboard || {};
  const revenueByDay = dashboard?.revenueByDay || [];
  const revenueByMonth = dashboard?.revenueByMonth || [];
  const revenueByHour = dashboard?.revenueByHour || [];
  const orderStatus = dashboard?.orderStatus || [];
  const paymentMethods = dashboard?.paymentMethods || [];
  const topProducts = dashboard?.topProducts || [];
  const slowProducts = dashboard?.slowProducts || [];

  const statusPieData = useMemo(() => {
    if (!Array.isArray(orderStatus)) return [];
    return orderStatus.map((item) => ({
      name: item.label,
      value: Number(item.count || 0),
    }));
  }, [orderStatus]);

  const paymentPieData = useMemo(() => {
    if (!Array.isArray(paymentMethods)) return [];
    return paymentMethods.map((item) => ({
      name: item.label,
      value: Number(item.count || 0),
    }));
  }, [paymentMethods]);

  const toDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getRangeDates = () => {
    const now = new Date();
    const start = new Date(now);

    switch (range) {
      case "today":
        break;
      case "7d":
        start.setDate(start.getDate() - 6);
        break;
      case "30d":
        start.setDate(start.getDate() - 29);
        break;
      case "3m":
        start.setMonth(start.getMonth() - 3);
        break;
      case "1y":
        start.setFullYear(start.getFullYear() - 1);
        break;
      default:
        start.setDate(start.getDate() - 29);
    }

    return {
      startDate: toDateInput(start),
      endDate: toDateInput(now),
    };
  };

  useEffect(() => {
    if (exportTouched) return;
    const { startDate, endDate } = getRangeDates();
    setExportFrom(startDate);
    setExportTo(endDate);
  }, [range, exportTouched]);

  const getExportDates = () => {
    const rangeDates = getRangeDates();
    const startDate = exportFrom || rangeDates.startDate;
    const endDate = exportTo || rangeDates.endDate;

    if (startDate && endDate && startDate > endDate) {
      return { startDate: endDate, endDate: startDate };
    }

    return { startDate, endDate };
  };

  const handleExport = async () => {
    try {
      const { startDate, endDate } = getExportDates();
      const response = await http.get(`${apiBase}/api/stats/export-revenue`, {
        params: { startDate, endDate },
        responseType: "blob",
      });

      const fileName = `revenue-report-${endDate}.xlsx`;
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // silent fail
    }
  };

  return (
    <div className="min-h-screen w-full flex-1 bg-amber-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold text-stone-800">Báo cáo thống kê</h1>
          <p className="text-sm text-stone-500">Thống kê hoạt động kinh doanh của cửa hàng</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {RANGE_OPTIONS.map((option) => {
            const active = range === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`btn ${active ? "btn-view" : "btn-cancel"}`}
              >
                {option.label}
              </button>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-2 shadow-sm">
              <label className="text-xs font-semibold text-stone-500" htmlFor="export-from">
                Từ
              </label>
              <input
                id="export-from"
                type="date"
                className="rounded-md border border-amber-200 px-2 py-1 text-sm text-stone-700 focus:outline-none"
                value={exportFrom}
                onChange={(event) => {
                  setExportTouched(true);
                  setExportFrom(event.target.value);
                }}
              />
              <label className="text-xs font-semibold text-stone-500" htmlFor="export-to">
                Đến
              </label>
              <input
                id="export-to"
                type="date"
                className="rounded-md border border-amber-200 px-2 py-1 text-sm text-stone-700 focus:outline-none"
                value={exportTo}
                onChange={(event) => {
                  setExportTouched(true);
                  setExportTo(event.target.value);
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="btn btn-confirm"
            >
              Xuất Excel doanh thu
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Tổng doanh thu"
            value={formatCurrency(summary?.revenue)}
            sub="Chỉ tính đơn đã thanh toán"
            icon={<span className="text-sm font-semibold">₫</span>}
          />
          <StatCard
            title="Doanh thu thực nhận"
            value={formatCurrency(summary?.netRevenue)}
            sub="Doanh thu - giảm giá - ship thuê ngoài"
            icon={<span className="text-xs font-semibold">NET</span>}
          />
          <StatCard
            title="Tổng giảm giá"
            value={formatCurrency(summary?.totalDiscount)}
            sub="Từ voucher đơn + ship"
            icon={<span className="text-xs font-semibold">-₫</span>}
          />
          <StatCard
            title="Phí ship thực nhận"
            value={formatCurrency(summary?.totalShipping)}
            sub="Phí ship sau khi trừ ship thuê ngoài"
            icon={<span className="text-xs font-semibold">SHIP</span>}
          />
          <StatCard
            title="Chi phí ship thuê ngoài"
            value={formatCurrency(summary?.totalExternalShipping)}
            sub="Cộng từ từng đơn hàng"
            icon={<span className="text-xs font-semibold">OUT</span>}
          />
          <StatCard
            title="Tổng đơn hàng"
            value={formatNumber(summary?.totalOrders)}
            sub="Tổng đơn trong kỳ"
            icon={<span className="text-sm font-semibold">#</span>}
          />
          <StatCard
            title="Đơn đang hoạt động"
            value={formatNumber(summary?.queue?.activeOrders)}
            sub="Đang chờ/chuẩn bị/giao"
            icon={<span className="text-[10px] font-semibold">LIVE</span>}
          />
          <StatCard
            title="Giá trị đơn trung bình"
            value={formatCurrency(summary?.averageOrderValue)}
            sub="AOV (đơn đã thanh toán)"
            icon={<span className="text-xs font-semibold">AOV</span>}
          />
          <StatCard
            title="Tỷ lệ đơn hủy"
            value={formatPercent(summary?.cancelledOrderRate)}
            sub="Trên tổng đơn"
            icon={<span className="text-sm font-semibold">%</span>}
          />
          <StatCard
            title="Voucher đã dùng"
            value={formatNumber(summary?.voucherUsed)}
            sub="Tính cả voucher ship"
            icon={<span className="text-xs font-semibold">V</span>}
          />
          <StatCard
            title="Số khách hàng"
            value={formatNumber(summary?.totalCustomers)}
            sub="Khách mua trong kỳ"
            icon={<span className="text-xs font-semibold">KH</span>}
          />
          <StatCard
            title="Khách hàng mới"
            value={formatNumber(summary?.newCustomers)}
            sub="Lần đầu mua"
            icon={<span className="text-xs font-semibold">NEW</span>}
          />
          <StatCard
            title="Khách hàng quay lại"
            value={formatNumber(summary?.returningCustomers)}
            sub="Đã mua trước đó"
            icon={<span className="text-xs font-semibold">RE</span>}
          />
          <StatCard
            title="Số sản phẩm bán ra"
            value={formatNumber(summary?.totalProductsSold)}
            sub="Chỉ tính đơn đã thanh toán"
            icon={<span className="text-xs font-semibold">SP</span>}
          />
          <StatCard
            title="Đánh giá trung bình"
            value={`${Number(summary?.avgRating || 0).toFixed(1)}/5`}
            sub="Đánh giá đã duyệt"
            icon={<span className="text-xs font-semibold">*</span>}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Doanh thu theo ngày</h2>
              <span className="text-xs text-stone-400">VND</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efe2d4" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="value" stroke="#c67c4e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Trạng thái đơn hàng</h2>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={90}>
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Doanh thu theo tháng</h2>
              <span className="text-xs text-stone-400">VND</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efe2d4" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="#c67c4e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Doanh thu theo giờ</h2>
              <span className="text-xs text-stone-400">VND</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efe2d4" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Phương thức thanh toán</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentPieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={90}>
                    {paymentPieData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Top 5 sản phẩm bán chạy</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efe2d4" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value, name) => (name === "revenue" ? formatCurrency(value) : value)} />
                  <Bar dataKey="sold" fill="#f59e0b" name="Đã bán" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Top 5 sản phẩm bán chạy</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-50 text-left text-stone-700">
                    <th className="px-3 py-2 font-semibold">Tên món</th>
                    <th className="px-3 py-2 font-semibold">Số lượng bán</th>
                    <th className="px-3 py-2 font-semibold">Doanh thu</th>
                    <th className="px-3 py-2 font-semibold">Số đánh giá</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="px-3 py-3 text-stone-500" colSpan={4}>
                        Đang tải dữ liệu...
                      </td>
                    </tr>
                  )}
                  {!loading && topProducts.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-stone-500" colSpan={4}>
                        Chưa có dữ liệu bán hàng.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    topProducts.map((product) => (
                      <tr key={product.productId} className="border-b border-amber-100">
                        <td className="px-3 py-2 font-medium text-stone-800">{product.name}</td>
                        <td className="px-3 py-2">{formatNumber(product.sold)}</td>
                        <td className="px-3 py-2">{formatCurrency(product.revenue)}</td>
                        <td className="px-3 py-2">{formatNumber(product.reviewCount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">Top 5 sản phẩm bán chậm</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-50 text-left text-stone-700">
                    <th className="px-3 py-2 font-semibold">Tên món</th>
                    <th className="px-3 py-2 font-semibold">Số lượng bán</th>
                    <th className="px-3 py-2 font-semibold">Doanh thu</th>
                    <th className="px-3 py-2 font-semibold">Số đánh giá</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="px-3 py-3 text-stone-500" colSpan={4}>
                        Đang tải dữ liệu...
                      </td>
                    </tr>
                  )}
                  {!loading && slowProducts.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-stone-500" colSpan={4}>
                        Chưa có dữ liệu bán hàng.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    slowProducts.map((product) => (
                      <tr key={product.productId} className="border-b border-amber-100">
                        <td className="px-3 py-2 font-medium text-stone-800">{product.name}</td>
                        <td className="px-3 py-2">{formatNumber(product.sold)}</td>
                        <td className="px-3 py-2">{formatCurrency(product.revenue)}</td>
                        <td className="px-3 py-2">{formatNumber(product.reviewCount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
