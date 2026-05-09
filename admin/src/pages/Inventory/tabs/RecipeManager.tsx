import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import http from "../../../api/http";
import {
  deleteRecipe,
  deleteToppingRecipe,
  getRecipe,
  getTopping,
  listIngredients,
  listToppings,
  saveRecipe,
  saveToppingRecipe,
} from "../../../api/inventoryApi";

type MongoId = string;

type Ingredient = {
  _id: MongoId;
  name: string;
  unit: string;
};

type Product = {
  _id: MongoId;
  name: string;
};

type Topping = {
  _id: MongoId;
  name: string;
  price?: number;
  // Backend toppingModel.ingredients = "cÃ´ng thá»©c topping" (cho kho)
  ingredients?: Array<{
    ingredientId: MongoId | { _id: MongoId; name?: string; unit?: string };
    quantity: number;
    unit?: string;
    note?: string;
  }>;
};

type RecipeDoc = {
  _id: MongoId;
  productId: MongoId;
  ingredients: Array<{
    ingredientId: MongoId | { _id: MongoId; name?: string; unit?: string };
    quantity: number;
    isSweetener?: boolean;
    unit?: string;
    note?: string;
  }>;
};

type TargetType = "product" | "topping";

type RecipeTarget = {
  id: MongoId;
  name: string;
  type: TargetType;
  // UI requirement: field isTopping:boolean
  isTopping: boolean;
};

type RecipeItemRow = {
  rowId: string;
  ingredientId: MongoId;
  quantity: string; // keep as string for input
  unit: string;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const makeRowId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const UNIT_OPTIONS = ["g", "ml", "kg", "l", "viÃªn", "pháº§n", "muá»—ng", "tÃºi", "há»™p"];

const buildUnitOptions = (ingredientUnit: string) => {
  const normalized = String(ingredientUnit || "").trim();
  const merged = new Set<string>(UNIT_OPTIONS.map((u) => u.trim()).filter(Boolean));
  if (normalized) merged.add(normalized);
  return Array.from(merged.values());
};

const getIdFromMaybePopulated = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "_id" in (value as any)) {
    return String((value as any)._id || "");
  }
  return "";
};

