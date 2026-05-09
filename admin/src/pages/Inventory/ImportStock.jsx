import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { importStock, listIngredients } from "../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ImportStock = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [rows, setRows] = useState([{ ingredientId: "", quantity: "", note: "" }]);

  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const buttonBase = "btn inline-flex h-11 items-center justify-center rounded-lg px-6 text-sm font-medium";
  const addRowButtonStyle = `${buttonBase} btn-cancel`;
  const submitButtonStyle = `${buttonBase} btn-confirm`;
  const deleteRowButtonStyle = `${buttonBase} btn-delete w-full`;

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

  const addRow = () => setRows((prev) => [...prev, { ingredientId: "", quantity: "", note: "" }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!url) return;

    const parsedRows = rows.map((r, idx) => ({
      rowNo: idx + 1,
      ingredientId: String(r.ingredientId || "").trim(),
      quantity: toNumber(r.quantity, Number.NaN),
      note: String(r.note || "").trim(),
    }));

    const invalidRows = parsedRows
      .filter((r) => r.ingredientId && (!Number.isFinite(r.quantity) || r.quantity <= 0))
      .map((r) => r.rowNo);
    if (invalidRows.length > 0) {
      return toast.error(`So luong phai > 0. Dong loi: ${invalidRows.join(", ")}`);
    }

    const items = parsedRows
      .filter((r) => r.ingredientId)
      .map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity, note: r.note }));

    if (items.length === 0) return toast.error("Chua co dong hop le.");

    setLoading(true);
    try {
      const result = await importStock(url, { items });
      if (!result?.success) throw new Error(result?.message || "Khong the nhap kho.");
      toast.success("Nhap kho thanh cong.");
      setRows([{ ingredientId: "", quantity: "", note: "" }]);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Khong the nhap kho."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">Nhập kho</div>
          <div className="text-sm text-stone-500">Thêm nhiều dòng nhập kho và xác nhận một lần.</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            className={addRowButtonStyle}
          >
            + Thêm dòng
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className={submitButtonStyle}
          >
            {loading ? "Đang xử lý..." : "Xác nhận nhập kho"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row, idx) => (
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
                placeholder="Ghi chú"
              />
            </div>
            <div className="md:col-span-1">
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className={deleteRowButtonStyle}
                disabled={rows.length === 1}
              >
                Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImportStock;

