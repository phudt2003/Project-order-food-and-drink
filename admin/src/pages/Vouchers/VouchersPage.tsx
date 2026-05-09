import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import http from "../../api/http";
import {
  checkVoucherCode,
  createVoucher,
  deleteVoucher,
  deleteAutoVoucher,
  getAutoVouchers,
  getVouchers,
  updateAutoVoucher,
  updateVoucher,
  updateVoucherStatus,
} from "../../api/vouchersApi";
import VoucherForm, { CodeStatus, VoucherFormValues } from "./VoucherForm";
import VoucherList, { VoucherRow } from "./VoucherList";
import AutoVoucherList, { AutoVoucherRow } from "./AutoVoucherList";
import { generateUniqueVoucherCode, normalizeVoucherCode } from "../../utils/generateVoucherCode";
import DeleteConfirmModal from "../../components/products/DeleteConfirmModal";

const initialForm: VoucherFormValues = {
  voucherCode: "",
  voucherName: "",
  issueType: "manual",
  targetUser: "all",
  targetRank: "",
  assignedUsers: [],
  coinCost: "",
  expireDays: "",
  comebackAfterDays: "",
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
  triggerCondition: {
    ratingLte: "",
    userRanks: [],
    minOrderValue: "",
  },
};

type Category = { _id: string; name: string; group?: "drinks" | "foods" | "other" };
type Product = { _id: string; name: string; type?: string; categoryId?: any };

const toIso = (dateString: string, timeString: string) => {
  if (!dateString) return "";
  const time = timeString || "00:00";
  const date = new Date(`${dateString}T${time}:00`);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString();
};

const buildPayload = (form: VoucherFormValues) => {
  const isFlashSale = form.issueType === "flash_sale";
  const isCoin = form.issueType === "coin_exchange";
  const isNewUser = form.issueType === "new_user";
  const isBirthday = form.issueType === "birthday";
  const isComeback = form.issueType === "comeback";
  const isMonthlyRank = form.issueType === "monthly_rank";
  const isPersonalized = form.issueType === "personalized";
  const isBadReview = form.issueType === "auto_bad_review";
  const startDate = isFlashSale ? toIso(form.startDate, form.flashStartTime) : form.startDate;
  const endDate = isFlashSale ? toIso(form.endDate, form.flashEndTime) : form.endDate;
  const isDateOptional = isBirthday || isComeback || isMonthlyRank || isPersonalized || isBadReview;
  const defaultStart = new Date().toISOString().slice(0, 10);
  const defaultEnd = (() => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 10);
    return future.toISOString().slice(0, 10);
  })();

  const triggerCondition = (() => {
    if (!isBadReview) return null;
    const ratingRaw = form.triggerCondition?.ratingLte ?? "";
    const minOrderRaw = form.triggerCondition?.minOrderValue ?? "";
    const ratingLte = ratingRaw !== "" && Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
    const minOrderValue = minOrderRaw !== "" && Number.isFinite(Number(minOrderRaw)) ? Number(minOrderRaw) : null;
    const userRanks = Array.isArray(form.triggerCondition?.userRanks)
      ? form.triggerCondition.userRanks.filter(Boolean)
      : [];

    if (ratingLte == null && minOrderValue == null && userRanks.length === 0) return null;
    return {
      ratingLte,
      userRanks,
      minOrderValue,
    };
  })();

  return {
    voucherCode: normalizeVoucherCode(form.voucherCode),
    voucherName: String(form.voucherName || "").trim(),
    issueType: form.issueType,
    // Voucher cá nhân hóa: targetUser/targetRank không còn ý nghĩa (đã giới hạn bằng assignedUsers)
    targetUser: form.issueType === "personalized" ? "all" : form.targetUser,
    targetRank: form.issueType === "personalized" ? null : form.targetUser === "rank" ? form.targetRank : null,
    assignedUsers: form.issueType === "personalized" ? (form.assignedUsers || []).map((u) => String(u?._id || "")) : [],
    coinCost: Number(form.coinCost || 0),
    expireDays: Number(form.expireDays || 0),
    comebackAfterDays: form.issueType === "comeback" ? Number(form.comebackAfterDays || 0) : 0,
    startDate: isDateOptional ? null : (isCoin || isNewUser) ? defaultStart : startDate,
    endDate: isDateOptional ? null : (isCoin || isNewUser) ? defaultEnd : endDate,
    applyFor: form.voucherType === "SHIPPING" || form.voucherType === "FOOD_DRINK" ? "all" : form.applyFor,
    categoryId: (form.voucherType === "SHIPPING" || form.voucherType === "FOOD_DRINK" ? "all" : form.applyFor) === "category" ? form.categoryId : null,
    productIds: (form.voucherType === "SHIPPING" || form.voucherType === "FOOD_DRINK" ? "all" : form.applyFor) === "product" ? form.productIds : [],
    voucherType: form.voucherType,
    type: form.voucherType === "SHIPPING" ? "shipping" : "product",
    discountType: form.voucherType === "SHIPPING" ? "amount" : form.discountType,
    discountValue: Number(form.discountValue || 0),
    minOrderValue: Number(form.minOrderValue || 0),
    maxUsage: Number(form.maxUsage || 0),
    usagePerUser: Number(form.usagePerUser || 1),
    status: form.status,
    triggerCondition,
  };
};