const RecipeItemModal = ({
  open,
  title,
  ingredients,
  pickedIngredientIds,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  ingredients: Ingredient[];
  pickedIngredientIds: Set<string>;
  initial: RecipeItemRow;
  onClose: () => void;
  onSubmit: (next: RecipeItemRow) => void;
}) => {
  const [draft, setDraft] = useState<RecipeItemRow>(initial);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
  }, [open, initial]);

  const ingredientInfo = useMemo(() => {
    const id = String(draft.ingredientId || "").trim();
    return ingredients.find((i) => String(i._id) === id) || null;
  }, [draft.ingredientId, ingredients]);

  const unitOptions = useMemo(
    () => buildUnitOptions(String(ingredientInfo?.unit || draft.unit || "")),
    [ingredientInfo?.unit, draft.unit]
  );

  if (!open) return null;

  const inputStyle =
    "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-stone-900">{title}</h3>
            <p className="mt-1 text-sm text-stone-600">
              CÃ´ng thá»©c nÃ y dÃ¹ng Ä‘á»ƒ trá»« kho theo sá»‘ lÆ°á»£ng topping trong Ä‘Æ¡n hÃ ng.
            </p>
          </div>
          <button type="button" className="btn btn-cancel h-10" onClick={onClose}>
            ÄÃ³ng
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-stone-700">NguyÃªn liá»‡u</span>
            <select
              value={draft.ingredientId}
              onChange={(e) => {
                const nextId = String(e.target.value || "");
                const nextIngredient = ingredients.find((i) => String(i._id) === nextId) || null;
                setDraft((prev) => ({
                  ...prev,
                  ingredientId: nextId,
                  // auto-fill unit theo Ä‘Æ¡n vá»‹ kho cá»§a nguyÃªn liá»‡u
                  unit: String(nextIngredient?.unit || prev.unit || ""),
                }));
              }}
              className={inputStyle}
            >
              <option value="">-- Chá»n nguyÃªn liá»‡u --</option>
              {ingredients.map((ing) => {
                const id = String(ing._id || "");
                const isPicked = pickedIngredientIds.has(id) && id !== String(initial.ingredientId || "");
                return (
                  <option key={id} value={id} disabled={isPicked}>
                    {ing.name} ({ing.unit})
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">Sá»‘ lÆ°á»£ng</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.quantity}
              onChange={(e) => setDraft((prev) => ({ ...prev, quantity: e.target.value }))}
              className={inputStyle}
              placeholder="VÃ­ dá»¥: 50"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">ÄÆ¡n vá»‹</span>
            <select
              value={draft.unit}
              onChange={(e) => setDraft((prev) => ({ ...prev, unit: e.target.value }))}
              className={inputStyle}
            >
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <span className="text-xs text-stone-500">
              Khuyáº¿n nghá»‹ chá»n Ä‘Ãºng Ä‘Æ¡n vá»‹ kho cá»§a nguyÃªn liá»‡u Ä‘á»ƒ trá»« kho chÃ­nh xÃ¡c.
            </span>
          </label>

        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-cancel h-11" onClick={onClose}>
            Huá»·
          </button>
          <button
            type="button"
            className="btn h-11 bg-green-600 text-white hover:bg-green-700"
            onClick={() => {
              const ingredientId = String(draft.ingredientId || "").trim();
              const quantity = Math.max(0, toNumber(draft.quantity, 0));
              if (!ingredientId) return toast.error("Vui lÃ²ng chá»n nguyÃªn liá»‡u.");
              if (quantity <= 0) return toast.error("Sá»‘ lÆ°á»£ng pháº£i lá»›n hÆ¡n 0.");
              onSubmit({ ...draft, ingredientId, quantity: String(draft.quantity || "") });
            }}
          >
            LÆ°u dÃ²ng
          </button>
        </div>
      </div>
    </div>
  );
};

export const RecipeManager = ({ url }: { url: string }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Select value is "type:id" Ä‘á»ƒ trÃ¡nh trÃ¹ng id giá»¯a product vÃ  topping
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [rows, setRows] = useState<RecipeItemRow[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [ingredients]
  );

  const targets = useMemo<RecipeTarget[]>(() => {
    const productTargets = products.map((p) => ({
      id: String(p._id),
      name: String(p.name || ""),
      type: "product" as const,
      isTopping: false,
    }));
    const toppingTargets = toppings.map((t) => ({
      id: String(t._id),
      name: String(t.name || ""),
      type: "topping" as const,
      isTopping: true,
    }));
    return [...productTargets, ...toppingTargets].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [products, toppings]);

  const selectedTarget = useMemo(() => {
    if (!selectedKey) return null;
    const [type, id] = selectedKey.split(":");
    if (!type || !id) return null;
    return targets.find((t) => t.type === type && t.id === id) || null;
  }, [selectedKey, targets]);

  const pickedIngredientIds = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      const id = String(row?.ingredientId || "").trim();
      if (id) set.add(id);
    });
    return set;
  }, [rows]);

  const openAddModal = () => {
    setEditingRowId(null);
    setModalTitle("ThÃªm nguyÃªn liá»‡u");
    setModalOpen(true);
  };

  const openEditModal = (rowId: string) => {
    setEditingRowId(rowId);
    setModalTitle("Sá»­a nguyÃªn liá»‡u");
    setModalOpen(true);
  };

  const modalInitialRow = useMemo<RecipeItemRow>(() => {
    if (!editingRowId) {
      return { rowId: makeRowId(), ingredientId: "", quantity: "", unit: "g" };
    }
    return rows.find((r) => r.rowId === editingRowId) || { rowId: editingRowId, ingredientId: "", quantity: "", unit: "g" };
  }, [editingRowId, rows]);

  const loadBootstrap = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const [productsResponse, toppingsResult, ingredientsResult] = await Promise.all([
        http.get(`${url}/api/product/list`),
        listToppings(url),
        listIngredients(url),
      ]);

      const p = Array.isArray(productsResponse?.data?.data) ? (productsResponse.data.data as Product[]) : [];
      const t = Array.isArray(toppingsResult?.data) ? (toppingsResult.data as Topping[]) : [];

      if (!ingredientsResult?.success) {
        throw new Error(ingredientsResult?.message || "KhÃ´ng thá»ƒ táº£i nguyÃªn liá»‡u.");
      }
      const i = Array.isArray(ingredientsResult.data) ? (ingredientsResult.data as Ingredient[]) : [];

      setProducts(p);
      setToppings(t);
      setIngredients(i);
    } catch (error: any) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u cÃ´ng thá»©c.");
    } finally {
      setLoading(false);
    }
  };

  const loadRecipe = async (target: RecipeTarget) => {
    if (!url) return;
    setLoading(true);
    try {
      if (target.type === "product") {
        const result = await getRecipe(url, target.id);
        if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c.");
        const recipe = (result.data || null) as RecipeDoc | null;

        const list = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];
        const nextRows: RecipeItemRow[] = list
          .map((entry) => {
            const ingredientId = String(getIdFromMaybePopulated(entry?.ingredientId) || "").trim();
            if (!ingredientId) return null;

            const ingInfo = ingredients.find((i) => String(i._id) === ingredientId) || null;
            return {
              rowId: makeRowId(),
              ingredientId,
              quantity: String(entry?.quantity ?? ""),
              unit: String(entry?.unit || ingInfo?.unit || ""),
            };
          })
          .filter(Boolean) as RecipeItemRow[];

        setRows(nextRows);
        return;
      }

      // topping
      const result = await getTopping(url, target.id);
      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ táº£i topping.");
      const topping = (result.data || null) as Topping | null;

      const list = Array.isArray(topping?.ingredients) ? topping!.ingredients : [];
      const nextRows: RecipeItemRow[] = list
        .map((entry) => {
          const ingredientId = String(getIdFromMaybePopulated(entry?.ingredientId) || "").trim();
          if (!ingredientId) return null;
          const ingInfo = ingredients.find((i) => String(i._id) === ingredientId) || null;
          return {
            rowId: makeRowId(),
            ingredientId,
            quantity: String(entry?.quantity ?? ""),
            unit: String(entry?.unit || ingInfo?.unit || ""),
          };
        })
        .filter(Boolean) as RecipeItemRow[];

      setRows(nextRows);
    } catch (error: any) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ táº£i cÃ´ng thá»©c.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!selectedTarget) return;
    // load recipe when switching target
    loadRecipe(selectedTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const submit = async () => {
    if (!url || !selectedTarget) return toast.error("Vui lÃ²ng chá»n sáº£n pháº©m/topping.");

    const normalized = rows
      .map((r) => ({
        ingredientId: String(r.ingredientId || "").trim(),
        quantity: Math.max(0, toNumber(r.quantity, 0)),
        unit: String(r.unit || "").trim(),
      }))
      .filter((r) => r.ingredientId && r.quantity > 0);

    setLoading(true);
    try {
      const result =
        selectedTarget.type === "product"
          ? await saveRecipe(url, selectedTarget.id, normalized)
          : await saveToppingRecipe(url, selectedTarget.id, normalized);

      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ lÆ°u cÃ´ng thá»©c.");
      toast.success("ÄÃ£ lÆ°u cÃ´ng thá»©c.");
      await loadRecipe(selectedTarget);
    } catch (error: any) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ lÆ°u cÃ´ng thá»©c.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!url || !selectedTarget) return;
    const ok = window.confirm(
      selectedTarget.type === "topping"
        ? `XÃ³a toÃ n bá»™ cÃ´ng thá»©c cho topping "${selectedTarget.name}"?`
        : `XÃ³a toÃ n bá»™ cÃ´ng thá»©c cho sáº£n pháº©m "${selectedTarget.name}"?`
    );
    if (!ok) return;

    setLoading(true);
    try {
      const result =
        selectedTarget.type === "product"
          ? await deleteRecipe(url, selectedTarget.id)
          : await deleteToppingRecipe(url, selectedTarget.id);

      if (!result?.success) throw new Error(result?.message || "KhÃ´ng thá»ƒ xÃ³a cÃ´ng thá»©c.");
      toast.success(result?.message || "ÄÃ£ xÃ³a cÃ´ng thá»©c.");
      setRows([]);
    } catch (error: any) {
      toast.error(error?.message || "KhÃ´ng thá»ƒ xÃ³a cÃ´ng thá»©c.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";

  const showMissingToppingRecipeWarning = Boolean(
    selectedTarget?.type === "topping" && (!rows || rows.length === 0)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <h3 className="text-base font-semibold text-stone-800">CÃ´ng thá»©c sáº£n pháº©m & topping</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">Chá»n sáº£n pháº©m / topping</span>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className={inputStyle}
            >
              <option value="">-- Chá»n sáº£n pháº©m --</option>
              <optgroup label="Sáº£n pháº©m">
                {targets
                  .filter((t) => t.type === "product")
                  .map((t) => (
                    <option key={`product:${t.id}`} value={`product:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Topping">
                {targets
                  .filter((t) => t.type === "topping")
                  .map((t) => (
                    <option key={`topping:${t.id}`} value={`topping:${t.id}`}>
                      {t.name} (Topping)
                    </option>
                  ))}
              </optgroup>
            </select>
            {selectedTarget ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-stone-600">Äang chá»n:</span>
                <span className="font-medium text-stone-900">{selectedTarget.name}</span>
                {selectedTarget.isTopping ? (
                  <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    Topping
                  </span>
                ) : (
                  <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                    Sáº£n pháº©m
                  </span>
                )}
              </div>
            ) : null}
          </label>

          <div className="flex items-end justify-end gap-2">
            <button type="button" className="btn btn-view h-11" onClick={loadBootstrap}>
              Táº£i láº¡i dá»¯ liá»‡u
            </button>
          </div>
        </div>
      </div>

      {selectedTarget ? (
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {selectedTarget.type === "topping" ? (
                <>
                  <h3 className="text-base font-semibold text-stone-800">
                    CÃ´ng thá»©c nguyÃªn liá»‡u cho topping: {selectedTarget.name}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">Äá»‹nh má»©c: nguyÃªn liá»‡u / 1 pháº§n topping</p>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-stone-800">NguyÃªn liá»‡u / 1 sáº£n pháº©m</h3>
                  <p className="mt-1 text-sm text-stone-600">Äá»‹nh má»©c: nguyÃªn liá»‡u / 1 sáº£n pháº©m</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn h-11 bg-green-600 text-white hover:bg-green-700"
                onClick={openAddModal}
              >
                + ThÃªm nguyÃªn liá»‡u
              </button>
              <button type="button" className="btn btn-delete h-11" onClick={handleDeleteRecipe} disabled={loading}>
                XÃ³a cÃ´ng thá»©c
              </button>
              <button type="button" className="btn btn-confirm h-11" onClick={submit} disabled={loading}>
                {loading ? "Äang lÆ°u..." : "LÆ°u cÃ´ng thá»©c"}
              </button>
            </div>
          </div>

          {showMissingToppingRecipeWarning ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <span className="font-semibold">Topping nÃ y chÆ°a cÃ³ cÃ´ng thá»©c nguyÃªn liá»‡u.</span>{" "}
              Vui lÃ²ng thÃªm Ä‘á»ƒ quáº£n lÃ½ kho chÃ­nh xÃ¡c.
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[860px] w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-3">TÃªn nguyÃªn liá»‡u</th>
                  <th className="px-3">Sá»‘ lÆ°á»£ng</th>
                  <th className="px-3">ÄÆ¡n vá»‹</th>
                  <th className="px-3">GiÃ¡ Æ°á»›c tÃ­nh</th>
                  <th className="px-3 text-right">HÃ nh Ä‘á»™ng</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-stone-500">
                      ChÆ°a cÃ³ nguyÃªn liá»‡u nÃ o.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const ing = ingredientOptions.find((i) => String(i._id) === String(row.ingredientId)) || null;
                    return (
                      <tr key={row.rowId} className="rounded-xl bg-stone-50 hover:bg-stone-100">
                        <td className="px-3 py-3 text-sm font-medium text-stone-800">{ing?.name || "N/A"}</td>
                        <td className="px-3 py-3 text-sm text-stone-700">{row.quantity}</td>
                        <td className="px-3 py-3 text-sm text-stone-700">{row.unit || ing?.unit || ""}</td>
                        <td className="px-3 py-3 text-sm text-stone-700">-</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn btn-edit h-10" onClick={() => openEditModal(row.rowId)}>
                              Sá»­a
                            </button>
                            <button
                              type="button"
                              className="btn btn-delete h-10"
                              onClick={() => setRows((prev) => prev.filter((r) => r.rowId !== row.rowId))}
                            >
                              XÃ³a
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <RecipeItemModal
        open={modalOpen}
        title={modalTitle}
        ingredients={ingredientOptions}
        pickedIngredientIds={pickedIngredientIds}
        initial={modalInitialRow}
        onClose={() => setModalOpen(false)}
        onSubmit={(next) => {
          setRows((prev) => {
            const cleaned: RecipeItemRow = {
              ...next,
              rowId: next.rowId || makeRowId(),
              ingredientId: String(next.ingredientId || "").trim(),
              quantity: String(next.quantity || ""),
              unit: String(next.unit || "").trim(),
            };

            const isEdit = Boolean(editingRowId);
            if (isEdit) {
              return prev.map((r) => (r.rowId === editingRowId ? cleaned : r));
            }

            return [...prev, cleaned];
          });
          setModalOpen(false);
        }}
      />
    </div>
  );
};

export default RecipeManager;

