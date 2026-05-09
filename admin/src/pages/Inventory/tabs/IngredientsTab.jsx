import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  createIngredient,
  deleteIngredient,
  listIngredients,
  updateIngredient,
} from "../../../api/inventoryApi";
import DeleteConfirmModal from "../../../components/products/DeleteConfirmModal";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const IngredientsTab = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [items, setItems] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingIngredient, setDeletingIngredient] = useState(false);

  const [form, setForm] = useState({
    _id: "",
    name: "",
    unit: "ml",
    stock: "",
    minStock: "",
  });

  const resetForm = () =>
    setForm({ _id: "", name: "", unit: "ml", stock: "", minStock: "" });

  const load = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await listIngredients(url, {
        q: query || undefined,
        lowStockOnly: lowOnly ? "1" : undefined,
      });
      if (!result?.success) throw new Error("Không thể tải nguyên liệu.");
      setItems(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error(error?.message || "Lỗi tải dữ liệu");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [url]);

  const submit = async (e) => {
    e.preventDefault();
    if (!url) return;

    const name = form.name.trim();
    const unit = form.unit.trim();
    const minStock = Math.max(0, toNumber(form.minStock));

    if (!name) return toast.error("Nhập tên nguyên liệu");
    if (!unit) return toast.error("Nhập đơn vị");

    setLoading(true);
    try {
      const result = form._id
        ? await updateIngredient(url, form._id, { name, unit, minStock })
        : await createIngredient(url, {
            name,
            unit,
            stock: Math.max(0, toNumber(form.stock)),
            minStock,
          });

      if (!result?.success) throw new Error("Không thể lưu");
      toast.success(form._id ? "Đã cập nhật" : "Đã thêm");
      resetForm();
      load();
    } catch (err) {
      toast.error(err?.message || "Lỗi");
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (row) => {
    setForm({
      _id: row._id,
      name: row.name,
      unit: row.unit,
      stock: "",
      minStock: row.minStock,
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
      if (!result?.success) throw new Error(result?.message || "Không thể xóa nguyên liệu.");
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

  return (
    <div className="space-y-4">
      {/* FORM */}
      <form onSubmit={submit} className="rounded-xl bg-white p-5 shadow-md">
        <h3 className="font-semibold text-stone-800">
          {form._id ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}
        </h3>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            placeholder="Tên"
            className="w-full rounded-lg border px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Đơn vị"
            className="w-full rounded-lg border px-3 py-2"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
          {!form._id && (
            <input
              type="number"
              placeholder="Tồn kho"
              className="w-full rounded-lg border px-3 py-2"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          )}
          <input
            type="number"
            placeholder="Cảnh báo"
            className="w-full rounded-lg border px-3 py-2"
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value })}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-3 rounded-full bg-green-500 px-6 py-2 text-white font-semibold hover:bg-green-600"
        >
          {loading ? "Đang lưu..." : "Lưu"}
        </button>
      </form>

      {/* TABLE */}
      <div className="rounded-xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            placeholder="Tìm theo tên..."
            className="w-64 rounded-lg border px-3 py-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
              />
              Sắp hết
            </label>

            <button
              onClick={load}
              className="rounded-full bg-green-500 px-5 py-2 text-white hover:bg-green-600"
            >
              Lọc
            </button>
          </div>
        </div>

        <table className="w-full mt-3 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-2 py-2">Tên</th>
              <th className="text-right px-2 py-2">Tồn</th>
              <th className="text-right px-2 py-2">Đơn vị</th>
              <th className="text-right px-2 py-2">Hành động</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-3">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row._id} className="border-t">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2 text-right">{row.stock}</td>
                  <td className="px-2 py-2 text-right">{row.unit}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => onEdit(row)}
                      className="rounded-full bg-blue-500 px-4 py-1 text-white mr-2"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => onDelete(row)}
                      disabled={deletingIngredient}
                      className="rounded-full bg-red-500 px-4 py-1 text-white"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        itemName={deleteTarget?.name || ""}
        itemLabel="nguyên liệu"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deletingIngredient}
      />
    </div>
  );
};

export default IngredientsTab;

