import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  createIngredient,
  deleteIngredient,
  listIngredients,
  listRecipes,
  listToppings,
  updateIngredient,
} from "../../api/inventoryApi";
import ExportExcelButton from "../../components/ExportExcelButton";
import InventoryForm from "../../components/InventoryForm";
import InventoryTable from "../../components/InventoryTable";
import DeleteConfirmModal from "../../components/products/DeleteConfirmModal";
import { formatDateTimeVn } from "../../utils/datetime";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toId = (value) => String(value?._id || value?.id || value || "").trim();

const Ingredients = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [items, setItems] = useState([]);
  const [usageMap, setUsageMap] = useState(() => new Map());
  const [usageModal, setUsageModal] = useState(null); // { ingredient, usage }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingIngredient, setDeletingIngredient] = useState(false);

  const [form, setForm] = useState({
    _id: "",
    name: "",
    unit: "ml",
    stock: "",
    minStock: "",
  });

  const isEdit = Boolean(form._id);

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const buttonBase =
    "inline-flex h-11 items-center justify-center rounded-lg px-8 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none";
  const greenButtonStyle = `${buttonBase} bg-green-500 text-white hover:bg-green-600`;
  const orangeButtonStyle = `${buttonBase} min-w-[50px] bg-orange-500 text-white hover:bg-orange-600`;

  const buildUsageMap = (recipesList, toppingsList) => {
    const map = new Map();

    const ensure = (ingredientId) => {
      const id = String(ingredientId || "").trim();
      if (!id) return null;
      const existing = map.get(id);
      if (existing) return existing;
      const next = { products: [], toppings: [] };
      map.set(id, next);
      return next;
    };

    (Array.isArray(recipesList) ? recipesList : []).forEach((recipe) => {
      const productId = toId(recipe?.productId);
      const productName = String(recipe?.productName || "").trim() || "N/A";
      const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];

      ingredients.forEach((row) => {
        const ingredientId = toId(row?.ingredientId);
        const entry = ensure(ingredientId);
        if (!entry) return;

        if (productId && !entry.products.some((p) => String(p.id) === String(productId))) {
          entry.products.push({ id: productId, name: productName });
        }
      });
    });

    (Array.isArray(toppingsList) ? toppingsList : []).forEach((topping) => {
      const toppingId = toId(topping?._id);
      const toppingName = String(topping?.name || "").trim() || "N/A";
      const ingredients = Array.isArray(topping?.ingredients) ? topping.ingredients : [];

      ingredients.forEach((row) => {
        const ingredientId = toId(row?.ingredientId);
        const entry = ensure(ingredientId);
        if (!entry) return;

        if (toppingId && !entry.toppings.some((t) => String(t.id) === String(toppingId))) {
          entry.toppings.push({ id: toppingId, name: toppingName });
        }
      });
    });

    // Sort for stable UI
    for (const value of map.values()) {
      value.products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
      value.toppings.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
    }

    return map;
  };

  const load = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const [result, recipesResult, toppingsResult] = await Promise.all([
        listIngredients(url, {
          q: query || undefined,
          lowStockOnly: lowOnly ? "1" : undefined,
        }),
        listRecipes(url),
        listToppings(url),
      ]);
      if (!result?.success) throw new Error(result?.message || "Không thể tải nguyên liệu.");
      setItems(Array.isArray(result.data) ? result.data : []);

      if (recipesResult?.success && toppingsResult?.success) {
        setUsageMap(buildUsageMap(recipesResult.data, toppingsResult.data));
      } else {
        setUsageMap(new Map());
      }
    } catch (error) {
      toast.error(error?.message || "Không thể tải nguyên liệu.");
      setItems([]);
      setUsageMap(new Map());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [url]);

  const resetForm = () =>
    setForm({ _id: "", name: "", unit: "ml", stock: "", minStock: "" });

  const submit = async (event) => {
    event.preventDefault();
    if (!url) return;

    const name = String(form.name || "").trim();
    const unit = String(form.unit || "").trim();
    const minStock = Math.max(0, toNumber(form.minStock, 0));

    if (!name) return toast.error("Vui lòng nhập tên nguyên liệu.");
    if (!unit) return toast.error("Vui lòng nhập đơn vị.");

    setLoading(true);
    try {
      const result = isEdit
        ? await updateIngredient(url, form._id, { name, unit, minStock })
        : await createIngredient(url, {
            name,
            unit,
            stock: Math.max(0, toNumber(form.stock, 0)),
            minStock,
          });

      if (!result?.success)
        throw new Error(result?.message || "Không thể lưu nguyên liệu.");

      toast.success(
        isEdit
          ? "Cập nhật nguyên liệu thành công."
          : "Thêm nguyên liệu thành công."
      );

      resetForm();
      await load();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu nguyên liệu.");
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (row) => {
    setForm({
      _id: String(row?._id || ""),
      name: String(row?.name || ""),
      unit: String(row?.unit || "ml"),
      stock: "",
      minStock: String(row?.minStock ?? ""),
    });
  };

  const onDelete = (row) => {
    if (!row?._id) return;
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!url || !deleteTarget?._id) return;

    setDeletingIngredient(true);
    try {
      const result = await deleteIngredient(url, deleteTarget._id);
      if (!result?.success)
        throw new Error(result?.message || "Không thể xóa nguyên liệu.");

      toast.success("Đã xóa nguyên liệu.");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Không thể xóa nguyên liệu."
      );
    } finally {
      setDeletingIngredient(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Tên",
        render: (row) => {
          const low =
            toNumber(row.stock, 0) <= toNumber(row.minStock, 0);
          return (
            <div className="min-w-[180px]">
              <div className="font-semibold text-[var(--text-primary)]">
                {row.name}
              </div>
              {low ? (
                <div className="mt-0.5 text-xs font-semibold text-[var(--warning)]">
                  ⚠ Sắp hết
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "stock",
        header: "Tồn kho",
        headerClassName: "text-right",
        cellClassName: "text-right font-semibold",
        render: (r) => r.stock,
      },
      {
        key: "unit",
        header: "Đơn vị",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (r) => r.unit,
      },
      {
        key: "minStock",
        header: "Cảnh báo",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (r) => r.minStock,
      },
      {
        key: "usage",
        header: "Dùng trong",
        render: (row) => {
          const usage = usageMap.get(String(row?._id || "")) || { products: [], toppings: [] };
          const pCount = Array.isArray(usage.products) ? usage.products.length : 0;
          const tCount = Array.isArray(usage.toppings) ? usage.toppings.length : 0;

          return (
            <div className="min-w-[160px] text-right">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                SP: {pCount} • TP: {tCount}
              </div>
              <button
                type="button"
                className="mt-1 inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                disabled={pCount + tCount === 0}
                onClick={() => setUsageModal({ ingredient: row, usage })}
                title={pCount + tCount === 0 ? "Chưa được dùng trong công thức nào" : "Xem chi tiết"}
              >
                Xem
              </button>
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "Hành động",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <div className="inline-flex gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-500 px-4 text-xs font-medium text-white transition hover:bg-blue-600"
              onClick={() => onEdit(row)}
            >
              Sửa
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-red-500 px-4 text-xs font-medium text-white transition hover:bg-red-600"
              disabled={deletingIngredient}
              onClick={() => onDelete(row)}
            >
              Xóa
            </button>
          </div>
        ),
      },
    ],
    [usageMap, deletingIngredient]
  );

  return (
    <div className="space-y-6 p-6">
      <InventoryForm
        mode={isEdit ? "edit" : "create"}
        values={form}
        onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
        onSubmit={submit}
        onCancel={resetForm}
        loading={loading}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">
              Danh sách nguyên liệu
            </div>
            <div className="text-sm text-stone-500">
              Bảng có scroll ngang trên mobile.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ExportExcelButton
              data={items}
              fileName="ingredients.xlsx"
              sheetName="Ingredients"
              columns={[
                { header: "Tên", key: "name" },
                { header: "Tồn kho", key: "stock" },
                { header: "Đơn vị", key: "unit" },
                { header: "Cảnh báo", key: "minStock" },
                { header: "Created At (VN)", key: "createdAt", value: (item) => formatDateTimeVn(item?.createdAt) },
              ]}
              disabled={items.length === 0}
            />

            <button
              type="button"
              onClick={load}
              className={greenButtonStyle}
            >
              {loading ? "Đang tải..." : "Tải lại"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên..."
            className={["max-w-md", inputStyle].join(" ")}
          />

          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(e) => setLowOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
            />
            Chỉ sắp hết
          </label>

          <button
            type="button"
            onClick={load}
            className={orangeButtonStyle}
          >
            Lọc
          </button>
        </div>

        <div className="mt-5">
          <InventoryTable
            columns={columns}
            rows={items}
            rowKey={(r) => String(r._id)}
          />
        </div>
      </div>

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        itemName={deleteTarget?.name || ""}
        itemLabel="nguyên liệu"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deletingIngredient}
      />

      {usageModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUsageModal(null);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-500">Nguyên liệu</div>
                <div className="mt-1 truncate text-lg font-extrabold text-stone-900">
                  {String(usageModal?.ingredient?.name || "N/A")}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                onClick={() => setUsageModal(null)}
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-extrabold text-stone-900">Sản phẩm dùng nguyên liệu này</div>
                {(usageModal?.usage?.products || []).length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {(usageModal.usage.products || []).map((p) => (
                      <li key={`p:${String(p.id)}`} className="rounded-lg bg-white px-3 py-2 text-sm text-stone-800 shadow-sm">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 text-sm text-stone-500">Chưa có sản phẩm nào.</div>
                )}
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-extrabold text-stone-900">Topping dùng nguyên liệu này</div>
                {(usageModal?.usage?.toppings || []).length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {(usageModal.usage.toppings || []).map((t) => (
                      <li key={`t:${String(t.id)}`} className="rounded-lg bg-white px-3 py-2 text-sm text-stone-800 shadow-sm">
                        {t.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 text-sm text-stone-500">Chưa có topping nào.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Ingredients;

