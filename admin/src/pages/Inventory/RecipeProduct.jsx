import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import http from "../../api/http";
import {
  deleteProductRecipeV2,
  getProductRecipeV2,
  listIngredients,
  listRecipes,
  saveProductRecipeV2,
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

const RecipeProduct = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [rows, setRows] = useState([{ ingredientId: "", quantity: "" }]);
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

  const recipeByProductId = useMemo(() => {
    const map = new Map();
    (Array.isArray(recipes) ? recipes : []).forEach((r) => {
      const pid = String(r?.productId || "");
      if (!pid) return;
      map.set(pid, r);
    });
    return map;
  }, [recipes]);

  const productsCoverage = useMemo(() => {
    const missing = [];
    const empty = [];
    const ok = [];
    products.forEach((p) => {
      const pid = String(p?._id || "");
      if (!pid) return;
      const recipe = recipeByProductId.get(pid);
      if (!recipe) {
        missing.push(p);
        return;
      }
      const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      if (items.length === 0) {
        empty.push(p);
      } else {
        ok.push(p);
      }
    });
    return { missing, empty, ok };
  }, [products, recipeByProductId]);

  const loadBootstrap = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const [productsRes, ingredientsRes, recipesRes] = await Promise.all([
        http.get(`${url}/api/product/list`),
        listIngredients(url),
        listRecipes(url),
      ]);
      const p = Array.isArray(productsRes?.data?.data) ? productsRes.data.data : [];
      const i = ingredientsRes?.success && Array.isArray(ingredientsRes.data) ? ingredientsRes.data : [];
      if (!ingredientsRes?.success) throw new Error(ingredientsRes?.message || "Không thể tải nguyên liệu.");
      const r = recipesRes?.success && Array.isArray(recipesRes.data) ? recipesRes.data : [];
      setProducts(p);
      setIngredients(i);
      setRecipes(r);
    } catch (error) {
      toast.error(error?.message || "Không thể tải dữ liệu.");
      setProducts([]);
      setIngredients([]);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [url]);

  const loadRecipe = async (productId) => {
    if (!url || !productId) return;
    setLoading(true);
    try {
      const result = await getProductRecipeV2(url, productId);
      if (!result?.success) throw new Error(result?.message || "Không tải được công thức.");
      const recipe = result.data || null;
      const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      if (items.length === 0) {
        setRows([{ ingredientId: "", quantity: "" }]);
        setRecipeExists(false);
        return;
      }
      setRows(
        items.map((r) => ({
          ingredientId: extractIngredientId(r?.ingredientId || r?.ingredient_id || r?.ingredient || r?._id),
          quantity: String(r?.quantity ?? ""),
        }))
      );
      setRecipeExists(true);
    } catch (error) {
      toast.error(error?.message || "Không tải được công thức.");
      setRows([{ ingredientId: "", quantity: "" }]);
      setRecipeExists(false);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => setRows((prev) => [...prev, { ingredientId: "", quantity: "" }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) =>
    setRows((prev) => {
      const normalizedPatch =
        patch && Object.prototype.hasOwnProperty.call(patch, "ingredientId")
          ? { ...patch, ingredientId: extractIngredientId(patch.ingredientId) }
          : patch;
      const next = prev.map((row, i) => (i === idx ? { ...row, ...normalizedPatch } : row));
      if (normalizedPatch && Object.prototype.hasOwnProperty.call(normalizedPatch, "ingredientId")) {
        const selected = extractIngredientId(normalizedPatch.ingredientId);
        if (selected) {
          return next.map((row, i) => {
            if (i === idx) return row;
            if (extractIngredientId(row?.ingredientId) !== selected) return row;
            return { ...row, ingredientId: "" };
          });
        }
      }
      return next;
    });

  const handleSelectProduct = (id) => {
    setTargetId(id);
    setRows([{ ingredientId: "", quantity: "" }]);
    setRecipeExists(false);
    if (id) loadRecipe(id);
  };

  const getProductNameById = (id) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return "";
    const matched = products.find((item) => String(item?._id || "") === normalizedId);
    return String(matched?.name || "").trim();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!url || !targetId) return toast.error("Chọn sản phẩm trước.");

    const normalized = rows
      .map((r) => ({ ingredient_id: extractIngredientId(r.ingredientId), quantity: Math.max(0, toNumber(r.quantity, 0)) }))
      .filter((r) => r.ingredient_id && r.quantity > 0);

    if (normalized.length === 0) return toast.error("Thêm ít nhất 1 nguyên liệu.");

    setLoading(true);
    try {
      const result = await saveProductRecipeV2(url, { product_id: targetId, ingredients: normalized, toppings: [] });
      if (!result?.success) throw new Error(result?.message || "Không lưu được công thức.");
      toast.success("Đã lưu công thức sản phẩm.");
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
      name: String(name || getProductNameById(normalizedId) || "").trim(),
    });
  };

  const confirmDelete = async () => {
    const id = String(deleteTarget?.id || "").trim();
    if (!url || !id) return;
    setDeleting(true);
    try {
      const result = await deleteProductRecipeV2(url, id);
      if (!result?.success) throw new Error(result?.message || "Không xóa được công thức.");
      toast.success("Đã xóa công thức.");
      if (String(targetId || "") === id) {
        setRows([{ ingredientId: "", quantity: "" }]);
        setRecipeExists(false);
      }
      setDeleteTarget(null);
      await loadBootstrap();
    } catch (error) {
      toast.error(error?.message || "Không xóa được công thức.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Công thức sản phẩm</div>
            <p className="text-sm text-stone-500">Chỉ trừ kho nguyên liệu, không trừ topping.</p>
          </div>
          <button type="button" className="btn btn-cancel" onClick={loadBootstrap} disabled={loading}>
            {loading ? "Đang tải..." : "Tải lại"}
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-600">Chọn sản phẩm</label>
              <select
                value={targetId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className={controlStyle}
              >
                <option value="">-- Chọn sản phẩm --</option>
                {products.map((p) => (
                  <option key={String(p._id)} value={String(p._id)}>
                    {p.name}
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
                  <th className="w-32 px-4 py-3 text-right">Số lượng</th>
                  <th className="w-32 px-4 py-3 text-right">Đơn vị</th>
                  <th className="w-16 px-4 py-3 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {rows.map((row, idx) => {
                  const ingredientId = extractIngredientId(row.ingredientId);
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
                      <td className="px-4 py-2 text-right text-xs font-semibold text-stone-500">{getIngredientUnitById(ingredientId)}</td>
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
            <div className="text-xs text-stone-500">Công thức sẽ được dùng để tự động trừ kho khi bán hàng.</div>
          </div>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-stone-800">Danh sách sản phẩm đã có công thức</h3>
            <p className="text-xs text-stone-500">Chọn để sửa / xóa nhanh.</p>
          </div>
          <span className="text-xs text-stone-500">
            {productsCoverage.ok.length} / {products.length} sản phẩm
          </span>
        </div>
        {productsCoverage.ok.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
            Chưa có công thức nào.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {productsCoverage.ok.map((p) => (
              <div
                key={String(p._id)}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 shadow-sm"
              >
                <div className="truncate text-sm font-semibold text-stone-800">{p.name}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-edit px-3 py-1 text-xs"
                    onClick={() => handleSelectProduct(String(p._id))}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="btn btn-delete px-3 py-1 text-xs"
                    onClick={() => requestDelete(String(p._id), p.name)}
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
            <h3 className="text-base font-semibold text-stone-800">Sản phẩm thiếu công thức</h3>
            <p className="text-xs text-stone-500">Gồm sản phẩm chưa tạo hoặc công thức trống.</p>
          </div>
          <span className="text-xs text-stone-500">
            {productsCoverage.missing.length + productsCoverage.empty.length} mục
          </span>
        </div>
        {productsCoverage.missing.length + productsCoverage.empty.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-emerald-600">
            Đã nhập công thức cho tất cả sản phẩm.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...productsCoverage.missing.map((p) => ({ ...p, reason: "Chưa tạo công thức" })), ...productsCoverage.empty.map((p) => ({ ...p, reason: "Công thức trống" }))].map((p) => (
              <div
                key={String(p._id)}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-stone-800">{p.name}</div>
                  <div className="text-xs text-amber-700">{p.reason}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-confirm px-3 py-1 text-xs"
                  onClick={() => handleSelectProduct(String(p._id))}
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
        itemName={deleteTarget?.name || "công thức sản phẩm"}
        itemLabel="công thức sản phẩm"
        title="Xóa công thức sản phẩm"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
};

export default RecipeProduct;
