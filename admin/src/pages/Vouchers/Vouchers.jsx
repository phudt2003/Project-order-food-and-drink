import React, { useEffect, useMemo, useState } from "react";
import VouchersPage from "./VouchersPage";
import http from "../../api/http";
import { toast } from "react-toastify";
import {
  createVoucher,
  deleteVoucher,
  getVouchers,
  updateVoucher,
  updateVoucherStatus,
} from "../../api/vouchersApi";
import { formatVND } from "../../utils/currency";

const initialForm = {
  voucherCode: "",
  voucherName: "",
  issueType: "manual",
  targetUser: "all",
  targetRank: "",
  coinCost: "",
  expireDays: "",
  flashStartTime: "18:00",
  flashEndTime: "20:00",
  startDate: "",
  endDate: "",
  applyFor: "all",
  categoryId: "",
  productIds: [],
  voucherType: "FOOD",
  discountType: "amount",
  discountValue: "",
  minOrderValue: "",
  maxUsage: "",
  usagePerUser: "1",
  status: "active",
};

const formatDate = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleDateString("vi-VN");
};

const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

const ISSUE_TYPE_LABEL = {
  manual: "Manual (Admin tạo thủ công)",
  birthday: "Voucher sinh nhật",
  monthly_rank: "Voucher hàng tháng",
  coin_exchange: "Voucher đổi Xu",
  flash_sale: "Voucher Flash Sale",
  new_user: "Voucher user mới",
  personalized: "Voucher cá nhân hóa",
};

const TARGET_USER_LABEL = {
  all: "Tất cả user",
  rank: "Theo Rank",
};

