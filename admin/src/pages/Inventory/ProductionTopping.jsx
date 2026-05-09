import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import InventoryTable from "../../components/InventoryTable";
import { listToppingInventory } from "../../api/toppingInventoryApi";
import { previewToppingProduction, produceTopping } from "../../api/toppingInventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ProductionTopping = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [toppings, setToppings] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [qty, setQty] = useState(1);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const inputStyle =
    "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";

  const load = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await listToppingInventory(url, {});
      if (!res?.success) throw new Error(res?.message || "Không tải được topping.");
      setToppings(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(error?.message || "Không tải được topping.");
      setToppings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [url]);

  const selected = useMemo(
    () => toppings.find((t) => String(t?._id) === String(targetId)) || null,
    [toppings, targetId]
  );
  const displayUnit = (unit) => (String(unit || "").trim() ? unit : "phần ");

  const handlePreview = async () => {
    if (!url || !targetId) return toast.error("Chọn topping trước.");
    setPreviewLoading(true);
    try {
      const result = await previewToppingProduction(url, {
        toppingId: targetId,
        quantity: Math.max(1, Math.round(toNumber(qty, 1))),
      });
      if (!result?.success) throw new Error(result?.message || "Không tính được nguyên liệu.");
      setPreview(result.data || null);
    } catch (error) {
      toast.error(error?.message || "Không tính được nguyên liệu.");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleProduce = async () => {
    if (!url || !targetId) return toast.error("Chọn topping trước.");
    setLoading(true);
    try {
      const result = await produceTopping(url, {
        toppingId: targetId,
        quantity: Math.max(1, Math.round(toNumber(qty, 1))),
      });
      if (!result?.success) throw new Error(result?.message || "Không sản xuất được.");
      toast.success("Đã sản xuất, đã trừ nguyên liệu và tăng stock topping.");
      setPreview(null);
      await load();
    } catch (error) {
      toast.error(error?.message || "Không sản xuất được.");
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Topping",
        render: (row) => (
          <div>
            <div className="font-semibold text-[var(--text-primary)]">{row.name}</div>
            <div className="text-xs text-stone-500">Min: {row.minStock ?? 0}</div>
          </div>
        ),
      },
      { key: "stock", header: "Tồn kho", headerClassName: "text-right", cellClassName: "text-right font-semibold" },
      {
        key: "unit",
        header: "Đơn vị",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => displayUnit(row?.unit),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Topping thành phẩm</div>
            <p className="text-sm text-stone-500">Chọn topping • nhập số lượng • trừ nguyên liệu • tăng kho.</p>
          </div>
          <button type="button" className="btn btn-cancel" onClick={load} disabled={loading}>
            {loading ? "Đang tải..." : "Tái tải"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Topping</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputStyle}>
              <option value="">-- Chọn topping --</option>
              {toppings.map((t) => (
                <option key={String(t._id)} value={String(t._id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Số lượng cán sản xuất</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputStyle}
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" className="btn btn-view h-11 flex-1" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? "Đang tính..." : "Xem trước"}
            </button>
            <button type="button" className="btn btn-confirm h-11 flex-1" onClick={handleProduce} disabled={loading}>
              Sản xuất
            </button>
          </div>
        </div>

        {selected ? (
          <div className="mt-3 text-sm text-stone-600">
            Tồn hiện tại: <span className="font-semibold text-stone-900">{selected.stock}</span> {displayUnit(selected?.unit)}
          </div>
        ) : null}

        {preview ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-[var(--text-primary)]">Nguyên liệu sẽ trừ</div>
              <div className="mt-3 space-y-2 text-sm">
                {(preview.requirements || []).map((r) => {
                  const isShort = (preview.shortages || []).some((s) => String(s.ingredientId) === String(r.ingredientId));
                  return (
                    <div
                      key={String(r.ingredientId)}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${isShort ? "bg-rose-50 text-rose-700" : "bg-stone-50"}`}
                    >
                      <span className="font-medium">{r.name || r.ingredientId}</span>
                      <span className="font-semibold">{r.need} {r.unit || ""}</span>
                    </div>
                  );
                })}
              </div>
              {(preview.shortages || []).length > 0 ? (
                <div className="mt-3 text-sm font-semibold text-rose-600">Không đủ nguyên liệu, vui lòng nhập kho.</div>
              ) : (
                <div className="mt-3 text-xs text-green-700">Đủ nguyên liệu cho sản xuất.</div>
              )}
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-[var(--text-primary)]">Kết quả sản xuất</div>
              <div className="mt-3 text-sm text-stone-700">
                +{preview.producedQuantity || qty} {displayUnit(selected?.unit)} vào kho topping.
              </div>
              <div className="mt-2 text-xs text-stone-500">Sau khi nhấn "Sản xuất", hệ thống tự động trà nợ inventory logs.</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Tồn kho topping</div>
            <p className="text-sm text-stone-500">Theo dõi tồn và cảnh báo min stock.</p>
          </div>
          <button type="button" className="btn btn-cancel" onClick={load} disabled={loading}>
            {loading ? "Đang tải..." : "Lọc lại"}
          </button>
        </div>
        <InventoryTable columns={columns} rows={toppings} rowKey={(r) => String(r._id)} />
      </div>
    </div>
  );
};

export default ProductionTopping;




