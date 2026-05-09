import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  deleteToppingRecipeV2,
  getToppingRecipeV2,
  listIngredients,
  listToppings,
  saveToppingRecipeV2,
} from "../../api/inventoryApi";
import DeleteConfirmModal from "../../components/products/DeleteConfirmModal";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const extractIngredientId = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    return String(value?._id || value?.id || value?.ingredientId || value?.ingredient_id || "").trim();
  }
  return "";
};

const RecipeTopping = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [toppings, setToppings] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [rows, setRows] = useState([{ ingredientId: "", quantity: "", unit: "" }]);
  const [recipeExists, setRecipeExists] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const controlStyle =
    "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";

  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [ingredients]
  );

  const pickedIngredientIds = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      const id = extractIngredientId(r?.ingredientId);
      if (id) set.add(id);
    });
    return set;
  }, [rows]);

  const getIngredientUnitById = (ingredientId) => {
    const normalizedId = extractIngredientId(ingredientId);
    if (!normalizedId) return "";
    const matched = ingredientOptions.find((item) => String(item?._id || "").trim() === normalizedId) || null;
    return String(matched?.unit || "").trim();
  };

  const recipeByToppingId = useMemo(() => {
    const map = new Map();
    (Array.isArray(toppings) ? toppings : []).forEach((t) => {
      const tid = String(t?._id || "");
      if (!tid) return;
      if (t?.hasRecipe || (Array.isArray(t?.ingredients) && t.ingredients.length > 0)) {
        map.set(tid, { toppingId: tid, ingredients: t?.ingredients || [] });
      }
    });
    return map;
  }, [toppings]);

  const toppingCoverage = useMemo(() => {
    const missing = [];
    const empty = [];
    const ok = [];
    toppings.forEach((t) => {
      const tid = String(t?._id || "");
      if (!tid) return;
      const recipe = recipeByToppingId.get(tid);
      if (!recipe) {
        missing.push(t);
        return;
      }
      const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      if (items.length === 0) {
        empty.push(t);
      } else {
        ok.push(t);
      }
    });
    return { missing, empty, ok };
  }, [toppings, recipeByToppingId]);

  const loadBootstrap = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const [toppingRes, ingredientsRes] = await Promise.all([
        listToppings(url),
        listIngredients(url),
      ]);
      if (!toppingRes?.success) throw new Error(toppingRes?.message || "Không tải được topping.");
      if (!ingredientsRes?.success) throw new Error(ingredientsRes?.message || "Không tải được nguyên liệu.");
      const toppingData = Array.isArray(toppingRes.data) ? toppingRes.data : [];
      const ingredientData = Array.isArray(ingredientsRes.data) ? ingredientsRes.data : [];
      setToppings(toppingData);
      setIngredients(ingredientData);
    } catch (error) {
      toast.error(error?.message || "Không tải được dữ liệu.");
      setToppings([]);
      setIngredients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [url]);

  const loadRecipe = async (id) => {
    if (!url || !id) return;
    setLoading(true);
    try {
      const result = await getToppingRecipeV2(url, id);
      if (!result?.success) throw new Error(result?.message || "Không tải được công thức.");
      const recipe = result.data || null;
      const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      if (items.length === 0) {
        setRows([{ ingredientId: "", quantity: "", unit: "" }]);
        setRecipeExists(false);
        return;
      }
      setRows(
        items.map((r) => ({
          ingredientId: extractIngredientId(r?.ingredientId || r?.ingredient_id || r?.ingredient || r?._id),
          quantity: String(r?.quantity ?? ""),
          unit:
            getIngredientUnitById(r?.ingredientId || r?.ingredient_id || r?.ingredient || r?._id) ||
            String(r?.unit || ""),
        }))
      );
      setRecipeExists(true);
    } catch (error) {
      toast.error(error?.message || "Không tải được công thức.");
      setRows([{ ingredientId: "", quantity: "", unit: "" }]);
      setRecipeExists(false);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => setRows((prev) => [...prev, { ingredientId: "", quantity: "", unit: "" }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) =>
    setRows((prev) => {
      const normalizedPatch =
        patch && Object.prototype.hasOwnProperty.call(patch, "ingredientId")
          ? (() => {
              const selected = extractIngredientId(patch.ingredientId);
              const selectedUnit = selected ? getIngredientUnitById(selected) : "";
              return { ...patch, ingredientId: selected, unit: selectedUnit };
            })()
          : patch;
      const next = prev.map((row, i) => (i === idx ? { ...row, ...normalizedPatch } : row));
      if (normalizedPatch && Object.prototype.hasOwnProperty.call(normalizedPatch, "ingredientId")) {
        const selected = extractIngredientId(normalizedPatch.ingredientId);
        if (selected) {
          return next.map((row, i) => {
            if (i === idx) return row;
            if (extractIngredientId(row?.ingredientId) !== selected) return row;
            return { ...row, ingredientId: "", unit: "" };
          });
        }
      }
      return next;
    });

  useEffect(() => {
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const normalizedIngredientId = extractIngredientId(row?.ingredientId);
        const ingredientUnit = getIngredientUnitById(normalizedIngredientId);
        const currentUnit = String(row?.unit || "").trim();
        const nextUnit = ingredientUnit || currentUnit;
        if (normalizedIngredientId !== String(row?.ingredientId || "").trim() || nextUnit !== currentUnit) {
          changed = true;
          return { ...row, ingredientId: normalizedIngredientId, unit: nextUnit };
        }
        return row;
      });
      return changed ? next : prev;
    });
  }, [ingredients]);

  const handleSelect = (id) => {
    setTargetId(id);
    setRows([{ ingredientId: "", quantity: "", unit: "" }]);
    setRecipeExists(false);
    if (id) loadRecipe(id);
  };

  const getToppingNameById = (id) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return "";
    const matched = toppings.find((item) => String(item?._id || "") === normalizedId);
    return String(matched?.name || "").trim();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!url || !targetId) return toast.error("Chọn topping trước.");

    const normalized = rows
      .map((r) => ({
        ingredient_id: extractIngredientId(r.ingredientId),
        quantity: Math.max(0, toNumber(r.quantity, 0)),
        unit: getIngredientUnitById(r.ingredientId) || String(r.unit || "").trim(),
      }))
      .filter((r) => r.ingredient_id && r.quantity > 0);

    if (normalized.length === 0) return toast.error("Thêm ít nhất 1 nguyên liệu.");

    setLoading(true);
    try {
      const result = await saveToppingRecipeV2(url, { topping_id: targetId, ingredients: normalized });
      if (!result?.success) throw new Error(result?.message || "Không lưu được công thức.");
      toast.success("Đã lưu công thức topping.");
      setToppings((prev) =>
        prev.map((t) =>
          String(t?._id) === String(targetId)
            ? {
                ...t,
                hasRecipe: true,
                ingredients: normalized.map((row) => ({
                  ingredientId: row.ingredient_id,
                  quantity: row.quantity,
                  unit: row.unit,
                })),
              }
            : t
        )
      );
      setRecipeExists(true);
    } catch (error) {
      toast.error(error?.message || "Không lưu được công thức.");
    } finally {
      setLoading(false);
    }
  };

  const requestDelete = (id = targetId, name = "") => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return;
    setDeleteTarget({
      id: normalizedId,
      name: String(name || getToppingNameById(normalizedId) || "").trim(),
    });
  };

  const confirmDelete = async () => {
    const id = String(deleteTarget?.id || "").trim();
    if (!url || !id) return;
    setDeleting(true);
    try {
      const result = await deleteToppingRecipeV2(url, id);
      if (!result?.success) throw new Error(result?.message || "Không xóa được.");
      toast.success("Đã xóa công thức.");
      if (String(targetId || "") === id) {
        setRows([{ ingredientId: "", quantity: "", unit: "" }]);
        setRecipeExists(false);
      }
      setDeleteTarget(null);
      await loadBootstrap();
    } catch (error) {
      toast.error(error?.message || "Không xóa được.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Công thức topping</div>
            <p className="text-sm text-stone-500">Công thức để sản xuất topping, trừ nguyên liệu khi sản xuất.</p>
          </div>
          <button type="button" className="btn btn-cancel" onClick={loadBootstrap} disabled={loading}>
            {loading ? "Đang tải..." : "Tái tải"}
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-600">Chọn topping</label>
              <select value={targetId} onChange={(e) => handleSelect(e.target.value)} className={controlStyle}>
                <option value="">-- Chọn topping --</option>
                {toppings.map((t) => (
                  <option key={String(t._id)} value={String(t._id)}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-end gap-2">
              {recipeExists ? (
                <button type="button" onClick={() => requestDelete(targetId)} className="btn btn-delete h-11 w-full md:w-auto" disabled={deleting}>
                  Xóa công thức
                </button>
              ) : null}
              <button type="submit" className="btn btn-confirm h-11 w-full md:w-auto" disabled={loading || !targetId}>
                {loading ? "Đang lưu..." : "Lưu công thức"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-stone-200 shadow-sm">
            <table className="min-w-[640px] w-full text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nguyên liệu</th>
                  <th className="w-28 px-4 py-3 text-right">Số lượng</th>
                  <th className="w-28 px-4 py-3 text-center">Đơn vị</th>
                  <th className="w-16 px-4 py-3 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {rows.map((row, idx) => {
                  const ingredientId = extractIngredientId(row.ingredientId);
                  const ingredientUnit = getIngredientUnitById(ingredientId) || String(row.unit || "").trim();
                  return (
                  <tr key={`row-${idx}`} className="hover:bg-stone-50/70">
                    <td className="px-4 py-2">
                      <select
                        value={ingredientId}
                        onChange={(e) => updateRow(idx, { ingredientId: e.target.value })}
                        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm font-medium text-stone-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      >
                        <option value="">-- Chọn nguyên liệu --</option>
                        {ingredientOptions
                          .filter((option) => {
                            const id = String(option?._id || "").trim();
                            if (!id) return false;
                            if (ingredientId === id) return true;
                            return !pickedIngredientIds.has(id);
                          })
                          .map((option) => (
                            <option key={String(option._id)} value={String(option._id)}>
                              {option.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={row.quantity}
                        onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                        className="w-24 rounded-lg border border-stone-200 px-2 py-2 text-right text-sm font-semibold text-stone-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-semibold text-stone-500">{ingredientUnit}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1}
                        className="inline-flex rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={addRow} className="btn btn-cancel h-10 px-4 text-sm">
              + Thêm nguyên liệu
            </button>
            <div className="text-xs text-stone-500">Dùng khi sản xuất topping để trừ kho nguyên liệu, tăng stock topping.</div>
          </div>
        </form>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-stone-800">Danh sách topping đã có công thức</h3>
            <p className="text-xs text-stone-500">Chọn để sửa/xóa nhanh.</p>
          </div>
          <span className="text-xs text-stone-500">
            {toppingCoverage.ok.length} / {toppings.length} topping
          </span>
        </div>
        {toppingCoverage.ok.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
            Chưa có công thức topping nào.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {toppingCoverage.ok.map((t) => (
              <div
                key={String(t._id)}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 shadow-sm"
              >
                <div className="truncate text-sm font-semibold text-stone-800">{t.name}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-edit px-3 py-1 text-xs"
                    onClick={() => handleSelect(String(t._id))}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="btn btn-delete px-3 py-1 text-xs"
                    onClick={() => requestDelete(String(t._id), t.name)}
                    disabled={deleting}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-stone-800">Topping thiếu công thức</h3>
            <p className="text-xs text-stone-500">Chưa tạo hoặc công thức trống.</p>
          </div>
          <span className="text-xs text-stone-500">
            {toppingCoverage.missing.length + toppingCoverage.empty.length} mục
          </span>
        </div>
        {toppingCoverage.missing.length + toppingCoverage.empty.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-emerald-600">
            Đã nhập công thức cho tất cả topping.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...toppingCoverage.missing.map((t) => ({ ...t, reason: "Chưa tạo công thức" })), ...toppingCoverage.empty.map((t) => ({ ...t, reason: "Công thức trống" }))].map((t) => (
              <div
                key={String(t._id)}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-stone-800">{t.name}</div>
                  <div className="text-xs text-amber-700">{t.reason}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-confirm px-3 py-1 text-xs"
                  onClick={() => handleSelect(String(t._id))}
                >
                  Nhập
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        itemName={deleteTarget?.name || "công thức topping"}
        itemLabel="công thức topping"
        title="Xóa công thức topping"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
};

export default RecipeTopping;