const RANK_LABEL = {
  member: "Member",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

const extractHHMM = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const mapVoucherToForm = (voucher) => ({
  voucherCode: String(voucher?.voucherCode || ""),
  voucherName: String(voucher?.voucherName || ""),
  issueType: String(voucher?.issueType || "").trim() ||
    (String(voucher?.campaignType || "").trim().toLowerCase() === "birthday"
      ? "birthday"
      : String(voucher?.campaignType || "").trim().toLowerCase() === "monthly"
        ? "monthly_rank"
        : String(voucher?.campaignType || "").trim().toLowerCase() === "welcome"
          ? "new_user"
          : String(voucher?.campaignType || "").trim().toLowerCase() === "happy_hour"
            ? "flash_sale"
            : "manual"),
  targetUser: String(voucher?.targetUser || "all"),
  targetRank: String(voucher?.targetRank || ""),
  coinCost: String(voucher?.coinCost ?? ""),
  expireDays: String(voucher?.expireDays ?? ""),
  flashStartTime: extractHHMM(voucher?.startDate) || "18:00",
  flashEndTime: extractHHMM(voucher?.endDate) || "20:00",
  startDate: voucher?.startDate ? String(voucher.startDate).slice(0, 10) : "",
  endDate: voucher?.endDate ? String(voucher.endDate).slice(0, 10) : "",
  applyFor: voucher?.applyFor || "all",
  categoryId:
    typeof voucher?.categoryId === "string"
      ? voucher.categoryId
      : String(voucher?.categoryId?._id || ""),
  productIds: Array.isArray(voucher?.productIds)
    ? voucher.productIds.map((item) => (typeof item === "string" ? item : String(item?._id || "")))
    : [],
  voucherType: voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD"),
  discountType: voucher?.discountType || "amount",
  discountValue: String(voucher?.discountValue ?? ""),
  minOrderValue: String(voucher?.minOrderValue ?? ""),
  maxUsage: String(voucher?.maxUsage ?? ""),
  usagePerUser: String(voucher?.usagePerUser ?? "1"),
  status: voucher?.status || "active",
});

function Vouchers({ url }) {
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState("");
  const [detailVoucher, setDetailVoucher] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const primaryButtonClass = editingId ? "btn-edit" : "btn-add";

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";

  const fetchData = async () => {
    setLoading(true);
    try {
      const [voucherResult, categoryResponse, productResponse] = await Promise.all([
        getVouchers(url),
        http.get(`${url}/api/category/list`),
        http.get(`${url}/api/product/list`),
      ]);

      setVouchers(voucherResult.success ? voucherResult.data : []);
      setCategories(Array.isArray(categoryResponse?.data?.data) ? categoryResponse.data.data : []);
      setProducts(Array.isArray(productResponse?.data?.data) ? productResponse.data.data : []);
    } catch (error) {
      toast.error("Không thể tải dữ liệu voucher.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!url) return;
    fetchData();
  }, [url]);

  const selectedCategoryName = useMemo(() => {
    const selected = categories.find((item) => String(item._id) === String(form.categoryId));
    return selected?.name || "";
  }, [categories, form.categoryId]);

  const getCategoryId = (product) => {
    const rawCategoryId = product?.categoryId;
    if (!rawCategoryId) return "";
    if (typeof rawCategoryId === "string") return rawCategoryId;
    return String(rawCategoryId?._id || "");
  };

  const selectedProductNames = useMemo(() => {
    const selectedIds = new Set(form.productIds.map((id) => String(id)));
    return products.filter((item) => selectedIds.has(String(item._id))).map((item) => item.name);
  }, [products, form.productIds]);

  const drinkProducts = useMemo(
    () => products.filter((item) => String(item?.type || "").toLowerCase() === "drink"),
    [products]
  );

  const foodProducts = useMemo(
    () => products.filter((item) => String(item?.type || "").toLowerCase() !== "drink"),
    [products]
  );

  const availableProducts = useMemo(() => {
    if (form.voucherType === "DRINK") return drinkProducts;
    if (form.voucherType === "FOOD") return foodProducts;
    return products;
  }, [form.voucherType, drinkProducts, foodProducts, products]);

  const availableCategoryIds = useMemo(() => {
    const drinkCategoryIds = new Set(drinkProducts.map((item) => getCategoryId(item)));
    const foodCategoryIds = new Set(foodProducts.map((item) => getCategoryId(item)));

    if (form.voucherType === "DRINK") {
      return new Set([...drinkCategoryIds].filter((id) => id));
    }

    if (form.voucherType === "FOOD") {
      return new Set([...foodCategoryIds].filter((id) => id));
    }

    return new Set(categories.map((item) => String(item?._id || "")));
  }, [categories, drinkProducts, foodProducts, form.voucherType]);

  const availableCategories = useMemo(
    () => categories.filter((category) => availableCategoryIds.has(String(category?._id || ""))),
    [categories, availableCategoryIds]
  );

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  useEffect(() => {
    setForm((prev) => {
      if (!prev.issueType) return prev;
      let next = prev;

      if (prev.issueType === "monthly_rank" && prev.targetUser !== "rank") {
        next = { ...next, targetUser: "rank" };
      }

      if (prev.issueType === "birthday" && !String(prev.expireDays || "").trim()) {
        next = { ...next, expireDays: "3" };
      }

      return next;
    });
  }, [form.issueType]);

  useEffect(() => {
    if (form.targetUser !== "rank" && form.targetRank) {
      setField("targetRank", "");
    }
  }, [form.targetUser]);

  const setVoucherType = (nextType) => {
    setForm((prev) => ({
      ...prev,
      voucherType: nextType,
      categoryId: "",
      productIds: [],
      discountType: nextType === "SHIPPING" ? "amount" : prev.discountType,
    }));
  };

  const toggleProduct = (productId) => {
    setForm((prev) => {
      const id = String(productId);
      const exists = prev.productIds.includes(id);
      return {
        ...prev,
        productIds: exists ? prev.productIds.filter((item) => item !== id) : [...prev.productIds, id],
      };
    });
  };

  useEffect(() => {
    if (form.applyFor !== "category") return;
    if (!form.categoryId) return;
    if (availableCategoryIds.has(String(form.categoryId))) return;
    setForm((prev) => ({ ...prev, categoryId: "" }));
  }, [form.applyFor, form.categoryId, availableCategoryIds]);

  useEffect(() => {
    if (form.applyFor !== "product") return;
    const allowedIds = new Set(availableProducts.map((item) => String(item._id)));
    setForm((prev) => {
      const nextProductIds = prev.productIds.filter((id) => allowedIds.has(String(id)));
      if (nextProductIds.length === prev.productIds.length) return prev;
      return {
        ...prev,
        productIds: nextProductIds,
      };
    });
  }, [form.applyFor, availableProducts]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId("");
  };

  const validateForm = () => {
    if (!form.voucherCode.trim()) return "Mã voucher là bắt buộc.";
    if (!form.voucherName.trim()) return "Tên voucher là bắt buộc.";
    if (!["coin_exchange", "new_user"].includes(form.issueType) && (!form.startDate || !form.endDate)) {
      return "Vui lòng chọn ngày bắt đầu và kết thúc.";
    }
    if (!["coin_exchange", "new_user"].includes(form.issueType) && new Date(form.startDate) >= new Date(form.endDate)) {
      return "Ngày bắt đầu phải nhỏ hơn ngày kết thúc.";
    }
    if (!form.issueType) return "Vui lòng chọn loại phát voucher.";
    if (form.targetUser === "rank" && !form.targetRank) return "Vui lòng chọn rank áp dụng.";
    if (form.issueType === "monthly_rank" && form.targetUser === "rank" && !form.targetRank) {
      return "Voucher hàng tháng (theo rank) cần chọn rank áp dụng.";
    }
    if (form.issueType === "birthday") {
      const expireDays = Number(form.expireDays || 0);
      if (!Number.isFinite(expireDays) || expireDays <= 0) return "Voucher sinh nhật cần chọn thời gian hiệu lực.";
    }
    if (form.issueType === "coin_exchange") {
      const coinCost = Number(form.coinCost || 0);
      if (!Number.isFinite(coinCost) || coinCost <= 0) return "Voucher đổi xu cần nhập số xu hợp lệ (> 0).";
      const expireDays = Number(form.expireDays || 0);
      if (!Number.isFinite(expireDays) || expireDays <= 0) return "Voucher đổi xu cần nhập số ngày sử dụng.";
    }
    if (form.issueType === "new_user") {
      const expireDays = Number(form.expireDays || 0);
      if (!Number.isFinite(expireDays) || expireDays <= 0) return "Voucher user mới cần nhập số ngày sử dụng.";
    }
    if (form.issueType === "flash_sale") {
      if (!form.flashStartTime || !form.flashEndTime) return "Voucher Flash Sale cần chọn khung giờ áp dụng.";
      const startDateTime = new Date(`${form.startDate}T${form.flashStartTime}:00`);
      const endDateTime = new Date(`${form.endDate}T${form.flashEndTime}:00`);
      if (!Number.isFinite(startDateTime.getTime()) || !Number.isFinite(endDateTime.getTime())) {
        return "Khung giờ áp dụng không hợp lệ.";
      }
      if (startDateTime >= endDateTime) return "Giờ bắt đầu phải nhỏ hơn giờ kết thúc.";
    }
    if (form.applyFor === "category" && !form.categoryId) return "Vui lòng chọn danh mục.";
    if (form.applyFor === "product" && form.productIds.length === 0) return "Vui lòng chọn ít nhất 1 sản phẩm.";
    if (!Number.isFinite(Number(form.discountValue)) || Number(form.discountValue) < 0) return "Giá trị giảm không hợp lệ.";
    if (form.voucherType === "DRINK" && form.applyFor === "category" && !availableCategoryIds.has(String(form.categoryId))) {
      return "Voucher do uong chi ap dung cho danh muc do uong.";
    }
    if (form.voucherType === "DRINK" && form.applyFor === "product") {
      const allowedIds = new Set(availableProducts.map((item) => String(item._id)));
      const invalidProduct = form.productIds.some((id) => !allowedIds.has(String(id)));
      if (invalidProduct) return "Voucher do uong chi ap dung cho san pham do uong.";
    }
    if (form.voucherType !== "SHIPPING" && form.discountType === "percent" && Number(form.discountValue) > 100) {
      return "Giảm theo % không được vượt quá 100.";
    }
    if (!Number.isFinite(Number(form.minOrderValue)) || Number(form.minOrderValue) < 0) {
      return "Giá trị đơn hàng tối thiểu không hợp lệ.";
    }
    if (!Number.isFinite(Number(form.maxUsage)) || Number(form.maxUsage) < 0) return "Giới hạn tổng lượt dùng không hợp lệ.";
    if (!Number.isFinite(Number(form.usagePerUser)) || Number(form.usagePerUser) < 1) {
      return "Giới hạn mỗi user phải lớn hơn hoặc bằng 1.";
    }
    return "";
  };

  const buildPayload = () => {
    const toIso = (dateString, timeString) => {
      if (!dateString) return "";
      const time = timeString || "00:00";
      const date = new Date(`${dateString}T${time}:00`);
      if (!Number.isFinite(date.getTime())) return "";
      return date.toISOString();
    };

    const isFlashSale = form.issueType === "flash_sale";
    const isCoin = form.issueType === "coin_exchange";
    const isNewUser = form.issueType === "new_user";
    const startDate = isFlashSale ? toIso(form.startDate, form.flashStartTime) : form.startDate;
    const endDate = isFlashSale ? toIso(form.endDate, form.flashEndTime) : form.endDate;
    const defaultStart = new Date().toISOString().slice(0, 10);
    const defaultEnd = (() => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 10);
      return future.toISOString().slice(0, 10);
    })();

    return {
      voucherCode: form.voucherCode.trim().toUpperCase(),
      voucherName: form.voucherName.trim(),
      issueType: form.issueType,
      targetUser: form.targetUser,
      targetRank: form.targetUser === "rank" ? form.targetRank : null,
      coinCost: Number(form.coinCost || 0),
      expireDays: Number(form.expireDays || 0),
      startDate: (isCoin || isNewUser) ? defaultStart : startDate,
      endDate: (isCoin || isNewUser) ? defaultEnd : endDate,
    applyFor: form.applyFor,
    categoryId: form.applyFor === "category" ? form.categoryId : null,
    productIds: form.applyFor === "product" ? form.productIds : [],
    voucherType: form.voucherType,
    type: form.voucherType === "SHIPPING" ? "shipping" : "product",
    discountType: form.voucherType === "SHIPPING" ? "amount" : form.discountType,
    discountValue: Number(form.discountValue || 0),
    minOrderValue: Number(form.minOrderValue || 0),
    maxUsage: Number(form.maxUsage || 0),
    usagePerUser: Number(form.usagePerUser || 1),
    status: form.status,
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const result = editingId ? await updateVoucher(url, editingId, payload) : await createVoucher(url, payload);
      if (!result?.success) {
        toast.error(result?.message || "Không thể lưu voucher.");
        return;
      }
      toast.success(editingId ? "Cập nhật voucher thành công." : "Tạo voucher thành công.");
      resetForm();
      await fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (voucher) => {
    setEditingId(String(voucher?._id || ""));
    setForm(mapVoucherToForm(voucher));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (voucher) => {
    if (!voucher?._id) return;
    const confirmed = window.confirm(`Xóa voucher ${voucher.voucherCode}?`);
    if (!confirmed) return;
    const result = await deleteVoucher(url, voucher._id);
    if (!result?.success) {
      toast.error(result?.message || "Xóa voucher thất bại.");
      return;
    }
    toast.success("Xóa voucher thành công.");
    await fetchData();
  };

  const handleToggleStatus = async (voucher) => {
    if (!voucher?._id) return;
    const nextStatus = voucher.status === "active" ? "inactive" : "active";
    const result = await updateVoucherStatus(url, voucher._id, nextStatus);
    if (!result?.success) {
      toast.error(result?.message || "Cập nhật trạng thái thất bại.");
      return;
    }
    toast.success("Cập nhật trạng thái thành công.");
    await fetchData();
  };

  return (
    <div className="w-full flex-1 bg-amber-50/40 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-6">
          <h1 className="text-center text-2xl font-bold text-stone-800">
            {editingId ? "Chỉnh sửa Voucher" : "Tạo Voucher"}
          </h1>
          <p className="mt-1 text-center text-sm text-stone-500">
            Quản lý mã giảm giá cho món ăn, đồ uống và phí giao hàng.
          </p>

          <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
              <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-stone-800">Thông tin voucher</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Mã voucher</span>
                  <input
                    value={form.voucherCode}
                    onChange={(e) => setField("voucherCode", e.target.value.toUpperCase())}
                    placeholder="COFFEE20"
                    className={inputStyle}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Tên voucher</span>
                  <input
                    value={form.voucherName}
                    onChange={(e) => setField("voucherName", e.target.value)}
                    placeholder="Giảm 20k cho đơn cà phê"
                    className={inputStyle}
                  />
                </label>
              </div>
            </div>

            {!["coin_exchange", "new_user"].includes(form.issueType) ? (
              <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-stone-800">Thời gian áp dụng</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Ngày bắt đầu</span>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setField("startDate", e.target.value)}
                      className={inputStyle}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Ngày kết thúc</span>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setField("endDate", e.target.value)}
                      className={inputStyle}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-stone-800">Loại phát voucher</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Loại phát</span>
                  <select
                    value={form.issueType}
                    onChange={(e) => setField("issueType", e.target.value)}
                    className={inputStyle}
                  >
                    {Object.entries(ISSUE_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-stone-700">Đối tượng người dùng</span>
                <div className="flex flex-wrap gap-4 p-3">
                    {Object.entries(TARGET_USER_LABEL)
                      .filter(([value]) => value !== "new")
                      .map(([value, label]) => (
                      <label key={value} className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          checked={form.targetUser === value}
                          onChange={() => setField("targetUser", value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                {form.targetUser === "rank" || form.issueType === "monthly_rank" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Rank áp dụng</span>
                    <select
                      value={form.targetRank}
                      onChange={(e) => setField("targetRank", e.target.value)}
                      className={inputStyle}
                    >
                      <option value="">-- Chọn Rank --</option>
                      {Object.entries(RANK_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div />
                )}

                {form.issueType === "birthday" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Thời gian hiệu lực</span>
                    <select
                      value={form.expireDays}
                      onChange={(e) => setField("expireDays", e.target.value)}
                      className={inputStyle}
                    >
                      <option value="">-- Chọn số ngày --</option>
                      <option value="3">3 ngày</option>
                      <option value="5">5 ngày</option>
                      <option value="7">7 ngày</option>
                    </select>
                  </label>
                ) : (
                  <div />
                )}

                {form.issueType === "coin_exchange" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Xu cần để đổi</span>
                    <input
                      type="number"
                      min="0"
                      value={form.coinCost}
                      onChange={(e) => setField("coinCost", e.target.value)}
                      placeholder="1000"
                      className={inputStyle}
                    />
                  </label>
                ) : null}

                {["coin_exchange", "new_user"].includes(form.issueType) ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Số ngày sử dụng</span>
                    <input
                      type="number"
                      min="1"
                      value={form.expireDays}
                      onChange={(e) => setField("expireDays", e.target.value)}
                      placeholder="7"
                      className={inputStyle}
                    />
                  </label>
                ) : null}

                {form.issueType === "flash_sale" ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">Giờ bắt đầu</span>
                      <input
                        type="time"
                        value={form.flashStartTime}
                        onChange={(e) => setField("flashStartTime", e.target.value)}
                        className={inputStyle}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">Giờ kết thúc</span>
                      <input
                        type="time"
                        value={form.flashEndTime}
                        onChange={(e) => setField("flashEndTime", e.target.value)}
                        className={inputStyle}
                      />
                    </label>
                  </div>
                ) : null}

                {form.issueType === "personalized" ? (
                  <label className="flex flex-col gap-1.5 md:col-span-2">
                    <span className="text-sm font-semibold text-gray-900">Danh mục ưu tiên (gợi ý)</span>
                    <select
                      value={form.applyFor === "category" ? form.categoryId : ""}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          applyFor: "category",
                          categoryId: e.target.value,
                        }));
                      }}
                      className={inputStyle}
                    >
                      <option value="">-- Chọn danh mục --</option>
                      {availableCategories.map((category) => (
                        <option key={category._id} value={category._id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-stone-500">
                      Voucher cá nhân hóa nên đặt "Đối tượng áp dụng" theo Danh mục để khớp hành vi mua hàng.
                    </p>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-stone-800">Loại voucher</h2>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.voucherType === "FOOD"}
                    onChange={() => setVoucherType("FOOD")}
                  />
                  <span>Voucher giảm giá món ăn</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.voucherType === "DRINK"}
                    onChange={() => setVoucherType("DRINK")}
                  />
                  <span>Voucher giảm giá đồ uống</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.voucherType === "SHIPPING"}
                    onChange={() => setVoucherType("SHIPPING")}
                  />
                  <span>Voucher giảm phí giao hàng</span>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                {form.voucherType !== "SHIPPING" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">Kiểu giảm giá</span>
                    <select
                      value={form.discountType}
                      onChange={(e) => setField("discountType", e.target.value)}
                      className={inputStyle}
                    >
                      <option value="amount">Giảm theo tiền (VND)</option>
                      <option value="percent">Giảm theo %</option>
                    </select>
                  </label>
                ) : (
                  <div />
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">
                    {form.voucherType === "SHIPPING" ? "Giảm phí ship (VND)" : "Giá trị giảm"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={form.discountValue}
                    onChange={(e) => setField("discountValue", e.target.value)}
                    className={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-stone-800">Đối tượng áp dụng</h2>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {[
                  {
                    value: "all",
                    label:
                      form.voucherType === "DRINK"
                        ? "Tất cả đồ uống"
                        : form.voucherType === "SHIPPING"
                          ? "Tất cả đơn hàng"
                          : "Tất cả sản phẩm",
                  },
                  {
                    value: "category",
                    label:
                      form.voucherType === "DRINK"
                        ? "Danh mục đồ uống"
                        : form.voucherType === "SHIPPING"
                          ? "Theo danh mục sản phẩm"
                          : "Danh mục",
                  },
                  {
                    value: "product",
                    label:
                      form.voucherType === "DRINK"
                        ? "Sản phẩm đồ uống"
                        : form.voucherType === "SHIPPING"
                          ? "Theo sản phẩm"
                          : "Sản phẩm cụ thể",
                  },
                ].map((item) => (
                  <label key={item.value} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      checked={form.applyFor === item.value}
                      onChange={() => setField("applyFor", item.value)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              {form.applyFor === "category" ? (
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Chọn danh mục</span>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setField("categoryId", e.target.value)}
                    className={inputStyle}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {availableCategories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {form.applyFor === "product" ? (
                <div className="mt-3">
                  <p className="mb-2 text-sm font-medium text-stone-700">Chọn sản phẩm</p>
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-4">
                    {availableProducts.map((product) => (
                      <label key={product._id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.productIds.includes(String(product._id))}
                          onChange={() => toggleProduct(product._id)}
                        />
                        <span>{product.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-stone-800">Điều kiện sử dụng</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Đơn tối thiểu (VND)</span>
                  <input
                    type="number"
                    min="0"
                    value={form.minOrderValue}
                    onChange={(e) => setField("minOrderValue", e.target.value)}
                    className={inputStyle}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Tổng lượt dùng tối đa</span>
                  <input
                    type="number"
                    min="0"
                    value={form.maxUsage}
                    onChange={(e) => setField("maxUsage", e.target.value)}
                    className={inputStyle}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">Lượt dùng / user</span>
                  <input
                    type="number"
                    min="1"
                    value={form.usagePerUser}
                    onChange={(e) => setField("usagePerUser", e.target.value)}
                    className={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-stone-800">Trạng thái</h2>
              <div className="mt-3 flex gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" checked={form.status === "active"} onChange={() => setField("status", "active")} />
                  <span>Active</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.status === "inactive"}
                    onChange={() => setField("status", "inactive")}
                  />
                  <span>Inactive</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting}
                className={`btn ${primaryButtonClass}`}
              >
                {submitting ? "Đang lưu..." : editingId ? "Cập nhật voucher" : "Tạo voucher"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-cancel"
              >
                Hủy
              </button>
            </div>

            {(selectedCategoryName || selectedProductNames.length > 0) && form.applyFor !== "all" ? (
              <p className="text-xs text-stone-500">
                Đang áp dụng cho:{" "}
                {form.applyFor === "category"
                  ? `Danh mục ${selectedCategoryName}`
                  : `${selectedProductNames.length} sản phẩm`}
              </p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-6">
          <h2 className="text-xl font-bold text-stone-800">Danh sách voucher</h2>
          {loading ? (
            <p className="mt-3 text-sm text-stone-500">Đang tải voucher...</p>
          ) : vouchers.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">Chưa có voucher nào.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-50 text-left text-stone-700">
                    <th className="px-3 py-2 font-semibold">Mã</th>
                    <th className="px-3 py-2 font-semibold">Tên</th>
                    <th className="px-3 py-2 font-semibold">Loại</th>
                    <th className="px-3 py-2 font-semibold">Loại phát</th>
                    <th className="px-3 py-2 font-semibold">Đối tượng user</th>
                    <th className="px-3 py-2 font-semibold">Rank áp dụng</th>
                    <th className="px-3 py-2 font-semibold">Xu đổi</th>
                    <th className="px-3 py-2 font-semibold">Giảm</th>
                    <th className="px-3 py-2 font-semibold">Thời gian</th>
                    <th className="px-3 py-2 font-semibold">Đã dùng</th>
                    <th className="px-3 py-2 font-semibold">Trạng thái</th>
                    <th className="px-3 py-2 font-semibold">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((voucher) => {
                    const issueType =
                      String(voucher?.issueType || "").trim() ||
                      (String(voucher?.campaignType || "").trim().toLowerCase() === "birthday"
                        ? "birthday"
                        : String(voucher?.campaignType || "").trim().toLowerCase() === "monthly"
                          ? "monthly_rank"
                          : String(voucher?.campaignType || "").trim().toLowerCase() === "welcome"
                            ? "new_user"
                            : String(voucher?.campaignType || "").trim().toLowerCase() === "happy_hour"
                              ? "flash_sale"
                              : "manual");
                    const targetUser = String(voucher?.targetUser || "all");
                    const targetRank = String(voucher?.targetRank || "");
                    const coinCost = Number(voucher?.coinCost || 0);
                    const discountText =
                      (voucher.voucherType || (voucher.type === "shipping" ? "SHIPPING" : "FOOD")) === "SHIPPING"
                        ? `${formatVND(voucher.discountValue || 0)} ship`
                        : voucher.discountType === "percent"
                          ? `${voucher.discountValue || 0}%`
                          : formatVND(voucher.discountValue || 0);
                    return (
                      <tr key={voucher._id} className="border-b border-amber-100 align-top">
                        <td className="px-3 py-2 font-semibold text-stone-800">{voucher.voucherCode}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-stone-800">{voucher.voucherName}</div>
                          <div className="text-xs text-stone-500">
                            {voucher.applyFor === "all"
                              ? "Toàn bộ sản phẩm"
                              : voucher.applyFor === "category"
                                ? `Danh mục: ${voucher.categoryId?.name || "--"}`
                                : `${Array.isArray(voucher.productIds) ? voucher.productIds.length : 0} sản phẩm`}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {{
                            SHIPPING: "Phí giao hàng",
                            DRINK: "Đồ uống",
                            FOOD: "Món ăn",
                          }[voucher.voucherType || (voucher.type === "shipping" ? "SHIPPING" : "FOOD")]}
                        </td>
                        <td className="px-3 py-2">{ISSUE_TYPE_LABEL[issueType] || "Manual"}</td>
                        <td className="px-3 py-2">{TARGET_USER_LABEL[targetUser] || "Tất cả user"}</td>
                        <td className="px-3 py-2">{targetUser === "rank" ? (RANK_LABEL[targetRank] || "--") : "--"}</td>
                        <td className="px-3 py-2">{issueType === "coin_exchange" ? `${coinCost} Xu` : "--"}</td>
                        <td className="px-3 py-2">{discountText}</td>
                        <td className="px-3 py-2">
                          {formatDate(voucher.startDate)} - {formatDate(voucher.endDate)}
                          {issueType === "flash_sale" ? (
                            <div className="text-xs text-stone-500">
                              {formatTime(voucher.startDate)} - {formatTime(voucher.endDate)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{voucher.usedCount || 0}</td>
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailVoucher(voucher)}
                              className="btn btn-confirm"
                            >
                              Xem
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(voucher)}
                              className="btn btn-edit"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(voucher)}
                              className={`btn ${
                                voucher.status === "active" ? "btn-cancel" : "btn-confirm"
                              }`}
                            >
                              {voucher.status === "active" ? "Tắt" : "Bật"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(voucher)}
                              className="btn btn-delete"
                            >
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

        {detailVoucher ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setDetailVoucher(null)}
          >
            <div
              className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const issueType =
                  String(detailVoucher?.issueType || "").trim() ||
                  (String(detailVoucher?.campaignType || "").trim().toLowerCase() === "birthday"
                    ? "birthday"
                    : String(detailVoucher?.campaignType || "").trim().toLowerCase() === "monthly"
                      ? "monthly_rank"
                      : String(detailVoucher?.campaignType || "").trim().toLowerCase() === "welcome"
                        ? "new_user"
                        : String(detailVoucher?.campaignType || "").trim().toLowerCase() === "happy_hour"
                          ? "flash_sale"
                          : "manual");
                const targetUser = String(detailVoucher?.targetUser || "all");
                const targetRank = String(detailVoucher?.targetRank || "");
                const voucherScope =
                  detailVoucher.applyFor === "all"
                    ? "Tất cả"
                    : detailVoucher.applyFor === "category"
                      ? `Danh mục: ${detailVoucher.categoryId?.name || "--"}`
                      : `${Array.isArray(detailVoucher.productIds) ? detailVoucher.productIds.length : 0} sản phẩm`;

                return (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-stone-800">Chi tiết voucher</h3>
                        <p className="text-sm text-stone-500">
                          {detailVoucher.voucherCode} • {detailVoucher.voucherName}
                        </p>
                      </div>
                      <button type="button" onClick={() => setDetailVoucher(null)} className="btn btn-cancel">
                        Đóng
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase text-gray-500">Loại phát</div>
                        <div className="font-medium text-stone-800">{ISSUE_TYPE_LABEL[issueType] || issueType}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                        <div className="text-xs font-semibold uppercase text-stone-500">Đối tượng user</div>
                        <div className="font-medium text-stone-800">{TARGET_USER_LABEL[targetUser] || targetUser}</div>
                        {targetUser === "rank" ? (
                          <div className="mt-1 text-xs text-stone-500">Rank: {RANK_LABEL[targetRank] || "--"}</div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                        <div className="text-xs font-semibold uppercase text-stone-500">Áp dụng</div>
                        <div className="font-medium text-stone-800">{voucherScope}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                        <div className="text-xs font-semibold uppercase text-stone-500">Thời gian</div>
                        <div className="font-medium text-stone-800">
                          {formatDate(detailVoucher.startDate)} - {formatDate(detailVoucher.endDate)}
                        </div>
                        {issueType === "flash_sale" ? (
                          <div className="mt-1 text-xs text-stone-500">
                            {formatTime(detailVoucher.startDate)} - {formatTime(detailVoucher.endDate)}
                          </div>
                        ) : null}
                      </div>
                      {issueType === "coin_exchange" ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 md:col-span-2">
                          <div className="text-xs font-semibold uppercase text-stone-500">Xu đổi</div>
                          <div className="font-medium text-stone-800">{Number(detailVoucher.coinCost || 0)} Xu</div>
                        </div>
                      ) : null}
                      {issueType === "birthday" ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 md:col-span-2">
                          <div className="text-xs font-semibold uppercase text-stone-500">Hiệu lực sau khi phát</div>
                          <div className="font-medium text-stone-800">{Number(detailVoucher.expireDays || 0)} ngày</div>
                        </div>
                      ) : null}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default VouchersPage;