const validateForm = (form: VoucherFormValues, products: Product[], categories: Category[]) => {
  if (!String(form.voucherCode || "").trim()) return "Vui long nhap ma voucher.";
  if (!String(form.voucherName || "").trim()) return "Vui long nhap ten voucher.";
  const requiresDate = ![
    "coin_exchange",
    "new_user",
    "birthday",
    "comeback",
    "monthly_rank",
    "personalized",
    "auto_bad_review",
  ].includes(form.issueType);
  if (requiresDate && !form.startDate) return "Vui long chon ngay bat dau.";
  if (requiresDate && !form.endDate) return "Vui long chon ngay ket thuc.";

  if (requiresDate) {
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "Ngay bat dau/ket thuc khong hop le.";
    if (start > end) return "Ngay bat dau phai truoc ngay ket thuc.";
  }

  if (form.issueType !== "personalized" && form.targetUser === "rank" && !form.targetRank) return "Vui long chon Rank ap dung.";
  if (form.issueType === "coin_exchange" && Number(form.coinCost || 0) <= 0) return "Xu doi phai lon hon 0.";
  if (["coin_exchange", "new_user"].includes(form.issueType) && Number(form.expireDays || 0) <= 0) {
    return "Vui long nhap so ngay su dung.";
  }
  if (["birthday", "comeback", "monthly_rank", "auto_bad_review"].includes(form.issueType) && Number(form.expireDays || 0) <= 0) {
    return "So ngay su dung phai lon hon 0.";
  }
  if (form.issueType === "personalized" && Number(form.expireDays || 0) <= 0) {
    return "Vui long nhap so ngay su dung.";
  }
  if (form.issueType === "comeback" && Number(form.comebackAfterDays || 0) <= 0) {
    return "Vui long nhap so ngay chua mua hang.";
  }

  if (form.issueType === "personalized" && (!form.assignedUsers || form.assignedUsers.length === 0)) {
    return "Vui lòng chọn ít nhất 1 khách hàng.";
  }

  if (form.issueType === "auto_bad_review") {
    const ratingRaw = form.triggerCondition?.ratingLte;
    const minOrderRaw = form.triggerCondition?.minOrderValue;
    const userRanks = Array.isArray(form.triggerCondition?.userRanks)
      ? form.triggerCondition.userRanks.filter(Boolean)
      : [];
    const hasRating = ratingRaw !== "" && ratingRaw != null;
    const hasMinOrder = minOrderRaw !== "" && minOrderRaw != null;
    if (!hasRating && !hasMinOrder && userRanks.length === 0) {
      return "Vui long nhap it nhat 1 dieu kien phat (rating / don toi thieu / hang user).";
    }
    if (ratingRaw !== "" && ratingRaw != null) {
      const ratingValue = Number(ratingRaw);
      if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        return "Rating điều kiện phải từ 1 đến 5.";
      }
    }
    if (minOrderRaw !== "" && minOrderRaw != null) {
      const minOrderValue = Number(minOrderRaw);
      if (!Number.isFinite(minOrderValue) || minOrderValue < 0) {
        return "Giá trị đơn tối thiểu không hợp lệ.";
      }
    }
  }

  if (form.applyFor === "category" && !form.categoryId) return "Vui lòng chọn danh mục.";
  if (form.applyFor === "product" && (!form.productIds || form.productIds.length === 0)) return "Vui lòng chọn sản phẩm.";

  if (form.voucherType !== "SHIPPING" && form.discountType === "percent" && Number(form.discountValue) > 100) {
    return "Giảm theo % không được vượt quá 100.";
  }
  if (!Number.isFinite(Number(form.minOrderValue)) || Number(form.minOrderValue) < 0) return "Đơn tối thiểu không hợp lệ.";
  if (!Number.isFinite(Number(form.maxUsage)) || Number(form.maxUsage) < 0) return "Tổng lượt dùng tối đa không hợp lệ.";
  if (!Number.isFinite(Number(form.usagePerUser)) || Number(form.usagePerUser) < 1) return "Lượt dùng/user phải >= 1.";

  // Optional: nếu chọn giảm đồ uống mà có product là Food thì cảnh báo (giống logic cũ)
  if (form.applyFor === "product" && form.voucherType === "DRINK") {
    const invalid = (form.productIds || []).some((pid) => {
      const p = products.find((x) => String(x._id) === String(pid));
      const pt = String(p?.type || "").toLowerCase();
      return pt === "food";
    });
    if (invalid) return "Voucher đồ uống chỉ áp dụng cho sản phẩm đồ uống.";
  }

  // Validate thêm: "Loại voucher" vs "Phạm vi áp dụng" + group danh mục/sản phẩm
  const effectiveApplyFor = form.voucherType === "SHIPPING" || form.voucherType === "FOOD_DRINK" ? "all" : form.applyFor;

  if (form.voucherType === "SHIPPING" && form.applyFor !== "all") {
    return "Voucher ship chỉ áp dụng theo phạm vi 'Tất cả'.";
  }

  if (form.voucherType === "FOOD_DRINK" && form.applyFor !== "all") {
    return "Voucher giam do an va do uong khong can pham vi ap dung.";
  }

  if ((form.voucherType === "DRINK" || form.voucherType === "FOOD") && effectiveApplyFor === "all") {
    return "Phạm vi áp dụng không phù hợp với loại voucher giảm giá cụ thể.";
  }

  if (effectiveApplyFor === "category" && (form.voucherType === "DRINK" || form.voucherType === "FOOD")) {
    const cat = (categories || []).find((c) => String(c?._id) === String(form.categoryId));
    const group = String(cat?.group || "other");
    if (form.voucherType === "DRINK" && group !== "drinks") return "Danh mục không thuộc nhóm đồ uống.";
    if (form.voucherType === "FOOD" && group !== "foods") return "Danh mục không thuộc nhóm món ăn.";
  }

  if (effectiveApplyFor === "product") {
    const isFoodType = (p?: Product) => String(p?.type || "").trim().toLowerCase() === "food";
    const selectedProducts = (form.productIds || []).map((pid) => products.find((x) => String(x._id) === String(pid)));

    if (form.voucherType === "DRINK") {
      const invalid = selectedProducts.some((p) => !p || isFoodType(p));
      if (invalid) return "Voucher đồ uống chỉ áp dụng cho sản phẩm đồ uống.";
    }

    if (form.voucherType === "FOOD") {
      const invalid = selectedProducts.some((p) => !p || !isFoodType(p));
      if (invalid) return "Voucher món ăn chỉ áp dụng cho sản phẩm món ăn.";
    }
  }

  return "";
};

