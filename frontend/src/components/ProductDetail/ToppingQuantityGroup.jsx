import React from "react";
import { formatVND } from "../../utils/currency";

function ToppingQuantityGroup({
  title = "Topping",
  items = [],
  value = {},
  onIncrease,
  onDecrease,
  maxById = {},
}) {
  const totalQuantity = Object.values(value || {}).reduce((sum, rawQuantity) => {
    const quantity = Number(rawQuantity) || 0;
    return sum + Math.max(0, quantity);
  }, 0);

  return (
    <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="text-xs text-slate-500">Đã chọn {totalQuantity}</span>
      </div>

      <div className="mt-3 divide-y divide-slate-100">
        {items.map((item) => {
          const quantity = Number(value?.[item.id] || 0);
          const canDecrease = quantity > 0;
          const maxQty = Number.isFinite(maxById?.[item.id]) ? Number(maxById[item.id]) : null;
          const canIncrease = maxQty == null ? true : quantity < maxQty;

          return (
            <div key={item.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-500">+{formatVND(item.price)}</p>
                {maxQty != null ? (
                  <p className="text-[11px] text-slate-400">Còn: {maxQty}</p>
                ) : null}
              </div>

              <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  className="h-8 w-9 rounded-l-xl text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onDecrease?.(item.id)}
                  disabled={!canDecrease}
                  aria-label={`Giảm ${item.name}`}
                >
                  -
                </button>
                <span className="min-w-8 px-2 text-center text-sm font-semibold text-slate-800">
                  {quantity}
                </span>
                <button
                  type="button"
                  className="h-8 w-9 rounded-r-xl text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onIncrease?.(item.id)}
                  disabled={!canIncrease}
                  aria-label={`Tăng ${item.name}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ToppingQuantityGroup;

