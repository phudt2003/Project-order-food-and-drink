import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import http from "../../api/http";
import {
  deleteProductRecipeV2,
  deleteToppingRecipeV2,
  getProductRecipeV2,
  getToppingRecipeV2,
  listIngredients,
  listRecipes,
  listToppings,
  saveProductRecipeV2,
  saveToppingRecipeV2,
} from "../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringId = (value) => String(value?._id || value?.id || value || "").trim();

const normalizeIngredientRows = (list, { includeUnit = false } = {}) => {
  const items = Array.isArray(list) ? list : [];
  const map = new Map();

  items.forEach((row) => {
    const rawId = row?.ingredientId || row?.ingredient_id || row?.ingredient || "";
    const ingredientId = String(rawId?._id || rawId || "").trim();
    if (!ingredientId) return;
    const quantity = toNumber(row?.quantity, 0);
    if (quantity <= 0) return;

    const unit = String(row?.unit || "").trim();
    const prev = map.get(ingredientId);
    if (!prev) {
      map.set(ingredientId, {
        ingredientId,
        quantity,
        unit: includeUnit ? unit : "",
      });
      return;
    }

    map.set(ingredientId, {
      ingredientId,
      quantity: toNumber(prev.quantity, 0) + quantity,
      unit: includeUnit ? prev.unit || unit : "",
    });
  });

  return Array.from(map.values());
};

const normalizeToppingRows = (list) => {
  const items = Array.isArray(list) ? list : [];
  const map = new Map();

  items.forEach((row) => {
    const rawId = row?.toppingId || row?.topping_id || row?.topping || "";
    const toppingId = String(rawId?._id || rawId || "").trim();
    if (!toppingId) return;
    const quantity = toNumber(row?.quantity, 0);
    if (quantity <= 0) return;

    map.set(toppingId, (map.get(toppingId) || 0) + quantity);
  });

  return Array.from(map.entries()).map(([toppingId, quantity]) => ({ toppingId, quantity }));
};

