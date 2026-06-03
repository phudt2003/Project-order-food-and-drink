/* eslint-disable react-refresh/only-export-components */
import axios from "axios";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { normalizeToppingSelections, toppingsKeyPart } from "../utils/toppings";
import { getVoucherState } from "../utils/voucher";

export const StoreContext = createContext(null);
export const UIContext = createContext(null);

const DELIVERY_LOCATION_KEY = "deliveryLocation";
const DELIVERY_LOCATION_REQUIRED_MESSAGE = "Vui lòng chọn địa chỉ giao hàng trước khi đặt món.";
const VOUCHER_INTENT_STORAGE_KEY = "voucher_intent_v1";
const DEFAULT_API_URL = "http://localhost:4000";

const buildApiList = () => {
  const apiUrl = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim();
  return apiUrl ? [apiUrl] : [];
};

const API_URLS = buildApiList();

const computeVoucherActiveCount = (vouchers, currentUserId = "") => {
  return (Array.isArray(vouchers) ? vouchers : []).reduce((count, voucher) => {
    if (getVoucherState(voucher, currentUserId).isAvailable) count += 1
    return count
  }, 0)
}

const safeParseJson = (value, fallback = null) => {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeVoucherIntent = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const code = String(raw?.code || raw?.voucher?.voucherCode || "").trim().toUpperCase();
  const status = String(raw?.status || "pending").trim().toLowerCase();
  if (!code) return null;
  if (status !== "pending" && status !== "applied") return null;
  const pendingVoucherId = String(raw?.pendingVoucherId || "").trim();
  const appliedDiscount = Number(raw?.appliedDiscount);
  const silentAutoApply = Boolean(raw?.silentAutoApply);
  return {
    code,
    status,
    voucher: raw?.voucher && typeof raw.voucher === "object" ? raw.voucher : null,
    pendingVoucherId: pendingVoucherId || "",
    appliedDiscount: Number.isFinite(appliedDiscount) ? appliedDiscount : 0,
    silentAutoApply,
    savedAt: Number(raw?.savedAt || Date.now()),
  };
};

const buildVoucherSnapshot = (voucher) => {
  if (!voucher || typeof voucher !== "object") return null;

  const snapshot = {
    _id: voucher?._id,
    voucherCode: String(voucher?.voucherCode || "").trim().toUpperCase(),
    voucherName: String(voucher?.voucherName || ""),
    discountType: voucher?.discountType,
    discountValue: voucher?.discountValue,
    voucherType: voucher?.voucherType,
    startDate: voucher?.startDate,
    endDate: voucher?.endDate,
    startTime: voucher?.startTime,
    endTime: voucher?.endTime,
    minOrderValue: voucher?.minOrderValue,
    maxUsage: voucher?.maxUsage,
    usagePerUser: voucher?.usagePerUser,
    usedCount: voucher?.usedCount,
    usedByUsers: voucher?.usedByUsers,
    status: voucher?.status,
    applyFor: voucher?.applyFor,
    categoryId: voucher?.categoryId,
    productIds: voucher?.productIds,
    campaignType: voucher?.campaignType,
    issueType: voucher?.issueType,
  };

  if (!snapshot.voucherCode) return null;
  return snapshot;
};

