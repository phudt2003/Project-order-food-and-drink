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
              <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
                <div className="text-sm font-semibold text-stone-800">Danh sÃ¡ch cáº§n nháº­p cÃ´ng thá»©c</div>
                <div className="text-xs text-stone-500">Hiá»ƒn thá»‹ theo bá»™ lá»c: {auditMode}</div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-[var(--text-primary)]">
                  {recipeExists ? "Sá»­a cÃ´ng thá»©c" : "Táº¡o cÃ´ng thá»©c"}
                </div>
                <div className="text-xs text-stone-500">
                  {formType === "topping" ? "CÃ´ng thá»©c topping" : "CÃ´ng thá»©c sáº£n pháº©m"}
                </div>
              </div>
              <button type="button" className="btn btn-cancel h-10 px-3 text-xs" onClick={closeModal}>
                ÄÃ³ng
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
              {/* ThÃ´ng tin cÆ¡ báº£n - Thu gá»n vá»›i layout 3 cá»™t trÃªn desktop */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Loáº¡i cÃ´ng thá»©c</label>
                  <select
                    className="h-9 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm text-stone-900 transition focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    value={formType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    disabled={!showProducts || !showToppings || formLoading}
                  >
                    {showProducts ? <option value="product">Sáº£n pháº©m</option> : null}
                    {showToppings ? <option value="topping">Topping</option> : null}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    {formType === "topping" ? "Chá»n topping" : "Chá»n sáº£n pháº©m"}
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm text-stone-900 transition focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
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

                <div className="md:col-span-1">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">TÃªn tá»± Ä‘á»™ng</label>
                  <input 
                    className="h-9 w-full cursor-not-allowed rounded-md border border-stone-200 bg-stone-100 px-3 text-sm text-stone-700" 
                    value={selectedTarget?.name || ""} 
                    disabled 
                    placeholder="TÃªn cÃ´ng thá»©c..." 
                  />
                </div>
              </div>

              {/* Báº£ng cáº¥u thÃ nh - 2 cá»™t trÃªn desktop to */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* 1. Báº£ng Danh sÃ¡ch nguyÃªn liá»‡u */}
                <div className="flex h-fit flex-col overflow-hidden rounded-xl border border-stone-200 shadow-sm">
                  <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-3 py-2">
                    <div className="text-sm font-bold text-stone-800">NguyÃªn liá»‡u</div>
                    <button 
                      type="button" 
                      className="inline-flex items-center justify-center rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-200" 
                      onClick={addRow}
                    >
                      + ThÃªm
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                      <thead className="bg-stone-50/50 text-[11px] uppercase tracking-wider text-stone-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">TÃªn nguyÃªn liá»‡u</th>
                          <th className="w-24 px-3 py-2 font-semibold">Sá»‘ lÆ°á»£ng</th>
                          {formType === "topping" ? <th className="w-20 px-3 py-2 font-semibold">ÄÆ¡n vá»‹</th> : null}
                          <th className="w-10 px-3 py-2 text-center font-semibold text-transparent">XÃ³a</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {rows.map((row, idx) => (
                          <tr key={`ingredient-${idx}`} className="transition-colors hover:bg-stone-50">
                            <td className="px-3 py-1.5 min-w-[160px]">
                              <select
                                value={row.ingredientId}
                                onChange={(e) => {
                                  const nextId = e.target.value;
                                  const ing = ingredientOptions.find((x) => String(x?._id) === String(nextId)) || null;
                                  updateRow(idx, {
                                    ingredientId: nextId,
                                    unit: String(ing?.unit || row.unit || ""),
                                  });
                                }}
                                className="h-8 w-full rounded border-transparent bg-transparent px-1 text-sm text-stone-800 focus:border-amber-400 focus:bg-white focus:ring-1 focus:ring-amber-400 hover:bg-stone-100"
                              >
                                <option value="">-- Chá»n --</option>
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
                            <td className="px-3 py-1.5 align-middle">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                                  className="h-8 w-16 rounded border border-stone-200 px-2 text-center text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  placeholder="0"
                                />
                                {formType !== "topping" ? (
                                  <span className="w-8 truncate text-xs font-medium text-stone-500">
                                    {String((ingredientOptions.find((x) => String(x?._id) === String(row.ingredientId)) || {})?.unit || "")}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {formType === "topping" ? (
                              <td className="px-3 py-1.5 align-middle">
                                <select
                                  value={row.unit || ""}
                                  onChange={(e) => updateRow(idx, { unit: e.target.value })}
                                  className="h-8 w-full rounded border-transparent bg-transparent px-1 text-center text-sm text-stone-700 hover:bg-stone-100 focus:border-stone-400 focus:bg-white"
                                >
                                  <option value=""></option>
                                  {[...new Set([
                                    ...(UNIT_OPTIONS || []), 
                                    String((ingredientOptions.find((x) => String(x?._id) === String(row.ingredientId)) || {})?.unit || "")
                                  ].filter(Boolean))].map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                            ) : null}
                            <td className="px-3 py-1.5 align-middle text-center">
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-stone-400 transition hover:bg-rose-100 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                                onClick={() => removeRow(idx)}
                                title="XÃ³a nguyÃªn liá»‡u"
                                disabled={rows.length === 1}
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

                {/* 2. Báº£ng Topping (chá»‰ hiá»‡n khi lÃ  cÃ´ng thá»©c sáº£n pháº©m) */}
                {formType === "product" ? (
                  <div className="flex h-fit flex-col overflow-hidden rounded-xl border border-stone-200 shadow-sm">
                    <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-3 py-2">
                      <div className="text-sm font-bold text-stone-800">Topping Ä‘i kÃ¨m</div>
                      <button 
                        type="button" 
                        className="inline-flex items-center justify-center rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-200" 
                        onClick={addToppingRow}
                      >
                        + ThÃªm
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full whitespace-nowrap text-left text-sm">
                        <thead className="bg-stone-50/50 text-[11px] uppercase tracking-wider text-stone-500">
                          <tr>
                            <th className="px-3 py-2 font-semibold">TÃªn topping</th>
                            <th className="w-24 px-3 py-2 font-semibold">Sá»‘ lÆ°á»£ng</th>
                            <th className="w-10 px-3 py-2 text-center font-semibold text-transparent">XÃ³a</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {toppingRows.map((row, idx) => (
                            <tr key={`topping-${idx}`} className="transition-colors hover:bg-stone-50">
                              <td className="px-3 py-1.5 min-w-[160px]">
                                <select
                                  value={row.toppingId}
                                  onChange={(e) => updateToppingRow(idx, { toppingId: e.target.value })}
                                  className="h-8 w-full rounded border-transparent bg-transparent px-1 text-sm text-stone-800 focus:border-amber-400 focus:bg-white focus:ring-1 focus:ring-amber-400 hover:bg-stone-100"
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
                              <td className="px-3 py-1.5 align-middle">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(e) => updateToppingRow(idx, { quantity: e.target.value })}
                                  className="h-8 w-16 rounded border border-stone-200 px-2 text-center text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-3 py-1.5 align-middle text-center">
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded text-stone-400 transition hover:bg-rose-100 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                                  onClick={() => removeToppingRow(idx)}
                                  title="XÃ³a topping"
                                  disabled={toppingRows.length === 1}
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
                ) : null}
              </div>

              {/* Khu vá»±c nÃºt báº¥m */}
              <div className="mt-2 flex flex-wrap items-center justify-end gap-3 border-t border-stone-100 pt-4">
                {recipeExists ? (
                  <button
                    type="button"
                    className="h-10 rounded-lg bg-rose-50 px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                    disabled={formLoading || !targetId}
                    onClick={() => handleDelete(`${formType}:${targetId}`)}
                  >
                    XÃ³a cÃ´ng thá»©c
                  </button>
                ) : null}
                <button 
                  type="submit" 
                  disabled={formLoading} 
                  className="h-10 rounded-lg bg-amber-500 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-60"
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