const pickPrefix = (issueType: string) => {
  if (issueType === "flash_sale") return "FLASH";
  if (issueType === "new_user") return "WELCOME";
  if (issueType === "comeback") return "COMEBACK";
  if (issueType === "coin_exchange") return "COFFEE";
  if (issueType === "auto_bad_review") return "SORRY";
  return "BINGO";
};

export default function VouchersPage({ url }: { url: string }) {
  const [form, setForm] = useState<VoucherFormValues>(initialForm);
  const [editingId, setEditingId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoLoading, setAutoLoading] = useState(true);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [autoVouchers, setAutoVouchers] = useState<AutoVoucherRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [codeStatus, setCodeStatus] = useState<CodeStatus>(null);
  const checkSeqRef = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<VoucherRow | null>(null);
  const [deleteAutoTarget, setDeleteAutoTarget] = useState<AutoVoucherRow | null>(null);
  const [deletingVoucher, setDeletingVoucher] = useState(false);
  const [deletingAutoVoucher, setDeletingAutoVoucher] = useState(false);

  const fetchData = async () => {
    if (!url) return;
    setLoading(true);
    setAutoLoading(true);
    try {
      const [voucherResult, autoVoucherResult, categoryResponse, productResponse] = await Promise.all([
        getVouchers(url),
        getAutoVouchers(url, { limit: 80 }),
        http.get(`${url}/api/category/list`),
        http.get(`${url}/api/product/list`),
      ]);

      setVouchers(voucherResult?.success ? (voucherResult.data as any) : []);
      setAutoVouchers(autoVoucherResult?.success ? (autoVoucherResult.data as any) : []);

      const rawCategories = Array.isArray(categoryResponse?.data?.data) ? categoryResponse.data.data : [];
      const rawProducts = Array.isArray(productResponse?.data?.data) ? productResponse.data.data : [];
      setProducts(rawProducts);

      // Derive nhóm category (drinks/foods/other) dựa trên product.type để filter chính xác.
      const statMap = new Map<string, { drinks: number; foods: number }>();
      rawProducts.forEach((p: any) => {
        const catId =
          typeof p?.categoryId === "string"
            ? String(p.categoryId)
            : String(p?.categoryId?._id || "");
        if (!catId) return;
        const rawType = String(p?.type || "").trim().toLowerCase();
        const isFood = rawType === "food";
        const stat = statMap.get(catId) || { drinks: 0, foods: 0 };
        if (isFood) stat.foods += 1;
        else stat.drinks += 1;
        statMap.set(catId, stat);
      });

      const categoriesWithGroup = rawCategories.map((c: any) => {
        const id = String(c?._id || "");
        const stat = statMap.get(id) || { drinks: 0, foods: 0 };
        const group =
          stat.drinks > 0 && stat.foods === 0
            ? "drinks"
            : stat.foods > 0 && stat.drinks === 0
              ? "foods"
              : "other";
        return { ...c, group };
      });

      setCategories(categoriesWithGroup);
    } catch {
      toast.error("Không thể tải dữ liệu voucher.");
    } finally {
      setLoading(false);
      setAutoLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Check code realtime (debounce)
  useEffect(() => {
    const code = normalizeVoucherCode(form.voucherCode);
    if (!url || !code) {
      setCodeStatus(null);
      return;
    }

    setCodeStatus("checking");
    const seq = (checkSeqRef.current += 1);
    const timer = window.setTimeout(async () => {
      try {
        const res = await checkVoucherCode(url, code, editingId);
        if (seq !== checkSeqRef.current) return;
        if (res?.success) {
          setCodeStatus(res.available ? "available" : "taken");
        } else {
          setCodeStatus(null);
        }
      } catch {
        if (seq !== checkSeqRef.current) return;
        setCodeStatus(null);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [editingId, form.voucherCode, url]);

  const resetForm = () => {
    setEditingId("");
    setForm(initialForm);
    setCodeStatus(null);
  };

  const selectedCategoryName = useMemo(() => {
    const selected = categories.find((item) => String(item._id) === String(form.categoryId));
    return selected?.name || "";
  }, [categories, form.categoryId]);

  const selectedProductNames = useMemo(() => {
    const set = new Set((form.productIds || []).map((id) => String(id)));
    return products.filter((p) => set.has(String(p._id))).map((p) => p.name);
  }, [form.productIds, products]);

  const onGenerateCode = async () => {
    if (!url) return;
    const prefix = pickPrefix(form.issueType);
    setCodeStatus("checking");

    const code = await generateUniqueVoucherCode({
      prefix,
      length: 6,
      isAvailable: async (candidate) => {
        const res = await checkVoucherCode(url, candidate, editingId);
        return Boolean(res?.success && res.available);
      },
    });

    setForm((prev) => ({ ...prev, voucherCode: code }));
    setCodeStatus("available");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validationError = validateForm(form, products, categories);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (codeStatus === "taken" || codeStatus === "checking") {
      toast.error("Mã voucher đang không khả dụng. Vui lòng đổi mã khác.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload(form);
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

  const handleEdit = (voucher: VoucherRow) => {
    const startDate = voucher?.startDate ? String(voucher.startDate).slice(0, 10) : "";
    const endDate = voucher?.endDate ? String(voucher.endDate).slice(0, 10) : "";

    setEditingId(String(voucher?._id || ""));
    setForm((prev) => ({
      ...prev,
      voucherCode: String(voucher?.voucherCode || ""),
      voucherName: String(voucher?.voucherName || ""),
      // fallback: giữ lại lựa chọn hiện tại nếu backend thiếu field
      startDate,
      endDate,
      voucherType: (String(voucher?.voucherType || (voucher?.type === "shipping" ? "SHIPPING" : "FOOD")).toUpperCase() as any) || "FOOD",
      discountType: (String(voucher?.discountType || "amount") as any) || "amount",
      discountValue: String(voucher?.discountValue ?? ""),
      status: (String(voucher?.status || "active") as any) || "active",
      minOrderValue: String(voucher?.minOrderValue ?? ""),
      maxUsage: String(voucher?.maxUsage ?? ""),
      usagePerUser: String(voucher?.usagePerUser ?? "1"),
      // các field bên dưới chỉ set nếu tồn tại
      issueType: String((voucher as any)?.issueType || prev.issueType || "manual"),
      targetUser: String((voucher as any)?.targetUser || prev.targetUser || "all"),
      targetRank: String((voucher as any)?.targetRank || ""),
      assignedUsers: Array.isArray((voucher as any)?.assignedUsers)
        ? (voucher as any).assignedUsers
            .map((u: any) => ({
              _id: typeof u === "string" ? u : String(u?._id || ""),
              name: typeof u === "object" ? String(u?.name || "") : "",
              phone: typeof u === "object" ? String(u?.phone || "") : "",
              email: typeof u === "object" ? String(u?.email || "") : "",
            }))
            .filter((u: any) => Boolean(u?._id))
        : [],
      coinCost: String((voucher as any)?.coinCost ?? ""),
      expireDays: String((voucher as any)?.expireDays ?? ""),
      comebackAfterDays: String((voucher as any)?.comebackAfterDays ?? ""),
      triggerCondition: {
        ratingLte: String(
          (voucher as any)?.triggerCondition?.ratingLte ??
            (voucher as any)?.trigger_condition?.rating_lte ??
            ""
        ),
        userRanks: Array.isArray((voucher as any)?.triggerCondition?.userRanks)
          ? (voucher as any).triggerCondition.userRanks.map((item: any) => String(item))
          : Array.isArray((voucher as any)?.trigger_condition?.user_rank)
            ? (voucher as any).trigger_condition.user_rank.map((item: any) => String(item))
            : [],
        minOrderValue: String(
          (voucher as any)?.triggerCondition?.minOrderValue ??
            (voucher as any)?.trigger_condition?.min_order_value ??
            ""
        ),
      },
      applyFor: (String((voucher as any)?.applyFor || "all") as any) || "all",
      categoryId:
        typeof (voucher as any)?.categoryId === "string"
          ? String((voucher as any).categoryId)
          : String((voucher as any)?.categoryId?._id || ""),
      productIds: Array.isArray((voucher as any)?.productIds)
        ? (voucher as any).productIds.map((item: any) => (typeof item === "string" ? item : String(item?._id || "")))
        : [],
      flashStartTime: prev.flashStartTime,
      flashEndTime: prev.flashEndTime,
    }));

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (voucher: VoucherRow) => {
    if (!voucher?._id) return;
    setDeleteTarget(voucher);
  };

  const confirmDeleteVoucher = async () => {
    if (!url || !deleteTarget?._id) return;
    setDeletingVoucher(true);
    try {
      const result = await deleteVoucher(url, deleteTarget._id);
      if (!result?.success) {
        toast.error(result?.message || "Xóa voucher thất bại.");
        return;
      }
      toast.success("Xóa voucher thành công.");
      setDeleteTarget(null);
      await fetchData();
    } finally {
      setDeletingVoucher(false);
    }
  };

  const handleToggleStatus = async (voucher: VoucherRow) => {
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

  const handleUpdateAutoVoucher = async (payload: any) => {
    if (!url) return;
    const result = await updateAutoVoucher(url, payload);
    if (!result?.success) {
      toast.error(result?.message || "Cập nhật voucher tự động thất bại.");
      return;
    }
    toast.success("Cập nhật voucher tự động thành công.");
    await fetchData();
  };

  const handleDeleteAutoVoucher = (row: AutoVoucherRow) => {
    setDeleteAutoTarget(row);
  };

  const confirmDeleteAutoVoucher = async () => {
    if (!url || !deleteAutoTarget) return;
    setDeletingAutoVoucher(true);
    try {
      const payload = {
        voucherCode: deleteAutoTarget.voucherCode,
        rewardType: deleteAutoTarget.rewardType,
        rewardYear: deleteAutoTarget.rewardYear,
      };
      const result = await deleteAutoVoucher(url, payload);
      if (!result?.success) {
        toast.error(result?.message || "Xóa voucher tự động thất bại.");
        return;
      }
      toast.success("Xóa voucher tự động thành công.");
      setDeleteAutoTarget(null);
      await fetchData();
    } finally {
      setDeletingAutoVoucher(false);
    }
  };

  return (
    <div className="space-y-5">
      <VoucherForm
        url={url}
        form={form}
        setForm={setForm}
        submitting={submitting}
        editingId={editingId}
        codeStatus={codeStatus}
        onGenerateCode={onGenerateCode}
        onSubmit={handleSubmit}
        onCancelEdit={resetForm}
        categories={categories}
        products={products}
      />

      <VoucherList
        vouchers={vouchers}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleStatus={handleToggleStatus}
      />

      <AutoVoucherList
        vouchers={autoVouchers}
        loading={autoLoading}
        onUpdate={handleUpdateAutoVoucher}
        onDelete={handleDeleteAutoVoucher}
      />

      {/* Hint nhỏ để admin nắm phạm vi hiện tại */}
      {form.applyFor !== "all" && (form.applyFor === "category" ? selectedCategoryName : selectedProductNames.length > 0) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-stone-700">
          Đang áp dụng cho:{" "}
          {form.applyFor === "category"
            ? `Danh mục ${selectedCategoryName || "--"}`
            : `${selectedProductNames.length} sản phẩm`}
        </div>
      ) : null}

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        itemName={String(deleteTarget?.voucherCode || "voucher")}
        itemLabel="voucher"
        title="Xóa voucher"
        onCancel={() => {
          if (deletingVoucher) return;
          setDeleteTarget(null);
        }}
        onConfirm={confirmDeleteVoucher}
        loading={deletingVoucher}
      />

      <DeleteConfirmModal
        open={Boolean(deleteAutoTarget)}
        itemName={String(deleteAutoTarget?.voucherCode || "voucher tự động")}
        itemLabel="voucher tự động"
        title="Xóa voucher tự động"
        onCancel={() => {
          if (deletingAutoVoucher) return;
          setDeleteAutoTarget(null);
        }}
        onConfirm={confirmDeleteAutoVoucher}
        loading={deletingAutoVoucher}
      />
    </div>
  );
}

