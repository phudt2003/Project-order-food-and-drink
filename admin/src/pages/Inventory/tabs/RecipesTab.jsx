import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import http from "../../../api/http";
import { getRecipe, listIngredients, saveRecipe } from "../../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const RecipesTab = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [rows, setRows] = useState([{ ingredientId: "", quantity: "" }]);

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

  const loadBootstrap = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const [productsResponse, ingredientsResult] = await Promise.all([
        http.get(`${url}/api/product/list`),
        listIngredients(url),
      ]);

      const p = Array.isArray(productsResponse?.data?.data) ? productsResponse.data.data : [];
      if (!ingredientsResult?.success) throw new Error(ingredientsResult?.message || "KhÃ´ng thá»ƒ táº£i nguyÃªn liá»‡u.");
      const i = Array.isArray(ingredientsResult.data) ? ingredientsResult.data : [];

      setProducts(p);
      setIngredients(i);
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u cÃ´ng thá»©c.");
    } finally {
      setLoading(false);
    }
  };

  const loadRecipe = async (productId) => {
    if (!url || !productId) return;
    setLoading(true);
    try {
      const result = await getRecipe(url, productId);
      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c.");
      const recipe = result.data;
      const nextRows = (() => {
        const list = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
        const map = new Map();

        list.forEach((r) => {
          const ingredientId =
            typeof r?.ingredientId === "string" ? r.ingredientId : String(r?.ingredientId?._id || "");
          const id = String(ingredientId || "").trim();
          if (!id) return;

          const quantity = r?.quantity ?? "";
          const prev = map.get(id);
          if (!prev) {
            map.set(id, { ingredientId: id, quantity });
            return;
          }

          map.set(id, {
            ingredientId: id,
            quantity: toNumber(prev.quantity, 0) + toNumber(quantity, 0),
          });
        });

        return Array.from(map.values());
      })();
      setRows(nextRows.length ? nextRows : [{ ingredientId: "", quantity: "" }]);
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c.");
      setRows([{ ingredientId: "", quantity: "" }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [url]);

  const addRow = () => setRows((prev) => [...prev, { ingredientId: "", quantity: "" }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) =>
    setRows((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, ...patch } : row));

      // Prevent duplicate ingredients: if an ingredient is chosen in one row,
      // it must not remain selectable/selected in other rows.
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

  const submit = async (event) => {
    event.preventDefault();
    if (!url || !selectedProductId) return toast.error("Vui lÃ²ng chá»n sáº£n pháº©m.");

    const normalized = rows
      .map((r) => ({
        ingredientId: String(r.ingredientId || "").trim(),
        quantity: Math.max(0, toNumber(r.quantity, 0)),
      }))
      .filter((r) => r.ingredientId && r.quantity > 0);

    setLoading(true);
    try {
      const result = await saveRecipe(url, selectedProductId, normalized);
      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ lÆ°u cÃ´ng thá»©c.");
      toast.success("ÄÃ£ lÆ°u cÃ´ng thá»©c.");
      await loadRecipe(selectedProductId);
    } catch (error) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ lÆ°u cÃ´ng thá»©c.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <h3 className="text-base font-semibold text-stone-800">CÃ´ng thá»©c sáº£n pháº©m</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">Chá»n sáº£n pháº©m</span>
            <select
              value={selectedProductId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedProductId(next);
                loadRecipe(next);
              }}
              className={inputStyle}
            >
              <option value="">-- Chá»n sáº£n pháº©m --</option>
              {products.map((p) => (
                <option key={String(p._id)} value={String(p._id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end justify-end">
            <button
              type="button"
              className={reloadButtonStyle}
              onClick={loadBootstrap}
            >
              Táº£i láº¡i dá»¯ liá»‡u
            </button>
          </div>
        </div>
      </div>

      {selectedProductId ? (
        <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-stone-800">NguyÃªn liá»‡u / 1 sáº£n pháº©m</h3>
            <button
              type="button"
              className={addRowButtonStyle}
              onClick={addRow}
            >
              + ThÃªm dÃ²ng
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                <div className="md:col-span-7">
                  <select
                    value={row.ingredientId}
                    onChange={(e) => updateRow(idx, { ingredientId: e.target.value })}
                    className={inputStyle}
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
                </div>
                <div className="md:col-span-3">
                  <input
                    type="number"
                    min="0"
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                    className={inputStyle}
                    placeholder="Sá»‘ lÆ°á»£ng"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    className={deleteRowButtonStyle}
                    onClick={() => removeRow(idx)}
                    disabled={rows.length === 1}
                  >
                    XÃ³a
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <button
              type="submit"
              disabled={loading}
              className={saveButtonStyle}
            >
              {loading ? "Äang lÆ°u..." : "LÆ°u cÃ´ng thá»©c"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
};

export default RecipesTab;

