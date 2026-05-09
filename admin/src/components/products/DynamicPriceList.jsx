import React from "react";
import { t } from "../../i18n";

function DynamicPriceList({
  title,
  items,
  onAdd,
  onRemove,
  onChange,
  minItems = 0,
  error,
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        <button
          type="button"
          className="btn btn-add"
          onClick={onAdd}
        >
          {t("common.add")}
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${title}-${index}`}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]"
          >
            <input
              type="text"
              value={item.name}
              onChange={(event) => onChange(index, "name", event.target.value)}
              placeholder={t("field.name")}
              className="rounded-xl border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <input
              type="number"
              min="0"
              step="1000"
              value={item.price}
              onChange={(event) => onChange(index, "price", event.target.value)}
              placeholder={t("field.price")}
              className="rounded-xl border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={items.length <= minItems}
              className="btn btn-delete"
            >
              {t("common.delete")}
            </button>
          </div>
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </section>
  );
}

export default DynamicPriceList;
