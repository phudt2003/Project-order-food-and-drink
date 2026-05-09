import React, { useEffect, useMemo, useRef, useState } from "react";
import { searchCustomerUsers, type CustomerUser } from "../../api/usersApi";

export type VoucherStatus = "active" | "inactive";
export type VoucherType = "FOOD" | "DRINK" | "FOOD_DRINK" | "SHIPPING";
export type DiscountType = "amount" | "percent";

export type CodeStatus = "checking" | "available" | "taken" | null;

export type VoucherFormValues = {
  voucherCode: string;
  voucherName: string;
  issueType: string;
  targetUser: string;
  targetRank: string;
  assignedUsers: CustomerUser[];
  coinCost: string;
  expireDays: string;
  comebackAfterDays: string;
  flashStartTime: string;
  flashEndTime: string;
  startDate: string;
  endDate: string;
  applyFor: "all" | "category" | "product";
  categoryId: string;
  productIds: string[];
  voucherType: VoucherType;
  discountType: DiscountType;
  discountValue: string;
  minOrderValue: string;
  maxUsage: string;
  usagePerUser: string;
  status: VoucherStatus;
  triggerCondition: {
    ratingLte: string;
    userRanks: string[];
    minOrderValue: string;
  };
};

type CategoryGroup = "drinks" | "foods" | "other";
type Category = { _id: string; name: string; group?: CategoryGroup };
type Product = { _id: string; name: string; type?: string; categoryId?: any };

const inputStyle =
  "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-200 disabled:opacity-70 disabled:cursor-not-allowed";

const labelStyle = "text-sm font-semibold text-stone-700";

const BAD_REVIEW_RANKS = [
  { value: "member", label: "Member" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "diamond", label: "Diamond" },
];

const codeStatusText = (status: CodeStatus) => {
  if (status === "checking") return { icon: "", text: "Đang kiểm tra...", cls: "text-stone-500" };
  if (status === "available") return { icon: "✓", text: "Khả dụng", cls: "text-green-600" };
  if (status === "taken") return { icon: "✕", text: "Đã tồn tại", cls: "text-red-600" };
  return { icon: "", text: "", cls: "" };
};