const pickApiBase = async (timeoutMs = 2500, healthPath = "/") => {
  for (const base of API_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${base}${healthPath}`, { signal: controller.signal });
      clearTimeout(timer);

      if (response && response.ok) {
        return base;
      }
    } catch {
      // Try next base URL
    }
  }

  return API_URLS[0] || "";
};

const getUserIdFromToken = (authToken) => {
  if (!authToken) return "";

  try {
    const payloadBase64 = authToken.split(".")[1];
    if (!payloadBase64) return "";

    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(normalized);
    const payload = JSON.parse(payloadJson);

    return String(payload?.id || payload?._id || payload?.userId || "");
  } catch {
    return "";
  }
};

const buildCartLineKey = ({ productId, size, sugarLevel, iceLevel, toppings }) =>
  [productId, size || "", sugarLevel || "", iceLevel || "", toppingsKeyPart(toppings)].join("|");

const getClerkPrimaryEmail = (user) => {
  const direct = String(user?.primaryEmailAddress?.emailAddress || "").trim();
  if (direct) return direct;

  const firstEmail = Array.isArray(user?.emailAddresses)
    ? String(user.emailAddresses.find((item) => item?.emailAddress)?.emailAddress || "").trim()
    : "";

  return firstEmail;
};

const getClerkDisplayName = (user) => {
  const directName = String(user?.fullName || user?.username || user?.firstName || "").trim();
  if (directName) return directName;

  const email = getClerkPrimaryEmail(user);
  if (email.includes("@")) return email.split("@")[0];
  return email;
};

const normalizeCartItems = (items) => {
  if (!Array.isArray(items)) return [];

  const lineMap = new Map();

  items.forEach((item) => {
    const quantity = Number(item?.quantity || 0);
    const product = item?.product || {};
    const productId = String(item?.productId || product?._id || "");
    const unitPrice = Number(item?.unitPrice ?? product?.price ?? 0);

    if (!productId || quantity <= 0) return;

    const normalizedItem = {
      productId,
      quantity,
      unitPrice,
      size: String(item?.size || ""),
      toppings: normalizeToppingSelections(item?.toppings),
      sugarLevel: String(item?.sugarLevel || ""),
      iceLevel: String(item?.iceLevel || ""),
      product: {
        _id: String(product?._id || productId),
        name: String(product?.name || ""),
        image: String(product?.image || ""),
        price: Number(product?.price || unitPrice || 0),
        type: String(product?.type || ""),
        categoryId: String(product?.categoryId || ""),
        category: String(product?.category || ""),
        description: String(product?.description || ""),
      },
    };

    const lineKey = buildCartLineKey(normalizedItem);
    const existing = lineMap.get(lineKey);

    if (!existing) {
      lineMap.set(lineKey, {
        ...normalizedItem,
        lineKey,
      });
      return;
    }

    existing.quantity += normalizedItem.quantity;
    existing.lineTotal = existing.unitPrice * existing.quantity;
  });

  return Array.from(lineMap.values()).map((line) => ({
    ...line,
    lineTotal: line.unitPrice * line.quantity,
  }));
};

const StoreContextProvider = ({ children }) => {
  const [apiBase, setApiBase] = useState(API_URLS[0] || "");
  const url = apiBase;
  const { isLoaded, isSignedIn, user } = useUser();

  const [cartItems, setCartItems] = useState({});
  const [cartLineItems, setCartLineItems] = useState([]);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [food_list, setFoodList] = useState([]);
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [userProfile, setUserProfile] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [syncRouteUnavailable, setSyncRouteUnavailable] = useState(false);
  const syncWarnedRef = useRef(false);
  const [reviewsRefreshKey, setReviewsRefreshKey] = useState(0);
  const [deliveryLocation, setDeliveryLocation] = useState(
    () => localStorage.getItem(DELIVERY_LOCATION_KEY) || ""
  );

  // VOUCHER BADGE STATES
  const [myVouchers, setMyVouchers] = useState([]);
  const [voucherIntent, setVoucherIntent] = useState(() =>
    normalizeVoucherIntent(safeParseJson(localStorage.getItem(VOUCHER_INTENT_STORAGE_KEY), null))
  );
  const [voucherToast, setVoucherToast] = useState(null);
  const voucherToastTimerRef = useRef(null);
  const voucherAutoApplyRef = useRef({ key: "", inFlight: false });
  const currentUserId = String(userProfile?._id || userProfile?.id || "");
  const voucherActiveCount = useMemo(
    () => computeVoucherActiveCount(myVouchers, currentUserId),
    [myVouchers, currentUserId]
  );

  const pushVoucherToast = useCallback((kind, message) => {
    const text = String(message || "").trim();
    if (!text) return;

    setVoucherToast({ id: Date.now(), kind: String(kind || "info"), message: text });
  }, []);

  useEffect(() => {
    if (!voucherToast) return undefined;

    if (voucherToastTimerRef.current) {
      clearTimeout(voucherToastTimerRef.current);
      voucherToastTimerRef.current = null;
    }

    voucherToastTimerRef.current = setTimeout(() => {
      voucherToastTimerRef.current = null;
      setVoucherToast(null);
    }, 3000);

    return () => {
      if (voucherToastTimerRef.current) {
        clearTimeout(voucherToastTimerRef.current);
        voucherToastTimerRef.current = null;
      }
    };
  }, [voucherToast?.id]);

  useEffect(() => {
    const normalized = normalizeVoucherIntent(voucherIntent);
    if (!normalized) {
      localStorage.removeItem(VOUCHER_INTENT_STORAGE_KEY);
      return;
    }

    localStorage.setItem(VOUCHER_INTENT_STORAGE_KEY, JSON.stringify(normalized));
  }, [voucherIntent]);

  const clearVoucherIntent = useCallback(() => {
    setVoucherIntent(null);
    localStorage.removeItem(VOUCHER_INTENT_STORAGE_KEY);
  }, []);

  const saveVoucherIntent = useCallback((voucher, status = "pending", options = {}) => {
    const snapshot = buildVoucherSnapshot(voucher);
    const code = String(snapshot?.voucherCode || "").trim().toUpperCase();
    if (!code) return;

    const pendingVoucherId = String(options?.pendingVoucherId || "").trim();
    const appliedDiscount = Number(options?.appliedDiscount);
    const silentAutoApply = Boolean(options?.silentAutoApply);

    setVoucherIntent({
      code,
      status: status === "applied" ? "applied" : "pending",
      voucher: snapshot,
      pendingVoucherId: pendingVoucherId || "",
      appliedDiscount: Number.isFinite(appliedDiscount) ? appliedDiscount : 0,
      silentAutoApply,
      savedAt: Date.now(),
    });
  }, []);

  // =========================
  // Voucher APIs (claim/apply)
  // =========================
  const claimVoucher = useCallback(async ({ voucherId, code } = {}) => {
    const safeVoucherId = String(voucherId || "").trim();
    const voucherCode = String(code || "").trim().toUpperCase();
    if (!safeVoucherId && !voucherCode) throw new Error("Voucher không hợp lệ.");
    if (!token) throw new Error("Vui lòng đăng nhập để sử dụng voucher.");

    const response = await axios.post(
      `${url}/api/vouchers/claim`,
      safeVoucherId ? { voucherId: safeVoucherId } : { code: voucherCode },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response?.data;
  }, [token, url]);

  const applyVoucher = useCallback(async ({ code, shippingFee } = {}) => {
    const voucherCode = String(code || "").trim().toUpperCase();
    if (!voucherCode) throw new Error("Voucher không hợp lệ.");
    if (!token) throw new Error("Vui lòng đăng nhập để sử dụng voucher.");

    const payload = { code: voucherCode };
    if (shippingFee != null) payload.shippingFee = shippingFee;

    const response = await axios.post(
      `${url}/api/vouchers/apply`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response?.data;
  }, [token, url]);

  const refreshMyVouchers = useCallback(async () => {
    if (!token) {
      setMyVouchers([]);
      return;
    }

    try {
      const response = await axios.get(`${url}/api/user/my-vouchers`, { headers: { token } });
      if (response?.data?.success && Array.isArray(response.data.data)) {
        setMyVouchers(response.data.data);
      } else {
        setMyVouchers([]);
      }
    } catch (error) {
      console.error("Refresh my vouchers error:", error);
      setMyVouchers([]);
    }
  }, [token, url]);

  const clearCart = useCallback(() => {
    setCartItems({});
    setCartLineItems([]);
  }, []);

  const applyCartResponse = useCallback((data, options = {}) => {
    const { preserveIfMissing = false } = options;
    const hasCartMap = data?.cartData && typeof data.cartData === "object";
    const hasCartLines = Array.isArray(data?.cartItems);

    setCartItems((prev) => {
      if (hasCartMap) return data.cartData;
      return preserveIfMissing ? prev : {};
    });

    setCartLineItems((prev) => {
      if (hasCartLines) return normalizeCartItems(data.cartItems);
      return preserveIfMissing ? prev : [];
    });
  }, []);

  const loadCartData = useCallback(async (authToken) => {
    setIsCartLoading(true);
    try {
      if (!authToken) {
        clearCart();
        return;
      }

      const userId = getUserIdFromToken(authToken);

      try {
        if (userId) {
          const response = await axios.get(`${url}/api/cart/${userId}`, {
            headers: { token: authToken },
          });

          if (response?.data?.success) {
            applyCartResponse(response.data);
            return;
          }
        }

        const response = await axios.get(`${url}/api/cart`, {
          headers: { token: authToken },
        });

        if (response?.data?.success) {
          applyCartResponse(response.data);
          return;
        }
      } catch {
        try {
          const fallbackResponse = await axios.post(
            `${url}/api/cart/get`,
            {},
            { headers: { token: authToken } }
          );

          if (fallbackResponse?.data?.success) {
            applyCartResponse(fallbackResponse.data);
            return;
          }
        } catch (fallbackError) {
          console.error("Load cart error:", fallbackError);
        }
      }

      clearCart();
    } finally {
      setIsCartLoading(false);
    }
  }, [url, clearCart, applyCartResponse]);

  const refreshCart = useCallback(async () => {
    await loadCartData(token);
  }, [loadCartData, token]);

  const notifyReviewsChanged = useCallback(() => {
    setReviewsRefreshKey((prev) => prev + 1);
  }, []);

  const getDeliveryLocation = useCallback(() => {
    return localStorage.getItem(DELIVERY_LOCATION_KEY) || "";
  }, []);

  const hasDeliveryLocation = useCallback(() => {
    return Boolean(getDeliveryLocation());
  }, [getDeliveryLocation]);

  const requireDeliveryLocation = useCallback((showMessage = true) => {
    const location = getDeliveryLocation();
    const isValid = Boolean(location);

    if (!isValid && showMessage) {
      alert(DELIVERY_LOCATION_REQUIRED_MESSAGE);
    }

    return isValid;
  }, [getDeliveryLocation]);

  const saveDeliveryLocation = useCallback((locationValue) => {
    const nextLocation = String(locationValue || "").trim();
    setDeliveryLocation(nextLocation);

    if (!nextLocation) {
      localStorage.removeItem(DELIVERY_LOCATION_KEY);
      return;
    }

    localStorage.setItem(DELIVERY_LOCATION_KEY, nextLocation);
  }, []);

  const syncBackendSession = useCallback(async (forceRetry = false, profileOverride = null) => {
    const activeProfile = profileOverride || user;
    if (!isSignedIn || !activeProfile || (syncRouteUnavailable && !forceRetry)) return "";

    const payload = {
      clerkId: activeProfile.id,
      email: getClerkPrimaryEmail(activeProfile),
      name: getClerkDisplayName(activeProfile),
    };

    if (!payload.clerkId || !payload.email) {
      return "";
    }

    try {
      const response = await axios.post(`${url}/api/user/clerk-sync`, payload);
      if (response?.data?.success && response?.data?.token) {
        setSyncRouteUnavailable(false);
        syncWarnedRef.current = false;
        setToken(response.data.token);
        return String(response.data.token);
      }
    } catch (error) {
      const statusCode = error?.response?.status;
      if (statusCode && statusCode !== 404) {
        console.error("Sync Clerk user error:", error);
        return "";
      }
    }

    setSyncRouteUnavailable(true);
    if (!syncWarnedRef.current) {
      console.error("Sync Clerk user error: backend route not found for Clerk sync.");
      syncWarnedRef.current = true;
    }
    return "";
  }, [isSignedIn, user, url, syncRouteUnavailable]);

  const addToCart = useCallback(async (itemInput) => {
    const payload =
      typeof itemInput === "object" && itemInput !== null
        ? itemInput
        : { itemId: String(itemInput) };
    const itemId = String(payload.itemId || payload.productId || "");

    if (!itemId) return false;

    let authToken = token;
    if (!authToken) {
      if (!isSignedIn) {
        setShowLogin(true);
        return false;
      }
      if (syncRouteUnavailable) {
        return false;
      }
      authToken = await syncBackendSession(true);
      if (!authToken) return false;
    }

    const optimisticQuantity = Math.max(1, Math.round(Number(payload.quantity) || 1));
    setCartItems((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + optimisticQuantity,
    }));

    try {
      const response = await axios.post(
        `${url}/api/cart/add`,
        payload,
        { headers: { token: authToken } }
      );

      if (response?.data?.success) {
        const hasCartPayload =
          (response.data?.cartData && typeof response.data.cartData === "object") ||
          Array.isArray(response.data?.cartItems);

        if (hasCartPayload) {
          applyCartResponse(response.data, { preserveIfMissing: true });
        } else {
          await loadCartData(authToken);
        }
        return true;
      }

      pushVoucherToast?.("error", response?.data?.message || "Không thể thêm món vào giỏ hàng.");
      await loadCartData(authToken);
      return false;
    } catch (error) {
      console.error("Add to cart error:", error);
      await loadCartData(authToken);
      pushVoucherToast?.(
        "error",
        error?.response?.data?.message || error?.message || "Không thể thêm món vào giỏ hàng."
      );
      return false;
    }
  }, [token, isSignedIn, syncRouteUnavailable, url, applyCartResponse, loadCartData, syncBackendSession, pushVoucherToast]);

  const removeFromCart = useCallback(async (itemInput) => {
    if (!token) return;

    const payload =
      typeof itemInput === "object" && itemInput !== null
        ? itemInput
        : { itemId: String(itemInput) };
    const itemId = String(payload.itemId || payload.productId || "");
    const removeAll = payload.removeAll === true;
    const removeQuantityRaw = Number(payload.removeQuantity ?? payload.quantity ?? 1);
    const removeQuantity = Number.isFinite(removeQuantityRaw)
      ? Math.max(1, Math.round(removeQuantityRaw))
      : 1;
    if (!itemId) return;

    setCartItems((prev) => {
      const updated = { ...prev };
      if (!updated[itemId]) return prev;

      updated[itemId] -= removeAll ? removeQuantity : 1;
      if (updated[itemId] <= 0) delete updated[itemId];

      return updated;
    });

    try {
      const removePayload = {
        ...payload,
        removeAll,
        removeQuantity: removeAll ? removeQuantity : 1,
      };
      const response = await axios.post(
        `${url}/api/cart/remove`,
        removePayload,
        { headers: { token } }
      );

      if (response?.data?.success) {
        const hasCartPayload =
          (response.data?.cartData && typeof response.data.cartData === "object") ||
          Array.isArray(response.data?.cartItems);

        if (hasCartPayload) {
          applyCartResponse(response.data, { preserveIfMissing: true });
        } else {
          await loadCartData(token);
        }
      }
    } catch (error) {
      console.error("Remove cart error:", error);
      await loadCartData(token);
    }
  }, [token, url, applyCartResponse, loadCartData]);

  const getTotalCartAmount = useCallback(
    () => cartLineItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
    [cartLineItems]
  );

  const getTotalCartItems = useCallback(
    () => Object.values(cartItems).reduce((sum, quantity) => sum + Number(quantity || 0), 0),
    [cartItems]
  );

  const isVoucherApplicableToCart = useCallback((voucher) => {
    const applyFor = String(voucher?.applyFor || "all").trim().toLowerCase();
    if (applyFor === "all") return true;

    const lines = Array.isArray(cartLineItems) ? cartLineItems : [];

    if (applyFor === "category") {
      const categoryId = String(voucher?.categoryId || "").trim();
      if (!categoryId) return true;
      return lines.some((line) => String(line?.product?.categoryId || "") === categoryId);
    }

    if (applyFor === "product") {
      const ids = (Array.isArray(voucher?.productIds) ? voucher.productIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean);
      if (ids.length === 0) return true;

      return lines.some((line) => {
        const productId = String(line?.productId || line?.product?._id || "").trim();
        return productId && ids.includes(productId);
      });
    }

    return true;
  }, [cartLineItems]);

  const resolveVoucherForIntent = useCallback((intent) => {
    if (!intent?.code) return null;

    const code = String(intent.code).trim().toUpperCase();
    const list = Array.isArray(myVouchers) ? myVouchers : [];
    const fromMine = list.find((item) => String(item?.voucherCode || "").trim().toUpperCase() === code);
    return fromMine || intent?.voucher || null;
  }, [myVouchers]);

  const validateVoucherForCart = useCallback((voucher, { currentUserId, cartSubtotal }) => {
    if (!voucher) return { ok: false, hard: true, message: "Voucher không tồn tại." };

    const state = getVoucherState(voucher, currentUserId);
    if (!state.isAvailable) {
      if (state.isExpired) return { ok: false, hard: true, message: "Voucher đã hết hạn." };
      if (state.isNotStarted) return { ok: false, hard: false, reason: "upcoming", message: "Voucher chưa đến thời gian sử dụng." };
      if (state.isOutsideTimeWindow) return { ok: false, hard: false, reason: "time_window", message: "Voucher chưa đến thời gian sử dụng." };
      if (state.isInactive) return { ok: false, hard: true, message: "Voucher đang tạm ngưng." };
      if (state.isPerUserUsedUp || state.isUsedUp) return { ok: false, hard: true, message: "Voucher đã hết lượt sử dụng." };
      return { ok: false, hard: true, message: "Voucher không dùng được." };
    }

    if (!isVoucherApplicableToCart(voucher)) {
      return { ok: false, hard: false, reason: "scope", message: "Voucher chưa phù hợp với sản phẩm trong giỏ hàng." };
    }

    const minOrderValue = Number(voucher?.minOrderValue || 0);
    if (minOrderValue > 0 && Number(cartSubtotal || 0) < minOrderValue) {
      return { ok: false, hard: false, reason: "min_order", message: "Chưa đủ giá trị đơn tối thiểu để áp dụng voucher." };
    }

    return { ok: true, hard: false, message: "" };
  }, [isVoucherApplicableToCart]);

  useEffect(() => {
    const intent = normalizeVoucherIntent(voucherIntent);
    if (!intent) return;

    const currentUserId = String(userProfile?._id || userProfile?.id || "");
    const cartSubtotal = getTotalCartAmount();
    const totalItems = getTotalCartItems();

    const voucher = resolveVoucherForIntent(intent);
    const result = validateVoucherForCart(voucher, { currentUserId, cartSubtotal });

    const formatMoney = (amount) => {
      const value = Math.round(Math.max(0, Number(amount || 0)));
      try {
        return `${value.toLocaleString("vi-VN")}đ`;
      } catch {
        return `${value}đ`;
      }
    };

    const isHardServerMessage = (message) => {
      const msg = String(message || "").toLowerCase();
      if (!msg) return false;
      return (
        msg.includes("hết hạn") ||
        msg.includes("hết lượt") ||
        msg.includes("tạm ngưng") ||
        msg.includes("không dành cho") ||
        msg.includes("đơn đầu tiên") ||
        msg.includes("không tồn tại") ||
        msg.includes("không hợp lệ")
      );
    };

    // pending -> auto apply khi giỏ có món và đã đủ điều kiện
    if (intent.status === "pending") {
      if (totalItems <= 0) return;

      if (result.hard) {
        clearVoucherIntent();
        pushVoucherToast("error", result.message || "Voucher không dùng được.");
        return;
      }

      // Chưa đủ điều kiện (min order / scope) -> giữ pending, không spam toast
      if (!result.ok) return;

      const attemptKey = `${intent.code}|${Math.round(Number(cartSubtotal || 0))}|${totalItems}`;
      if (voucherAutoApplyRef.current.inFlight) return;
      if (voucherAutoApplyRef.current.key === attemptKey) return;

      voucherAutoApplyRef.current.key = attemptKey;
      voucherAutoApplyRef.current.inFlight = true;

      let cancelled = false;
      (async () => {
        try {
          const data = await applyVoucher({ code: intent.code });
          if (!data?.success) {
            if (isHardServerMessage(data?.message)) {
              clearVoucherIntent();
              pushVoucherToast("error", data?.message || "Voucher không dùng được.");
            }
            return;
          }

          const discount = Number(data?.data?.discount ?? 0);
          setVoucherIntent((prev) => {
            const normalizedPrev = normalizeVoucherIntent(prev);
            if (!normalizedPrev || normalizedPrev.code !== intent.code) return prev;
            if (normalizedPrev.status === "applied") return prev;
            return {
              ...normalizedPrev,
              status: "applied",
              voucher: buildVoucherSnapshot(voucher) || normalizedPrev.voucher,
              appliedDiscount: Number.isFinite(discount) ? discount : 0,
              pendingVoucherId: "",
              silentAutoApply: false,
            };
          });
          if (!cancelled && !intent.silentAutoApply) {
            pushVoucherToast("success", `Voucher đã áp dụng! Giảm ${formatMoney(discount)}.`);
          }
        } catch (error) {
          const msg = error?.response?.data?.message || error?.message || "";
          if (isHardServerMessage(msg)) {
            clearVoucherIntent();
            pushVoucherToast("error", msg || "Voucher không dùng được.");
          }
        } finally {
          voucherAutoApplyRef.current.inFlight = false;
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    // applied
    if (totalItems <= 0) {
      setVoucherIntent((prev) => {
        const normalizedPrev = normalizeVoucherIntent(prev);
        if (!normalizedPrev) return null;
        return { ...normalizedPrev, status: "pending", appliedDiscount: 0, silentAutoApply: false };
      });
      return;
    }

    if (!result.ok) {
      if (result.hard) {
        clearVoucherIntent();
        pushVoucherToast("error", result.message || "Voucher không dùng được.");
        return;
      }

      // Soft-invalid: giữ pending để auto-apply khi user đạt điều kiện.
      setVoucherIntent((prev) => {
        const normalizedPrev = normalizeVoucherIntent(prev);
        if (!normalizedPrev) return null;
        return {
          ...normalizedPrev,
          status: "pending",
          appliedDiscount: 0,
          silentAutoApply: false,
          voucher: buildVoucherSnapshot(voucher) || normalizedPrev.voucher,
        };
      });
    }
  }, [
    voucherIntent,
    cartLineItems,
    userProfile?._id,
    userProfile?.id,
    getTotalCartAmount,
    getTotalCartItems,
    resolveVoucherForIntent,
    validateVoucherForCart,
    clearVoucherIntent,
    pushVoucherToast,
    applyVoucher,
  ]);

  const fetchFoodList = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/product/list`);
      const foods = response?.data?.data;
      const list = Array.isArray(foods) ? foods : [];
      const visibleFoods = list.filter((item) => item?.isActive !== false);
      console.log("fetchFoodList response =", response?.data);
      console.log("food_list =", visibleFoods);
      setFoodList(visibleFoods);
    } catch (error) {
      console.error("Fetch food list error:", error);
      setFoodList([]);
    }
  }, [url]);

  useEffect(() => {
    fetchFoodList();
  }, [fetchFoodList]);

  useEffect(() => {
    let alive = true;
    pickApiBase().then((picked) => {
      if (alive && picked) {
        setApiBase(picked);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      if (token) setToken("");
      setSyncRouteUnavailable(false);
      syncWarnedRef.current = false;
      return;
    }
    if (token) return;
    syncBackendSession();
  }, [isLoaded, isSignedIn, user, token, syncBackendSession]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || token) return undefined;

    const retryTimer = setTimeout(() => {
      syncBackendSession(true);
    }, 1200);

    return () => clearTimeout(retryTimer);
  }, [isLoaded, isSignedIn, user, token, syncBackendSession]);

  useEffect(() => {
    if (!token) {
      localStorage.removeItem("token");
      clearCart();
      setUserProfile(null);
      setMyVouchers([]);
      setVoucherIntent(null);
      setVoucherToast(null);
      localStorage.removeItem(VOUCHER_INTENT_STORAGE_KEY);
      return;
    }

    localStorage.setItem("token", token);
    loadCartData(token);
    refreshMyVouchers();
  }, [token, loadCartData, clearCart, refreshMyVouchers]);

  useEffect(() => {
    let interval;
    if (token) {
      refreshMyVouchers();
      interval = setInterval(refreshMyVouchers, 5 * 60 * 1000); // 5 minutes
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, url, refreshMyVouchers]);

  const refreshUserProfile = useCallback(async (authToken = token) => {
    const activeToken = String(authToken || "").trim();
    if (!activeToken) return null;

    try {
      const response = await axios.get(`${url}/api/user/me`, { headers: { token: activeToken } });
      if (response?.data?.success && response?.data?.user) {
        setUserProfile(response.data.user);
        return response.data.user;
      }
    } catch (error) {
      console.error("Fetch user profile error:", error);
    }

    return null;
  }, [token, url]);

  const updateBirthday = useCallback(async (birthday) => {
    if (!token) return { success: false, message: "Login First" };

    try {
      const response = await axios.post(
        `${url}/api/user/birthday`,
        { birthday },
        { headers: { token } }
      );
      if (response?.data?.success && response?.data?.user) {
        setUserProfile(response.data.user);
      } else {
        await refreshUserProfile(token);
      }
      return response?.data || { success: false };
    } catch (error) {
      console.error("Update birthday error:", error);
      return error?.response?.data || { success: false, message: "Không cập nhật được ngày sinh" };
    }
  }, [token, url, refreshUserProfile]);

  const dailyCheckin = useCallback(async () => {
    if (!token) return { success: false, message: "Login First" };

    try {
      const response = await axios.post(`${url}/api/user/checkin`, {}, { headers: { token } });
      if (response?.data?.success && response?.data?.user) {
        setUserProfile(response.data.user);
      } else {
        await refreshUserProfile(token);
      }
      return response?.data || { success: false };
    } catch (error) {
      console.error("Daily checkin error:", error);
      const data = error?.response?.data || { success: false, message: "Không thể check-in" };
      if (data?.user) setUserProfile(data.user);
      return data;
    }
  }, [token, url, refreshUserProfile]);

  const checkBirthdayReward = useCallback(async () => {
    if (!token) return null;

    try {
      const response = await axios.post(
        `${url}/api/user/birthday/reward`,
        {},
        { headers: { token } }
      );
      return response?.data || null;
    } catch (error) {
      console.error("Check birthday reward error:", error);
      return error?.response?.data || null;
    }
  }, [token, url]);

  const autoSyncVouchers = useCallback(async () => {
    if (!token) return null;

    try {
      const response = await axios.post(
        `${url}/api/user/vouchers/auto-sync`,
        {},
        { headers: { token } }
      );
      return response?.data || null;
    } catch (error) {
      console.error("Auto sync vouchers error:", error);
      return error?.response?.data || null;
    }
  }, [token, url]);

  const fetchMyVouchers = useCallback(async () => {
    if (!token) return { success: false, data: [] };

    try {
      const response = await axios.get(`${url}/api/user/my-vouchers`, { headers: { token } });
      return response?.data || { success: false, data: [] };
    } catch (error) {
      console.error("Fetch my vouchers error:", error);
      return error?.response?.data || { success: false, data: [] };
    }
  }, [token, url]);

  const fetchLoyaltySummary = useCallback(async () => {
    if (!token) return { success: false };

    try {
      const response = await axios.get(`${url}/api/loyalty/summary`, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Fetch loyalty summary error:", error);
      return error?.response?.data || { success: false, message: "Không tải được dữ liệu điểm thưởng" };
    }
  }, [token, url]);

  const fetchCheckinCalendar = useCallback(async () => {
    if (!token) return { success: false };

    try {
      const response = await axios.get(`${url}/api/loyalty/checkin-calendar`, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Fetch checkin calendar error:", error);
      return error?.response?.data || { success: false, message: "Không tải được lịch điểm danh" };
    }
  }, [token, url]);

  const fetchCheckinStatus = useCallback(async () => {
    if (!token) return { success: false };

    try {
      const response = await axios.get(`${url}/api/loyalty/checkin-status`, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Fetch checkin status error:", error);
      return error?.response?.data || { success: false, message: "Không tải được trạng thái điểm danh" };
    }
  }, [token, url]);

  const loyaltyCheckin = useCallback(async () => {
    if (!token) return { success: false, message: "Login First" };

    try {
      const response = await axios.post(`${url}/api/loyalty/checkin`, {}, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Loyalty checkin error:", error);
      return error?.response?.data || { success: false, message: "Không thể check-in" };
    }
  }, [token, url]);

  const loyaltyClaimMission = useCallback(async (key) => {
    if (!token) return { success: false, message: "Login First" };

    try {
      const response = await axios.post(`${url}/api/loyalty/missions/claim`, { key }, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Loyalty claim mission error:", error);
      return error?.response?.data || { success: false, message: "Không thể nhận thưởng" };
    }
  }, [token, url]);

  const loyaltyRedeem = useCallback(async (id) => {
    if (!token) return { success: false, message: "Login First" };

    try {
      const response = await axios.post(`${url}/api/loyalty/redeem`, { id }, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Loyalty redeem error:", error);
      return error?.response?.data || { success: false, message: "Không thể đổi xu" };
    }
  }, [token, url]);

  const fetchCoinTransactions = useCallback(async (limit = 50) => {
    if (!token) return { success: false, data: [] };

    try {
      const response = await axios.get(`${url}/api/loyalty/transactions?limit=${limit}`, { headers: { token } });
      return response?.data || { success: false, data: [] };
    } catch (error) {
      console.error("Fetch coin transactions error:", error);
      return error?.response?.data || { success: false, data: [] };
    }
  }, [token, url]);

  const loyaltyApplyReferral = useCallback(async (code) => {
    if (!token) return { success: false, message: "Login First" };

    try {
      const response = await axios.post(`${url}/api/loyalty/referral/apply`, { code }, { headers: { token } });
      return response?.data || { success: false };
    } catch (error) {
      console.error("Apply referral error:", error);
      return error?.response?.data || { success: false, message: "Không thể áp dụng mã giới thiệu" };
    }
  }, [token, url]);

  useEffect(() => {
    fetchFoodList();
  }, [fetchFoodList]);

  useEffect(() => {
    let alive = true;
    pickApiBase().then((picked) => {
      if (alive && picked) {
        setApiBase(picked);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      if (token) setToken("");
      setSyncRouteUnavailable(false);
      syncWarnedRef.current = false;
      return;
    }
    if (token) return;
    syncBackendSession();
  }, [isLoaded, isSignedIn, user, token, syncBackendSession]);

  useEffect(() => {
    if (!token) {
      localStorage.removeItem("token");
      clearCart();
      setUserProfile(null);
      setMyVouchers([]);
      return;
    }

    localStorage.setItem("token", token);
    loadCartData(token);
    refreshMyVouchers();
  }, [token, loadCartData, clearCart, refreshMyVouchers]);

  useEffect(() => {
    let interval;
    if (token) {
      refreshMyVouchers();
      interval = setInterval(refreshMyVouchers, 5 * 60 * 1000); // 5 minutes
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, url, refreshMyVouchers]);

  useEffect(() => {
    if (!token) return;
    refreshUserProfile(token);
  }, [token, url, refreshUserProfile]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === DELIVERY_LOCATION_KEY) {
        setDeliveryLocation(event.newValue || "");
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const contextValue = useMemo(() => ({
    food_list,
    cartItems,
    cartLineItems,
    isCartLoading,
    setCartItems,
    addToCart,
    removeFromCart,
    refreshCart,
    getTotalCartAmount,
    getTotalCartItems,
    url,
    token,
    setToken,
    syncBackendSession,
    userProfile,
    refreshUserProfile,
    updateBirthday,
    dailyCheckin,
    checkBirthdayReward,
    autoSyncVouchers,
    fetchMyVouchers,
    fetchLoyaltySummary,
    fetchCheckinCalendar,
    fetchCheckinStatus,
    loyaltyCheckin,
    loyaltyClaimMission,
    loyaltyRedeem,
    fetchCoinTransactions,
    loyaltyApplyReferral,
    clearCart,
    deliveryLocation,
    getDeliveryLocation,
    hasDeliveryLocation,
    requireDeliveryLocation,
    saveDeliveryLocation,
    reviewsRefreshKey,
    notifyReviewsChanged,
    myVouchers,
    voucherActiveCount,
    refreshMyVouchers,
    voucherIntent,
    saveVoucherIntent,
    clearVoucherIntent,
    pushVoucherToast,
    claimVoucher,
    applyVoucher,
    voucherToast,
  }), [
    food_list,
    cartItems,
    cartLineItems,
    isCartLoading,
    addToCart,
    removeFromCart,
    refreshCart,
    getTotalCartAmount,
    getTotalCartItems,
    url,
    token,
    setToken,
    syncBackendSession,
    userProfile,
    refreshUserProfile,
    updateBirthday,
    dailyCheckin,
    checkBirthdayReward,
    autoSyncVouchers,
    fetchMyVouchers,
    fetchLoyaltySummary,
    fetchCheckinCalendar,
    fetchCheckinStatus,
    loyaltyCheckin,
    loyaltyClaimMission,
    loyaltyRedeem,
    fetchCoinTransactions,
    loyaltyApplyReferral,
    clearCart,
    deliveryLocation,
    getDeliveryLocation,
    hasDeliveryLocation,
    requireDeliveryLocation,
    saveDeliveryLocation,
    reviewsRefreshKey,
    notifyReviewsChanged,
    myVouchers,
    voucherActiveCount,
    refreshMyVouchers,
    voucherIntent,
    saveVoucherIntent,
    clearVoucherIntent,
    pushVoucherToast,
    claimVoucher,
    applyVoucher,
    voucherToast,
  ]);

  const uiValue = useMemo(() => ({ showLogin, setShowLogin }), [showLogin]);

  return (
    <UIContext.Provider value={uiValue}>
      <StoreContext.Provider value={contextValue}>{children}</StoreContext.Provider>
    </UIContext.Provider>
  );
};

export default StoreContextProvider;

