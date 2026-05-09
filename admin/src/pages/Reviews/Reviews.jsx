import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { getReviews, updateReviewReply } from "../../api/reviewsApi";

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Chưa phản hồi" },
  { value: "approved", label: "Đã phản hồi" },
];

const STATUS_META = {
  pending: { label: "Chưa phản hồi", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Đã phản hồi", className: "bg-green-100 text-green-700" },
  // Keep mapping for legacy records, but do not expose a "hide review" option in UI.
  rejected: { label: "Đã xử lý", className: "bg-slate-100 text-slate-700" },
};

const RATING_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "5", label: "5 sao" },
  { value: "4", label: "4 sao" },
  { value: "3", label: "3 sao" },
  { value: "2", label: "2 sao" },
  { value: "1", label: "1 sao" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Mới nhất" },
  { value: "rating_desc", label: "Rating cao → thấp" },
  { value: "rating_asc", label: "Rating thấp → cao" },
  { value: "oldest", label: "Cũ nhất" },
];

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN");
};

const renderStars = (rating) => {
  const value = Math.max(0, Math.min(5, Number(rating || 0)));
  return Array.from({ length: 5 }).map((_, index) => (
    <span key={index} className={index < value ? "text-amber-400" : "text-slate-300"}>
      ★
    </span>
  ));
};

const ReviewsPage = ({ url }) => {
  const apiBase = url || "";
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        sort: sortBy,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (ratingFilter !== "all") params.rating = ratingFilter;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (debouncedSearch) params.search = debouncedSearch;
      const response = await getReviews(apiBase, params);
      if (response?.success) {
        setReviews(Array.isArray(response.data) ? response.data : []);
        setTotal(Number(response.total || 0));
      } else {
        toast.error(response?.message || "Không thể tải đánh giá");
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Không thể tải đánh giá");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!apiBase) return;
    fetchReviews();
  }, [statusFilter, ratingFilter, fromDate, toDate, debouncedSearch, sortBy, page, limit, apiBase]);

  const [replyStates, setReplyStates] = useState({});
  const [savingReply, setSavingReply] = useState(null);

  const handleReplyChange = (reviewId, value) => {
    setReplyStates(prev => ({
      ...prev,
      [reviewId]: value
    }));
  };

  const handleSaveReply = async (review) => {
    if (!review?._id || !replyStates[review._id]?.trim()) return;
    
    setSavingReply(review._id);
    try {
      const response = await updateReviewReply(apiBase, review._id, replyStates[review._id]);
      if (response?.success) {
        toast.success("Phản hồi đã lưu");
        setReplyStates(prev => ({ ...prev, [review._id]: "" }));
        fetchReviews();
      } else {
        toast.error(response?.message || "Lưu thất bại");
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Lưu thất bại");
    } finally {
      setSavingReply(null);
    }
  };

  const appliedFilters = useMemo(() => {
    const items = [];
    const statusLabel = STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label;
    if (statusFilter !== "all" && statusLabel) items.push(`Trạng thái: ${statusLabel}`);
    if (ratingFilter !== "all") items.push(`Rating: ${ratingFilter} sao`);
    if (fromDate && toDate) items.push(`Ngày: ${fromDate} → ${toDate}`);
    if (fromDate && !toDate) items.push(`Từ ngày: ${fromDate}`);
    if (!fromDate && toDate) items.push(`Đến ngày: ${toDate}`);
    if (debouncedSearch) items.push(`Từ khóa: ${debouncedSearch}`);
    if (sortBy !== "newest") {
      const sortLabel = SORT_OPTIONS.find((option) => option.value === sortBy)?.label;
      if (sortLabel) items.push(`Sắp xếp: ${sortLabel}`);
    }
    return items;
  }, [statusFilter, ratingFilter, fromDate, toDate, debouncedSearch, sortBy]);

  const isDefaultFilters =
    statusFilter === "all" &&
    ratingFilter === "all" &&
    !fromDate &&
    !toDate &&
    !debouncedSearch &&
    sortBy === "newest";

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const resetFilters = () => {
    setStatusFilter("all");
    setRatingFilter("all");
    setFromDate("");
    setToDate("");
    setSortBy("newest");
    setSearchTerm("");
    setDebouncedSearch("");
    setPage(1);
  };

  return (
    <div className="min-h-screen w-full flex-1 bg-amber-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div>
            <h3 className="text-xl font-semibold text-slate-800">Quản lý đánh giá</h3>
            <p className="text-sm text-slate-500">Xem và phản hồi đánh giá từ khách hàng</p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo khách, món, bình luận..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {STATUS_OPTIONS.map((option) => {
            const active = statusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setStatusFilter(option.value);
                  setPage(1);
                }}
                className={`btn ${active ? "btn-view" : "btn-cancel"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Từ ngày</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Đến ngày</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Số sao</span>
              <select
                value={ratingFilter}
                onChange={(event) => {
                  setRatingFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              >
                {RATING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Sắp xếp</span>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {appliedFilters.length > 0 ? (
              appliedFilters.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                >
                  {item}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">Chưa áp dụng bộ lọc nào.</span>
            )}
            <button
              type="button"
              onClick={resetFilters}
              disabled={isDefaultFilters}
              className="btn btn-cancel ml-auto disabled:cursor-not-allowed disabled:opacity-60"
            >
              Lọc
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {loading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              Đang tải đánh giá...
            </div>
          )}

          {!loading && reviews.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              Không có đánh giá nào
            </div>
          )}

          {!loading &&
            reviews.map((review) => {
              const statusKey = review.status || "pending";
              const statusMeta = STATUS_META[statusKey] || STATUS_META.pending;

              return (
                <div key={review._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">

                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {review?.userName || "Khách hàng"}
                        <span className="text-xs text-slate-400">• {formatDate(review?.createdAt)}</span>
                      </p>
                      <p className="text-sm text-slate-600">Món: {review?.foodName || "--"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-1">{renderStars(review?.rating)}</div>
                    <span className="text-slate-500">({review?.rating || 0}/5)</span>
                  </div>

                  <p className="mt-3 text-sm text-slate-700">{review?.comment || "--"}</p>

                  <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <p>SĐT: {review?.phone || "--"}</p>
                    <p>Gmail: {review?.userEmail || "--"}</p>
                    <p className="sm:col-span-2">Địa chỉ: {review?.address || "--"}</p>
                  </div>

                  {review.adminReply ? (
                    <div className="mt-4 p-3 bg-blue-50 border rounded-lg">
                      <p className="text-xs font-medium text-blue-800 mb-1">Phản hồi Admin:</p>
                      <p className="text-xs text-blue-700">{review.adminReply}</p>
                    </div>
                  ) : null}
                  
                  <div className="mt-4 p-3 bg-gray-50 border rounded-lg">
                    <textarea
                      value={replyStates[review._id] || ""}
                      onChange={(e) => handleReplyChange(review._id, e.target.value)}
                      placeholder="Phản hồi cho khách hàng..."
                      rows="3"
                      className="w-full rounded border border-gray-300 p-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-100 resize-vertical"
                      disabled={savingReply === review._id}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveReply(review)}
                      disabled={!replyStates[review._id]?.trim() || savingReply === review._id}
                      className="mt-2 btn btn-confirm px-4 py-1 text-xs"
                    >
                      {savingReply === review._id ? "Đang lưu..." : "Lưu phản hồi"}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        {!loading && totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="btn btn-cancel"
              disabled={!canPrev}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Trang trước
            </button>
            <span className="text-sm font-semibold text-slate-600">
              Trang {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-confirm"
              disabled={!canNext}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Trang sau
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ReviewsPage;