export default function VoucherForm({
  url,
  form,
  setForm,
  submitting,
  editingId,
  codeStatus,
  onGenerateCode,
  onSubmit,
  onCancelEdit,
  categories,
  products,
}: {
  url: string;
  form: VoucherFormValues;
  setForm: React.Dispatch<React.SetStateAction<VoucherFormValues>>;
  submitting: boolean;
  editingId: string;
  codeStatus: CodeStatus;
  onGenerateCode: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
  categories: Category[];
  products: Product[];
}) {
  const isFlashSale = form.issueType === "flash_sale";
  const isBirthday = form.issueType === "birthday";
  const isMonthlyRank = form.issueType === "monthly_rank";
  const isNewUser = form.issueType === "new_user";
  const isComeback = form.issueType === "comeback";
  const isCoin = form.issueType === "coin_exchange";
  const isPersonalized = form.issueType === "personalized";
  const isBadReview = form.issueType === "auto_bad_review";
  const isDateRequired =
    !isCoin && !isNewUser && !isBirthday && !isComeback && !isMonthlyRank && !isPersonalized && !isBadReview;
  const showExpireDays = isCoin || isNewUser || isBirthday || isComeback || isMonthlyRank || isPersonalized || isBadReview;

  const codeInfo = useMemo(() => codeStatusText(codeStatus), [codeStatus]);
  const isCodeBlocked = Boolean(form.voucherCode && (codeStatus === "taken" || codeStatus === "checking"));
  const isPersonalizedBlocked = Boolean(isPersonalized && (!form.assignedUsers || form.assignedUsers.length === 0));

  const isShipping = form.voucherType === "SHIPPING";
  const isDrink = form.voucherType === "DRINK";
  const isFood = form.voucherType === "FOOD";
  const isFoodDrink = form.voucherType === "FOOD_DRINK";
  const isAllDisallowed = isDrink || isFood;

  const toCategoryGroup = (value?: string): CategoryGroup => {
    const v = String(value || "").trim().toLowerCase();
    if (v === "drinks" || v === "foods" || v === "other") return v as CategoryGroup;
    return "other";
  };

  const expectedGroup: CategoryGroup = isDrink ? "drinks" : isFood ? "foods" : "other";
  const isFoodProduct = (p: Product) => String(p?.type || "").trim().toLowerCase() === "food";

  const targetUserOptions = useMemo(() => {
    if (isMonthlyRank) {
      return [
        { value: "all", label: "Tất cả user" },
        { value: "rank", label: "Theo Rank" },
      ];
    }
    if (isNewUser) return [{ value: "all", label: "Tất cả user" }];
    if (isBirthday) return [{ value: "all", label: "Tất cả user" }];
    return [
      { value: "all", label: "Tất cả user" },
      { value: "rank", label: "Theo Rank" },
    ];
  }, [isMonthlyRank, isNewUser, isBirthday]);

  const filteredCategories = useMemo(() => {
    if (!isDrink && !isFood) return categories || [];
    return (categories || []).filter((c) => toCategoryGroup(c?.group) === expectedGroup);
  }, [categories, expectedGroup, isDrink, isFood]);

  const filteredProducts = useMemo(() => {
    if (!isDrink && !isFood) return products || [];
    return (products || []).filter((p) => (isDrink ? !isFoodProduct(p) : isFoodProduct(p)));
  }, [products, isDrink, isFood]);

  const scopeWarning = useMemo(() => {
    if (isShipping && form.applyFor !== "all") {
      return "Voucher miễn/giảm phí ship chỉ áp dụng theo phạm vi 'Tất cả'.";
    }

    if (isFoodDrink && form.applyFor !== "all") {
      return "Voucher giảm đồ ăn và đồ uống không cần phạm vi áp dụng (phải để 'Tất cả').";
    }

    if (isAllDisallowed && form.applyFor === "all") {
      return isDrink
        ? "Với loại 'Giảm đồ uống', phạm vi không thể là 'Tất cả' (tránh giảm nhầm món ăn). Hãy chọn 'Theo danh mục' hoặc 'Theo sản phẩm'."
        : "Với loại 'Giảm món ăn', phạm vi không thể là 'Tất cả' (tránh giảm nhầm đồ uống). Hãy chọn 'Theo danh mục' hoặc 'Theo sản phẩm'.";
    }

    if (form.applyFor === "category" && form.categoryId) {
      const selected = (categories || []).find((c) => String(c?._id) === String(form.categoryId));
      const group = toCategoryGroup(selected?.group);
      if ((isDrink || isFood) && group !== expectedGroup) {
        return isDrink ? "Danh mục đã chọn không thuộc nhóm đồ uống." : "Danh mục đã chọn không thuộc nhóm món ăn.";
      }
    }

    if (form.applyFor === "product" && Array.isArray(form.productIds) && form.productIds.length > 0) {
      const selectedProducts = (products || []).filter((p) => (form.productIds || []).includes(String(p?._id)));
      if (selectedProducts.length !== form.productIds.length) return "Có sản phẩm không hợp lệ trong danh sách đã chọn.";

      if (isDrink) {
        const invalid = selectedProducts.some((p) => isFoodProduct(p));
        if (invalid) return "Voucher đồ uống chỉ áp dụng cho sản phẩm đồ uống.";
      }

      if (isFood) {
        const invalid = selectedProducts.some((p) => !isFoodProduct(p));
        if (invalid) return "Voucher món ăn chỉ áp dụng cho sản phẩm món ăn.";
      }
    }

    return "";
  }, [categories, expectedGroup, form.applyFor, form.categoryId, form.productIds, isAllDisallowed, isDrink, isFood, isFoodDrink, isShipping, products]);

  const isScopeInvalid = Boolean(scopeWarning);

  const prevVoucherTypeRef = useRef<VoucherType>(form.voucherType);

  useEffect(() => {
    const prevType = prevVoucherTypeRef.current;
    if (prevType === form.voucherType) return;
    prevVoucherTypeRef.current = form.voucherType;

    setForm((prev) => {
      const next: VoucherFormValues = { ...prev };

      if (form.voucherType === "SHIPPING") {
        next.applyFor = "all";
        next.categoryId = "";
        next.productIds = [];
        next.discountType = "amount";
        return next;
      }

      if (form.voucherType === "FOOD_DRINK") {
        next.applyFor = "all";
        next.categoryId = "";
        next.productIds = [];
        return next;
      }

      if ((form.voucherType === "DRINK" || form.voucherType === "FOOD") && next.applyFor === "all") {
        next.applyFor = "category";
        next.categoryId = "";
        next.productIds = [];
      }

      const nextGroup: CategoryGroup = form.voucherType === "DRINK" ? "drinks" : "foods";

      if (next.applyFor === "category" && next.categoryId) {
        const selected = (categories || []).find((c) => String(c?._id) === String(next.categoryId));
        const group = toCategoryGroup(selected?.group);
        if (group !== nextGroup) next.categoryId = "";
      }

      if (next.applyFor === "product" && Array.isArray(next.productIds) && next.productIds.length > 0) {
        const allowed = (products || [])
          .filter((p) => (form.voucherType === "DRINK" ? !isFoodProduct(p) : isFoodProduct(p)))
          .map((p) => String(p?._id));
        next.productIds = next.productIds.filter((id) => allowed.includes(String(id)));
      }

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.voucherType]);

  useEffect(() => {
    if (isMonthlyRank && !["all", "rank"].includes(form.targetUser)) {
      setForm((prev) => ({ ...prev, targetUser: "rank", targetRank: prev.targetRank || "" }));
      return;
    }
    if (isNewUser && form.targetUser !== "new") {
      setForm((prev) => ({ ...prev, targetUser: "new", targetRank: "" }));
      return;
    }
    if (isBirthday && form.targetUser !== "all") {
      setForm((prev) => ({ ...prev, targetUser: "all", targetRank: "" }));
    }
  }, [isMonthlyRank, isNewUser, isBirthday, form.targetUser, setForm]);

  useEffect(() => {
    if (form.voucherType !== "SHIPPING" && form.voucherType !== "FOOD_DRINK") return;
    if (form.applyFor === "all") return;
    setForm((prev) => ({ ...prev, applyFor: "all", categoryId: "", productIds: [], discountType: "amount" }));
  }, [form.applyFor, form.voucherType, setForm]);

  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState<CustomerUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const userSeqRef = useRef(0);

  useEffect(() => {
    if (!isPersonalized || !url) return;

    const q = String(userQuery || "").trim();
    if (q.length < 2) {
      setUserOptions([]);
      setUserLoading(false);
      return;
    }

    setUserLoading(true);
    const seq = (userSeqRef.current += 1);
    const timer = window.setTimeout(async () => {
      const res = await searchCustomerUsers(url, q);
      if (seq !== userSeqRef.current) return;
      setUserOptions(res?.success && Array.isArray(res.data) ? res.data : []);
      setUserLoading(false);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [isPersonalized, url, userQuery]);

  const selectedIds = useMemo(() => new Set((form.assignedUsers || []).map((u) => String(u?._id))), [form.assignedUsers]);

  const addAssignedUser = (user: CustomerUser) => {
    if (!user?._id) return;
    setForm((prev) => {
      const existed = (prev.assignedUsers || []).some((u) => String(u?._id) === String(user._id));
      if (existed) return prev;
      return { ...prev, assignedUsers: [...(prev.assignedUsers || []), user] };
    });
  };

  const removeAssignedUser = (id: string) => {
    setForm((prev) => ({
      ...prev,
      assignedUsers: (prev.assignedUsers || []).filter((u) => String(u?._id) !== String(id)),
    }));
  };

  const toggleBadReviewRank = (rank: string) => {
    setForm((prev) => {
      const current = Array.isArray(prev.triggerCondition?.userRanks) ? prev.triggerCondition.userRanks : [];
      const set = new Set(current);
      if (set.has(rank)) set.delete(rank);
      else set.add(rank);
      return {
        ...prev,
        triggerCondition: {
          ...prev.triggerCondition,
          userRanks: Array.from(set),
        },
      };
    });
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-800">{editingId ? "Cập nhật voucher" : "Tạo voucher"}</h1>
          <p className="mt-1 text-sm text-stone-500">
            Kiểm tra mã realtime để tránh trùng, và có thể tự động sinh mã dễ đọc.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelStyle}>Mã voucher</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <input
                className={inputStyle}
                value={form.voucherCode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    voucherCode: String(e.target.value || "").toUpperCase(),
                  }))
                }
                placeholder="Ví dụ: COFFEE20"
              />
              {codeInfo.text ? (
                <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${codeInfo.cls}`}>
                  {codeInfo.icon ? <span aria-hidden="true">{codeInfo.icon}</span> : null}
                  <span>{codeInfo.text}</span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn h-12 bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
              onClick={onGenerateCode}
              disabled={submitting}
            >
              Tự động tạo mã
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelStyle}>Tên voucher</span>
          <input
            className={inputStyle}
            value={form.voucherName}
            onChange={(e) => setForm((prev) => ({ ...prev, voucherName: e.target.value }))}
            placeholder="Ví dụ: Giảm 20k cho đơn từ 100k"
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelStyle}>Loại phát</span>
          <select
            className={inputStyle}
            value={form.issueType}
            onChange={(e) => setForm((prev) => ({ ...prev, issueType: e.target.value }))}
          >
            <option value="manual">Manual</option>
            <option value="flash_sale">Flash sale</option>
            <option value="new_user">User mới</option>
            <option value="birthday">Sinh nhật</option>
            <option value="comeback">Quay lại</option>
            <option value="monthly_rank">Hàng tháng</option>
            <option value="coin_exchange">Đổi Xu</option>
            <option value="auto_bad_review">Voucher đánh giá tệ</option>
            <option value="personalized">Cá nhân hóa</option>
          </select>
        </label>

        {isBadReview ? (
          <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="text-sm font-semibold text-stone-800">Cấu hình điều kiện phát</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelStyle}>Rating &lt;=</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  className={inputStyle}
                  value={form.triggerCondition?.ratingLte || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      triggerCondition: {
                        ...prev.triggerCondition,
                        ratingLte: e.target.value,
                      },
                    }))
                  }
                  placeholder="Ví dụ: 2"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelStyle}>Đơn tối thiểu</span>
                <input
                  type="number"
                  min={0}
                  className={inputStyle}
                  value={form.triggerCondition?.minOrderValue || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      triggerCondition: {
                        ...prev.triggerCondition,
                        minOrderValue: e.target.value,
                      },
                    }))
                  }
                  placeholder="Ví dụ: 80000"
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className={labelStyle}>Hạng user áp dụng</span>
                <div className="flex flex-wrap gap-2">
                  {BAD_REVIEW_RANKS.map((rank) => {
                    const checked = (form.triggerCondition?.userRanks || []).includes(rank.value);
                    return (
                      <label
                        key={rank.value}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                          checked ? "border-amber-300 bg-amber-100 text-amber-800" : "border-stone-200 text-stone-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-amber-500"
                          checked={checked}
                          onChange={() => toggleBadReviewRank(rank.value)}
                        />
                        {rank.label}
                      </label>
                    );
                  })}
                </div>
                <span className="text-xs text-stone-500">Bỏ trống = áp dụng tất cả hạng.</span>
              </div>
            </div>
          </div>
        ) : null}

        {isPersonalized ? (
          <label className="flex flex-col gap-2 md:col-span-2">
            <span className={labelStyle}>Chọn khách hàng</span>
            <input
              className={inputStyle}
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Tìm theo SDT / Email / Tên..."
            />
            {userLoading ? <div className="text-xs text-stone-500">Đang tìm...</div> : null}
            {!userLoading && userQuery.trim().length >= 2 && userOptions.length === 0 ? (
              <div className="text-xs text-stone-500">Không tìm thấy khách hàng.</div>
            ) : null}
            {userOptions.length > 0 ? (
              <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white">
                {userOptions.map((user) => {
                  const id = String(user?._id || "");
                  const disabled = selectedIds.has(id);
                  const line = [user?.phone, user?.email].filter(Boolean).join(" - ");
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) addAssignedUser(user);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition ${
                        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-orange-50"
                      }`}
                    >
                      <div className="font-medium text-stone-800">{user?.name || "(Không có tên)"}</div>
                      {line ? <div className="text-xs text-stone-500">{line}</div> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(form.assignedUsers || []).map((u) => (
                <span
                  key={String(u?._id || u?.email || u?.phone || Math.random())}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
                >
                  {u?.name || u?.phone || u?.email || "User"}
                  <button
                    type="button"
                    className="text-amber-800 hover:text-amber-900"
                    onClick={() => removeAssignedUser(String(u?._id || ""))}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
            <p className="text-xs text-stone-500">Chọn ít nhất 1 khách hàng.</p>
          </label>
        ) : null}

        {isCoin ? (
          <label className="flex flex-col gap-1.5">
            <span className={labelStyle}>Số xu đổi</span>
            <input
              type="number"
              min={1}
              className={inputStyle}
              value={form.coinCost}
              onChange={(e) => setForm((prev) => ({ ...prev, coinCost: e.target.value }))}
              placeholder="Ví dụ: 100"
            />
          </label>
        ) : null}

        {showExpireDays ? (
          <label className="flex flex-col gap-1.5">
            <span className={labelStyle}>Số ngày sử dụng</span>
            <input
              type="number"
              min={1}
              className={inputStyle}
              value={form.expireDays}
              onChange={(e) => setForm((prev) => ({ ...prev, expireDays: e.target.value }))}
              placeholder="Ví dụ: 7"
            />
          </label>
        ) : null}

        {isComeback ? (
          <label className="flex flex-col gap-1.5">
            <span className={labelStyle}>Số ngày chưa mua hàng</span>
            <input
              type="number"
              min={1}
              className={inputStyle}
              value={form.comebackAfterDays}
              onChange={(e) => setForm((prev) => ({ ...prev, comebackAfterDays: e.target.value }))}
              placeholder="Ví dụ: 30"
            />
          </label>
        ) : null}

        {isDateRequired ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={labelStyle}>Ngày bắt đầu</span>
              <input
                type="date"
                className={inputStyle}
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelStyle}>Ngày kết thúc</span>
              <input
                type="date"
                className={inputStyle}
                value={form.endDate}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
          </>
        ) : null}

        {isFlashSale ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={labelStyle}>Giờ bắt đầu (Flash Sale)</span>
              <input
                type="time"
                className={inputStyle}
                value={form.flashStartTime}
                onChange={(e) => setForm((prev) => ({ ...prev, flashStartTime: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelStyle}>Giờ kết thúc (Flash Sale)</span>
              <input
                type="time"
                className={inputStyle}
                value={form.flashEndTime}
                onChange={(e) => setForm((prev) => ({ ...prev, flashEndTime: e.target.value }))}
              />
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className={labelStyle}>Loại voucher</span>
          <select
            className={inputStyle}
            value={form.voucherType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                voucherType: e.target.value as VoucherType,
                discountType: e.target.value === "SHIPPING" ? "amount" : prev.discountType,
              }))
            }
          >
            <option value="FOOD">Giảm món ăn</option>
            <option value="DRINK">Giảm đồ uống</option>
            <option value="FOOD_DRINK">Giảm đồ ăn và đồ uống</option>
            <option value="SHIPPING">Miễn/giảm phí ship</option>
          </select>
          <span className="text-xs text-stone-500">
            {isShipping
              ? "Miễn/giảm phí ship: áp dụng cho toàn bộ đơn hàng."
              : isDrink
                ? "Giảm đồ uống: chỉ áp dụng cho đồ uống (không giảm món ăn)."
                : isFood
                  ? "Giảm món ăn: chỉ áp dụng cho món ăn/bánh (không giảm đồ uống)."
                  : "Giảm đồ ăn và đồ uống: không cần phạm vi áp dụng."}
          </span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelStyle}>Kiểu giảm</span>
            <select
              className={inputStyle}
              value={form.discountType}
              onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as DiscountType }))}
              disabled={form.voucherType === "SHIPPING"}
            >
              <option value="amount">VND</option>
              <option value="percent">%</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelStyle}>Giá trị giảm</span>
            <input
              type="number"
              min={0}
              className={inputStyle}
              value={form.discountValue}
              onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
              placeholder={form.discountType === "percent" ? "Ví dụ: 10" : "Ví dụ: 20000"}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelStyle}>Đơn tối thiểu</span>
          <input
            type="number"
            min={0}
            className={inputStyle}
            value={form.minOrderValue}
            onChange={(e) => setForm((prev) => ({ ...prev, minOrderValue: e.target.value }))}
            placeholder="Ví dụ: 100000"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelStyle}>Tổng lượt dùng tối đa</span>
          <input
            type="number"
            min={0}
            className={inputStyle}
            value={form.maxUsage}
            onChange={(e) => setForm((prev) => ({ ...prev, maxUsage: e.target.value }))}
            placeholder="0 = không giới hạn"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelStyle}>Lượt dùng / user</span>
          <input
            type="number"
            min={1}
            className={inputStyle}
            value={form.usagePerUser}
            onChange={(e) => setForm((prev) => ({ ...prev, usagePerUser: e.target.value }))}
            placeholder="Ví dụ: 1"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelStyle}>Trạng thái</span>
          <select
            className={inputStyle}
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as VoucherStatus }))}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-3 md:col-span-2">
          <button
            type="submit"
            className="btn h-12 bg-orange-500 px-8 font-bold text-white shadow-lg hover:bg-orange-600 disabled:opacity-50"
            disabled={submitting || isCodeBlocked || isScopeInvalid || isPersonalizedBlocked}
          >
            {submitting ? "Đang lưu..." : editingId ? "Cập nhật Voucher" : "Tạo Voucher"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn h-12 bg-stone-100 px-6 font-semibold text-stone-600 hover:bg-stone-200"
              onClick={onCancelEdit}
            >
              Hủy sửa
            </button>
          ) : null}
        </div>
      </form>

      {isScopeInvalid ? (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-200">
          ⚠️ {scopeWarning}
        </div>
      ) : null}
    </section>
  );
}
