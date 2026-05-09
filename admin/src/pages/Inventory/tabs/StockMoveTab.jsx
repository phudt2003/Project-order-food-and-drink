import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  exportStock,
  importStock,
  listIngredients,
} from "../../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const StockMoveTab = ({ url, kind }) => {
  const isImport = kind === "import";
  const title = isImport ? "Nhập kho" : "Xuất kho";

  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [items, setItems] = useState([]);

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const buttonBase = "btn inline-flex h-11 items-center justify-center rounded-lg px-6 text-sm font-medium";
  const reloadButtonStyle = `${buttonBase} btn-view`;
  const addRowButtonStyle = `${buttonBase} btn-cancel`;
  const deleteRowButtonStyle = `${buttonBase} btn-delete w-full`;
  const submitButtonStyle = `${buttonBase} btn-confirm`;

  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [ingredients]
  );

  const loadIngredients = async () => {
    if (!url) return;
    try {
      const result = await listIngredients(url);
      if (!result?.success) throw new Error(result?.message || "Không thể tải nguyên liệu.");
      setIngredients(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error(error?.message || "Không thể tải nguyên liệu.");
      setIngredients([]);
    }
  };

  useEffect(() => {
    loadIngredients();
  }, [url]);

  const addRow = () => setItems((prev) => [...prev, { ingredientId: "", quantity: "", note: "" }]);
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) => setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const submit = async () => {
    if (!url) return;

    const parsedRows = items.map((row, idx) => ({
      rowNo: idx + 1,
      ingredientId: String(row.ingredientId || "").trim(),
      quantity: toNumber(row.quantity, Number.NaN),
      note: String(row.note || "").trim(),
    }));

    const invalidRows = parsedRows
      .filter((row) => row.ingredientId && (!Number.isFinite(row.quantity) || row.quantity <= 0))
      .map((row) => row.rowNo);
    if (invalidRows.length > 0) {
      return toast.error(`So luong phai > 0. Dong loi: ${invalidRows.join(", ")}`);
    }

    const normalized = parsedRows
      .filter((row) => row.ingredientId)
      .map((row) => ({ ingredientId: row.ingredientId, quantity: row.quantity, note: row.note }));

    if (normalized.length === 0) return toast.error("Chua co dong hop le.");

    setLoading(true);
    try {
      const result = isImport
        ? await importStock(url, { items: normalized })
        : await exportStock(url, { items: normalized });
      if (!result?.success) throw new Error(result?.message || "Khong the cap nhat kho.");
      toast.success(isImport ? "Nhap kho thanh cong." : "Xuat kho thanh cong.");
      setItems([]);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Khong the cap nhat kho."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-800">{title}</h3>
          <div className="flex gap-2">
            <button
              type="button"
              className={reloadButtonStyle}
              onClick={loadIngredients}
            >
              Tải lại nguyên liệu
            </button>
            <button
              type="button"
              className={addRowButtonStyle}
              onClick={addRow}
            >
              + Thêm dòng
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {items.length === 0 ? (
            <div className="text-sm text-stone-500">Chưa có dòng nào.</div>
          ) : (
            items.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                <div className="md:col-span-5">
                  <select
                    value={row.ingredientId}
                    onChange={(e) => updateRow(idx, { ingredientId: e.target.value })}
                    className={inputStyle}
                  >
                    <option value="">-- Chọn nguyên liệu --</option>
                    {ingredientOptions.map((ing) => (
                      <option key={String(ing._id)} value={String(ing._id)}>
                        {ing.name} ({ing.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                    className={inputStyle}
                    placeholder="Số lượng"
                  />
                </div>
                <div className="md:col-span-4">
                  <input
                    value={row.note}
                    onChange={(e) => updateRow(idx, { note: e.target.value })}
                    className={inputStyle}
                    placeholder={isImport ? "Ghi chú" : "Lý do"}
                  />
                </div>
                <div className="md:col-span-1">
                  <button
                    type="button"
                    className={deleteRowButtonStyle}
                    onClick={() => removeRow(idx)}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled={loading}
            className={submitButtonStyle}
            onClick={submit}
          >
            {loading ? "Đang xử lý..." : isImport ? "Xác nhận nhập kho" : "Xác nhận xuất kho"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockMoveTab;