const Recipes = ({ url, initialProductId = "", initialTarget = "", mode = "all" }) => {
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [toppings, setToppings] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [auditMode, setAuditMode] = useState("missing"); // missing | empty | all
  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState(mode === "topping" ? "topping" : "product");
  const [targetId, setTargetId] = useState("");
  const [recipeExists, setRecipeExists] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const showProducts = mode !== "topping";
  const showToppings = mode !== "product";

  const pageTitle = showProducts && showToppings
    ? "Quáº£n lÃ½ cÃ´ng thá»©c"
    : showProducts
    ? "CÃ´ng thá»©c sáº£n pháº©m"
    : "CÃ´ng thá»©c topping";
  const pageSubtitle = showProducts && showToppings
    ? "Cáº­p nháº­t cÃ´ng thá»©c sáº£n pháº©m vÃ  topping."
    : showProducts
    ? "Má»—i sáº£n pháº©m cÃ³ cÃ´ng thá»©c Ä‘á»ƒ trá»« kho tá»± Ä‘á»™ng."
    : "Má»—i topping cÃ³ cÃ´ng thá»©c Ä‘á»ƒ sáº£n xuáº¥t.";
  const auditTitle = showProducts && showToppings
    ? "Kiá»ƒm tra cÃ´ng thá»©c (Sáº£n pháº©m & Topping)"
    : showProducts
    ? "Kiá»ƒm tra cÃ´ng thá»©c sáº£n pháº©m"
    : "Kiá»ƒm tra cÃ´ng thá»©c topping";

  const [rows, setRows] = useState([{ ingredientId: "", quantity: "", unit: "" }]);
  const [toppingRows, setToppingRows] = useState([{ toppingId: "", quantity: "" }]);

  const UNIT_OPTIONS = ["g", "ml", "kg", "l", "viÃªn", "pháº§n", "muá»—ng", "tÃºi", "há»™p"];

  const parseSelected = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return { type: "product", id: "" };
    const [type, id] = raw.split(":");
    if (!id) return { type: "product", id: "" };
    if (type === "topping") return { type: "topping", id };
    return { type: "product", id };
  };

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const buttonBase = "btn h-11 rounded-lg text-sm font-medium";
  const reloadButtonStyle = `${buttonBase} btn-view`;
  const addRowButtonStyle = `${buttonBase} btn-cancel`;
  const deleteRowButtonStyle = `${buttonBase} btn-delete w-full`;
  const saveButtonStyle = `${buttonBase} btn-confirm`;

  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [ingredients]
  );

  const pickedIngredientIds = useMemo(() => {
    const set = new Set();
    rows.forEach((row) => {
      const id = String(row?.ingredientId || "").trim();
      if (id) set.add(id);
    });
    return set;
  }, [rows]);

  const pickedToppingIds = useMemo(() => {
    const set = new Set();
    toppingRows.forEach((row) => {
      const id = String(row?.toppingId || "").trim();
      if (id) set.add(id);
    });
    return set;
  }, [toppingRows]);

  const toppingOptions = useMemo(
    () => [...toppings].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [toppings]
  );

  const selectedTarget = useMemo(() => {
    if (!targetId) return null;
    if (formType === "topping") {
      const t = toppings.find((x) => String(x?._id) === String(targetId));
      return { type: "topping", id: targetId, name: String(t?.name || ""), isTopping: true };
    }

    const p = products.find((x) => String(x?._id) === String(targetId));
    return { type: "product", id: targetId, name: String(p?.name || ""), isTopping: false };
  }, [formType, products, targetId, toppings]);

  const recipeByProductId = useMemo(() => {
    const map = new Map();
    (Array.isArray(recipes) ? recipes : []).forEach((r) => {
      const pid = toStringId(r?.productId);
      if (!pid) return;
      map.set(pid, r);
    });
    return map;
  }, [recipes]);

  const productsCoverage = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const missing = [];
    const empty = [];

    list.forEach((p) => {
      const pid = toStringId(p?._id);
      if (!pid) return;

      const recipe = recipeByProductId.get(pid) || null;
      if (!recipe) {
        missing.push(p);
        return;
      }

      const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      if (items.length === 0) empty.push(p);
    });

    return {
      total: list.length,
      missing,
      empty,
      okCount: Math.max(0, list.length - missing.length - empty.length),
    };
  }, [products, recipeByProductId]);

  const toppingsCoverage = useMemo(() => {
    const list = Array.isArray(toppings) ? toppings : [];
    const empty = list.filter((t) => (Array.isArray(t?.ingredients) ? t.ingredients : []).length === 0);
    return {
      total: list.length,
      empty,
      okCount: Math.max(0, list.length - empty.length),
    };
  }, [toppings]);

  const auditTargets = useMemo(() => {
    const mode = String(auditMode || "missing");
    const items = [];

    const pushProduct = (p, reason) => {
      const id = toStringId(p?._id);
      if (!id) return;
      items.push({
        key: `product:${id}`,
        type: "product",
        name: String(p?.name || "N/A"),
        reason,
      });
    };

    const pushTopping = (t, reason) => {
      const id = toStringId(t?._id);
      if (!id) return;
      items.push({
        key: `topping:${id}`,
        type: "topping",
        name: String(t?.name || "N/A"),
        reason,
      });
    };

    if (mode === "missing" || mode === "all") {
      if (showProducts) {
        productsCoverage.missing.forEach((p) => pushProduct(p, "ChÆ°a táº¡o cÃ´ng thá»©c"));
      }
    }
    if (mode === "empty" || mode === "all") {
      if (showProducts) {
        productsCoverage.empty.forEach((p) => pushProduct(p, "CÃ´ng thá»©c trá»‘ng"));
      }
      if (showToppings) {
        toppingsCoverage.empty.forEach((t) => pushTopping(t, "CÃ´ng thá»©c trá»‘ng"));
      }
    }

    items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
    return items;
  }, [auditMode, productsCoverage.empty, productsCoverage.missing, toppingsCoverage.empty]);

  const toppingRecipes = useMemo(() => {
    const list = Array.isArray(toppings) ? toppings : [];
    const withRecipe = list.filter((t) => (Array.isArray(t?.ingredients) ? t.ingredients : []).length > 0);
    withRecipe.sort((a, b) => {
      const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    return withRecipe;
  }, [toppings]);

  const loadRecipes = async () => {
    if (!url) return;
    if (!showProducts) {
      setRecipes([]);
      return;
    }
    setRecipesLoading(true);
    try {
      const result = await listRecipes(url);
      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ táº£i danh sÃ¡ch cÃ´ng thá»©c.");
      setRecipes(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i danh sÃ¡ch cÃ´ng thá»©c.");
    } finally {
      setRecipesLoading(false);
    }
  };

  const loadBootstrap = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const shouldFetchToppings = showToppings || showProducts;
      const [productsResponse, toppingsResult, ingredientsResult] = await Promise.all([
        showProducts ? http.get(`${url}/api/product/list`) : Promise.resolve({ data: { data: [] } }),
        shouldFetchToppings ? listToppings(url) : Promise.resolve({ success: true, data: [] }),
        listIngredients(url),
      ]);

      const p = showProducts && Array.isArray(productsResponse?.data?.data) ? productsResponse.data.data : [];
      const t = shouldFetchToppings && Array.isArray(toppingsResult?.data) ? toppingsResult.data : [];
      if (!ingredientsResult?.success) throw new Error(ingredientsResult?.message || "KhÃ´ng thá»ƒ táº£i nguyÃªn liá»‡u.");
      const i = Array.isArray(ingredientsResult.data) ? ingredientsResult.data : [];

      setProducts(p);
      setToppings(t);
      setIngredients(i);

      if (showProducts) {
        await loadRecipes();
      } else {
        setRecipes([]);
      }
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u cÃ´ng thá»©c.");
    } finally {
      setLoading(false);
    }
  };

  const loadRecipeForForm = async (type, id) => {
    if (!url || !id) return;
    if (type === "topping" && !showToppings) return;
    if (type !== "topping" && !showProducts) return;
    setFormLoading(true);
    try {
      if (type === "topping") {
        const toppingResult = await getToppingRecipeV2(url, id);
        if (!toppingResult?.success) {
          throw new Error(toppingResult?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c topping.");
        }

        const recipe = toppingResult.data;
        const nextRows = normalizeIngredientRows(recipe?.ingredients, { includeUnit: true });
        setRows(nextRows.length ? nextRows : [{ ingredientId: "", quantity: "", unit: "" }]);
        setToppingRows([{ toppingId: "", quantity: "" }]);
        setRecipeExists(nextRows.length > 0);
        return;
      }

      const result = await getProductRecipeV2(url, id);
      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c.");
      const recipe = result.data;
      if (!recipe) {
        setRows([{ ingredientId: "", quantity: "", unit: "" }]);
        setToppingRows([{ toppingId: "", quantity: "" }]);
        setRecipeExists(false);
        return;
      }

      const ingredientRows = normalizeIngredientRows(recipe?.ingredients, { includeUnit: false });
      const nextToppings = normalizeToppingRows(recipe?.toppings);
      setRows(ingredientRows.length ? ingredientRows : [{ ingredientId: "", quantity: "", unit: "" }]);
      setToppingRows(nextToppings.length ? nextToppings : [{ toppingId: "", quantity: "" }]);
      setRecipeExists(true);
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c.");
      setRows([{ ingredientId: "", quantity: "", unit: "" }]);
      setToppingRows([{ toppingId: "", quantity: "" }]);
      setRecipeExists(false);
    } finally {
      setFormLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [url, showProducts, showToppings]);

  useEffect(() => {
    if (!modalOpen) return;
    if (!targetId) {
      setRecipeExists(false);
      return;
    }
    setRecipeExists(false);
    loadRecipeForForm(formType, targetId);
  }, [formType, modalOpen, targetId]);

  const handleViewOrEdit = (key) => {
    const nextKey = String(key || "");
    if (nextKey.startsWith("topping:") && !showToppings) return;
    if (!nextKey.startsWith("topping:") && !showProducts) return;
    const { type, id } = parseSelected(nextKey);
    if (!id) return;
    setFormType(type);
    setTargetId(id);
    setRecipeExists(false);
    setModalOpen(true);
  };

  const handleDelete = useCallback(async (key) => {
    if (!window.confirm("Báº¡n cÃ³ cháº¯c muá»‘n xÃ³a cÃ´ng thá»©c nÃ y?")) return;

    try {
      const { type, id } = parseSelected(key);
      const result =
        type === "topping" ? await deleteToppingRecipeV2(url, id) : await deleteProductRecipeV2(url, id);
      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ xÃ³a.");
      toast.success("ÄÃ£ xÃ³a cÃ´ng thá»©c.");
      await loadBootstrap();
      if (String(targetId || "") === String(id || "") && formType === type) {
        setTargetId("");
        setRows([{ ingredientId: "", quantity: "", unit: "" }]);
        setToppingRows([{ toppingId: "", quantity: "" }]);
        setRecipeExists(false);
      }
    } catch (error) {
      toast.error(error.message || "Lá»—i khi xÃ³a cÃ´ng thá»©c.");
    }
  }, [formType, targetId, url]);

  const prefilledRef = useRef(false);
  useEffect(() => {
    const rawTarget = String(initialTarget || "").trim();
    const pid = String(initialProductId || "").trim();
    const targetKey = rawTarget
      ? rawTarget.includes(":")
        ? rawTarget
        : `product:${rawTarget}`
      : pid
      ? `product:${pid}`
      : "";

    if (!targetKey) return;
    if (prefilledRef.current) return;
    const isToppingTarget = targetKey.startsWith("topping:");
    if (isToppingTarget && !showToppings) return;
    if (!isToppingTarget && !showProducts) return;
    if (isToppingTarget && (!Array.isArray(toppings) || toppings.length === 0)) return;
    if (!isToppingTarget && (!Array.isArray(products) || products.length === 0)) return;
    prefilledRef.current = true;
    const { type, id } = parseSelected(targetKey);
    if (!id) return;
    setFormType(type);
    setTargetId(id);
    setRecipeExists(false);
    setModalOpen(true);
  }, [initialProductId, initialTarget, products, toppings]);

  const addRow = () => setRows((prev) => [...prev, { ingredientId: "", quantity: "", unit: "" }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) =>
    setRows((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, ...patch } : row));

      if (patch && Object.prototype.hasOwnProperty.call(patch, "ingredientId")) {
        const selected = String(patch.ingredientId || "").trim();
        if (selected) {
          return next.map((row, i) => {
            if (i === idx) return row;
            if (String(row?.ingredientId || "").trim() !== selected) return row;
            return { ...row, ingredientId: "" };
          });
        }
      }

      return next;
    });

  const addToppingRow = () => setToppingRows((prev) => [...prev, { toppingId: "", quantity: "" }]);
  const removeToppingRow = (idx) => setToppingRows((prev) => prev.filter((_, i) => i !== idx));
  const updateToppingRow = (idx, patch) =>
    setToppingRows((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, ...patch } : row));

      if (patch && Object.prototype.hasOwnProperty.call(patch, "toppingId")) {
        const selected = String(patch.toppingId || "").trim();
        if (selected) {
          return next.map((row, i) => {
            if (i === idx) return row;
            if (String(row?.toppingId || "").trim() !== selected) return row;
            return { ...row, toppingId: "" };
          });
        }
      }

      return next;
    });

  const openCreateModal = () => {
    const defaultType = mode === "topping" ? "topping" : "product";
    setFormType(defaultType);
    setTargetId("");
    setRecipeExists(false);
    setRows([{ ingredientId: "", quantity: "", unit: "" }]);
    setToppingRows([{ toppingId: "", quantity: "" }]);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setTargetId("");
    setRecipeExists(false);
    setRows([{ ingredientId: "", quantity: "", unit: "" }]);
    setToppingRows([{ toppingId: "", quantity: "" }]);
  };

  const handleTypeChange = (value) => {
    const nextType = value === "topping" ? "topping" : "product";
    setFormType(nextType);
    setTargetId("");
    setRecipeExists(false);
    setRows([{ ingredientId: "", quantity: "", unit: "" }]);
    setToppingRows([{ toppingId: "", quantity: "" }]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!url || !targetId) return toast.error("Vui lÃ²ng chá»n Ä‘á»‘i tÆ°á»£ng.");

    const normalizedIngredients = rows
      .map((r) => ({
        ingredient_id: String(r.ingredientId || "").trim(),
        quantity: Math.max(0, toNumber(r.quantity, 0)),
        unit: String(r.unit || "").trim(),
      }))
      .filter((r) => r.ingredient_id && r.quantity > 0);

    const normalizedToppings = toppingRows
      .map((r) => ({
        topping_id: String(r.toppingId || "").trim(),
        quantity: Math.max(0, toNumber(r.quantity, 0)),
      }))
      .filter((r) => r.topping_id && r.quantity > 0);

    setFormLoading(true);
    try {
      const result =
        formType === "topping"
          ? await saveToppingRecipeV2(url, {
              topping_id: targetId,
              ingredients: normalizedIngredients,
            })
          : await saveProductRecipeV2(url, {
              product_id: targetId,
              ingredients: normalizedIngredients,
              toppings: normalizedToppings,
            });

      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ lÆ°u cÃ´ng thá»©c.");
      toast.success("ÄÃ£ lÆ°u cÃ´ng thá»©c.");
      await loadBootstrap();
      closeModal();
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ lÆ°u cÃ´ng thá»©c.");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">{pageTitle}</div>
            <div className="text-sm text-stone-500">{pageSubtitle}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-confirm h-11 rounded-lg px-4 text-sm font-semibold"
              onClick={openCreateModal}
              disabled={loading || recipesLoading}
            >
              Táº¡o cÃ´ng thá»©c má»›i
            </button>
            <button
              type="button"
              className={reloadButtonStyle}
              onClick={loadBootstrap}
              disabled={loading || recipesLoading}
            >
              {loading || recipesLoading ? "Äang táº£i..." : "Táº£i láº¡i dá»¯ liá»‡u"}
            </button>
            <div className="flex flex-wrap items-center sm:justify-end ml-2">
              <select
                className="h-11 min-w-[160px] px-4 rounded-lg border border-stone-200 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-50 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 appearance-none cursor-pointer pr-10 relative shadow-sm transition-colors"
                value={auditMode}
                onChange={(e) => setAuditMode(e.target.value)}
                disabled={loading || recipesLoading}
                style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em' }}
              >
                <option value="missing">Thiáº¿u cÃ´ng thá»©c</option>
                <option value="empty">CÃ´ng thá»©c trá»‘ng</option>
                <option value="all">Xem táº¥t cáº£</option>
              </select>
            </div>
              <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
                <div className="text-sm font-semibold text-stone-800">Danh sÃ¡ch cáº§n nháº­p cÃ´ng thá»©c</div>
                <div className="text-xs text-stone-500">Danh sÃ¡ch cÃ¡c sáº£n pháº©m Ä‘ang thiáº¿u hoáº·c cÃ´ng thá»©c rá»—ng</div>
              </div>
              <div className="max-h-[420px] overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {auditTargets.slice(0, 80).map((target) => (
                    <div
                      key={target.key}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded px-2 py-1 text-[11px] font-bold",
                              target.type === "topping"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800",
                            ].join(" ")}
                          >
                            {target.type === "topping" ? "Topping" : "Sáº£n pháº©m"}
                          </span>
                          <span className="line-clamp-1 text-sm font-semibold text-stone-900">{target.name}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-stone-500">{target.reason}</div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-edit h-10 w-full px-4 text-xs font-bold"
                        onClick={() => handleViewOrEdit(target.key)}
                        disabled={loading || recipesLoading}
                      >
                        Nháº­p cÃ´ng thá»©c
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {auditTargets.length > 80 ? (
                <div className="px-4 py-2 text-xs text-stone-500">Äang hiá»ƒn thá»‹ 80/{auditTargets.length} má»¥c.</div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Táº¥t cáº£ sáº£n pháº©m/topping Ä‘Ã£ cÃ³ cÃ´ng thá»©c theo bá»™ lá»c hiá»‡n táº¡i.
            </div>
          )}
        </div>

        {showProducts ? (
        <div className="overflow-x-auto rounded-2xl bg-white p-5 shadow-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-lg font-semibold text-[var(--text-primary)]">Danh sÃ¡ch cÃ´ng thá»©c sáº£n pháº©m</h4>
            <div className="text-xs text-stone-500">
              ÄÃ£ nháº­p: <span className="font-semibold text-stone-800">{recipes.length}</span> / {productsCoverage.total}
            </div>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 md:px-6">
                  Sáº£n pháº©m
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 lg:table-cell md:px-6">
                  NguyÃªn liá»‡u
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 md:table-cell md:px-6">
                  Cáº­p nháº­t gáº§n nháº¥t
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500 md:px-6">
                  Thao tÃ¡c
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {recipes.map((recipe) => (
                <tr key={String(recipe.productId || recipe._id)} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-sm font-medium md:px-6">
                    <div>{recipe.productName || "N/A"}</div>
                  </td>
                  <td className="hidden px-4 py-4 text-sm text-gray-600 lg:table-cell md:px-6">
                    {Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0}
                  </td>
                  <td className="hidden px-4 py-4 text-sm text-gray-500 md:table-cell md:px-6">
                    {recipe.updatedAt ? new Date(recipe.updatedAt).toLocaleDateString("vi-VN") : "ChÆ°a rÃµ"}
                  </td>
                  <td className="px-4 py-4 text-right md:px-6">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-edit px-3 py-1.5 text-xs"
                        onClick={() => handleViewOrEdit(`product:${recipe.productId}`)}
                      >
                        Sá»­a cÃ´ng thá»©c
                      </button>
                      <button
                        type="button"
                        className="btn btn-delete px-3 py-1.5 text-xs"
                        onClick={() => handleDelete(`product:${recipe.productId}`)}
                      >
                        XÃ³a cÃ´ng thá»©c
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recipesLoading && (
            <div className="py-8 text-center text-sm text-gray-500">Äang táº£i danh sÃ¡ch cÃ´ng thá»©c...</div>
          )}
          {!recipesLoading && recipes.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-500">ChÆ°a cÃ³ cÃ´ng thá»©c sáº£n pháº©m nÃ o</div>
          )}
        </div>


      ) : null}

        {showToppings ? (
        <div className="overflow-x-auto rounded-2xl bg-white p-5 shadow-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-lg font-semibold text-[var(--text-primary)]">Danh sÃ¡ch cÃ´ng thá»©c topping</h4>
            <div className="text-xs text-stone-500">
              ÄÃ£ nháº­p: <span className="font-semibold text-stone-800">{toppingRecipes.length}</span> / {toppingsCoverage.total}
            </div>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 md:px-6">
                  Topping
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 lg:table-cell md:px-6">
                  NguyÃªn liá»‡u
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 md:table-cell md:px-6">
                  Cáº­p nháº­t gáº§n nháº¥t
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500 md:px-6">
                  Thao tÃ¡c
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {toppingRecipes.map((t) => (
                <tr key={String(t?._id)} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-sm font-medium md:px-6">
                    <div>{t?.name || "N/A"}</div>
                  </td>
                  <td className="hidden px-4 py-4 text-sm text-gray-600 lg:table-cell md:px-6">
                    {Array.isArray(t?.ingredients) ? t.ingredients.length : 0}
                  </td>
                  <td className="hidden px-4 py-4 text-sm text-gray-500 md:table-cell md:px-6">
                    {t?.updatedAt ? new Date(t.updatedAt).toLocaleDateString("vi-VN") : "ChÆ°a rÃµ"}
                  </td>
                  <td className="px-4 py-4 text-right md:px-6">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-edit px-3 py-1.5 text-xs"
                        onClick={() => handleViewOrEdit(`topping:${String(t._id)}`)}
                      >
                        Sá»­a cÃ´ng thá»©c
                      </button>
                      <button
                        type="button"
                        className="btn btn-delete px-3 py-1.5 text-xs"
                        onClick={() => handleDelete(`topping:${String(t._id)}`)}
                      >
                        XÃ³a cÃ´ng thá»©c
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recipesLoading && toppingRecipes.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">ChÆ°a cÃ³ cÃ´ng thá»©c topping nÃ o</div>
          ) : null}
        </div>


      ) : null}

      </div>

            {modalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-6 flex items-center justify-center">
          <div className="relative w-full max-w-5xl max-h-full overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
            
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-200 px-4 py-4 sm:px-6">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {recipeExists ? "Sá»­a cÃ´ng thá»©c" : "Táº¡o cÃ´ng thá»©c"}
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  {formType === "topping" ? "CÃ´ng thá»©c topping" : "CÃ´ng thá»©c sáº£n pháº©m"}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                onClick={closeModal}
              >
                <span className="sr-only">ÄÃ³ng</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Form Body - scrollable */}
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 lg:space-y-8">
              
              {/* Section 1: Basic Info (Responsive Grid) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Loáº¡i cÃ´ng thá»©c</label>
                  <select
                    className="h-11 w-full rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-sm"
                    value={formType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    disabled={!showProducts || !showToppings || formLoading}
                  >
                    {showProducts && <option value="product">Sáº£n pháº©m</option>}
                    {showToppings && <option value="topping">Topping</option>}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-stone-500">
                    {formType === "topping" ? "Chá»n topping" : "Chá»n sáº£n pháº©m"}
                  </label>
                  <select
                    className="h-11 w-full rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-sm"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="">-- Chá»n --</option>
                    {(formType === "topping" ? toppingOptions : products)
                      .filter((item) => String(item?._id || "").trim())
                      .map((item) => (
                        <option key={String(item._id)} value={String(item._id)}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-wide text-stone-500">TÃªn tá»± Ä‘á»™ng</label>
                  <input
                    className="h-11 w-full cursor-not-allowed rounded-lg border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-stone-600 focus:outline-none shadow-sm"
                    value={selectedTarget?.name || ""}
                    disabled
                    placeholder="TÃªn hiá»ƒn thá»‹..."
                  />
                </div>
              </div>

              {/* Section 2: Tables (Ingredients + Toppings side by side on Desktop) */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                
                {/* 1. NguyÃªn liá»‡u Table */}
                <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-4 py-3">
                    <h4 className="text-sm font-bold text-stone-800">NguyÃªn liá»‡u</h4>
                    <button
                      type="button"
                      onClick={addRow}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                      </svg>
                      ThÃªm
                    </button>
                  </div>
                  
                  {/* Table Wrapper for Horizontal Scroll */}
                  <div className="overflow-x-auto">
                    <table className="min-w-[600px] w-full text-left text-sm divide-y divide-stone-200">
                      <thead className="bg-stone-50">
                        <tr>
                          <th className="px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider">TÃªn nguyÃªn liá»‡u</th>
                          <th className="w-32 px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Sá»‘ lÆ°á»£ng</th>
                          {formType === "topping" && <th className="w-24 px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider text-center">ÄÆ¡n vá»‹</th>}
                          <th className="w-16 px-4 py-3 text-center text-xs font-bold text-stone-500 uppercase tracking-wider">XÃ³a</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 bg-white">
                        {rows.map((row, idx) => (
                          <tr key={`ingredient-${idx}`} className="hover:bg-stone-50/50 transition-colors">
                            <td className="px-5 py-2">
                              <select
                                value={row.ingredientId}
                                onChange={(e) => {
                                  const nextId = e.target.value;
                                  const ing = ingredientOptions.find((x) => String(x?._id) === String(nextId)) || null;
                                  updateRow(idx, { ingredientId: nextId, unit: String(ing?.unit || row.unit || "") });
                                }}
                                className="block w-full max-w-full font-medium rounded-lg border border-transparent py-2 pl-2 pr-8 text-sm text-stone-900 bg-transparent hover:bg-stone-100 focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-colors truncate"
                              >
                                <option value="">-- Chá»n nguyÃªn liá»‡u --</option>
                                {ingredientOptions
                                  .filter((ing) => {
                                    const id = String(ing?._id || "").trim();
                                    if (!id) return false;
                                    if (String(row?.ingredientId || "").trim() === id) return true;
                                    return !pickedIngredientIds.has(id);
                                  })
                                  .map((ing) => (
                                    <option key={String(ing._id)} value={String(ing._id)}>
                                      {ing.name} ({ing.unit})
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-5 py-2 text-right">
                              <div className="flex flex-row items-center justify-end gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                                  className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-2 text-center text-sm font-semibold text-stone-800 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors"
                                  placeholder="0"
                                />
                                {formType !== "topping" && (
                                  <span className="w-10 truncate text-left text-xs font-semibold text-stone-500 bg-stone-100 px-2 py-1.5 rounded-md">
                                    {String((ingredientOptions.find((x) => String(x?._id) === String(row.ingredientId)) || {})?.unit || "")}
                                  </span>
                                )}
                              </div>
                            </td>
                            {formType === "topping" && (
                              <td className="px-5 py-2 text-center">
                                <select
                                  value={row.unit || ""}
                                  onChange={(e) => updateRow(idx, { unit: e.target.value })}
                                  className="w-full rounded-lg font-medium border-transparent bg-transparent py-2 text-center text-sm text-stone-700 hover:bg-stone-100 focus:border-transparent focus:ring-2 focus:ring-orange-400 transition-colors"
                                >
                                  <option value=""></option>
                                  {[...new Set([ ...(UNIT_OPTIONS || []), String((ingredientOptions.find((x) => String(x?._id) === String(row.ingredientId)) || {})?.unit || "") ].filter(Boolean))].map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                disabled={rows.length === 1}
                                className="inline-flex rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-400 transition-colors"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Topping Table (Only for product formula) */}
                {formType === "product" && (
                  <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-4 py-3">
                      <h4 className="text-sm font-bold text-stone-800">Topping Ä‘i kÃ¨m</h4>
                      <button
                        type="button"
                        onClick={addToppingRow}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-1 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                        </svg>
                        ThÃªm
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-[400px] xl:min-w-0 w-full text-left text-sm divide-y divide-stone-200">
                        <thead className="bg-stone-50">
                          <tr>
                            <th className="px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider">TÃªn topping</th>
                            <th className="w-32 px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Sá»‘ lÆ°á»£ng</th>
                            <th className="w-16 px-4 py-3 text-center text-xs font-bold text-stone-500 uppercase tracking-wider">XÃ³a</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 bg-white">
                          {toppingRows.map((row, idx) => (
                            <tr key={`topping-${idx}`} className="hover:bg-stone-50/50 transition-colors">
                              <td className="px-5 py-2">
                                <select
                                  value={row.toppingId}
                                  onChange={(e) => updateToppingRow(idx, { toppingId: e.target.value })}
                                  className="block w-full max-w-full font-medium rounded-lg border-transparent py-2 pl-2 pr-8 text-sm text-stone-900 bg-transparent hover:bg-stone-100 focus:border-transparent focus:ring-2 focus:ring-stone-400 transition-colors truncate"
                                >
                                  <option value="">-- Chá»n topping --</option>
                                  {toppingOptions
                                    .filter((top) => {
                                      const id = String(top?._id || "").trim();
                                      if (!id) return false;
                                      if (String(row?.toppingId || "").trim() === id) return true;
                                      return !pickedToppingIds.has(id);
                                    })
                                    .map((top) => (
                                      <option key={String(top._id)} value={String(top._id)}>
                                        {top.name}
                                      </option>
                                    ))}
                                </select>
                              </td>
                              <td className="px-5 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(e) => updateToppingRow(idx, { quantity: e.target.value })}
                                  className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-2 text-center text-sm font-semibold text-stone-800 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-400 transition-colors"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeToppingRow(idx)}
                                  disabled={toppingRows.length === 1}
                                  className="inline-flex rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-400 transition-colors"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Form Footer Buttons - Responsive Full Width */}
              <div className="mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-stone-100 pt-5">
                {recipeExists && (
                  <button
                    type="button"
                    className="w-full sm:w-auto inline-flex justify-center items-center rounded-lg border border-rose-200 bg-rose-50 px-6 py-3 sm:py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 transition-colors shadow-sm"
                    disabled={formLoading || !targetId}
                    onClick={() => handleDelete(`${formType}:${targetId}`)}
                  >
                    XÃ³a cÃ´ng thá»©c
                  </button>
                )}
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full sm:w-auto inline-flex justify-center items-center rounded-lg bg-orange-500 px-10 py-3 sm:py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
                >
                  {formLoading ? "Äang lÆ°u..." : "LÆ°u cÃ´ng thá»©c"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}


    </div>
  );
};

export default Recipes;










