import React from "react";
import { t } from "../../i18n";

function OptionList({
  title,
  enabled = true,
  onToggle,
  items,
  setItems,
  error,
  addLabel = t("common.add"),
}) {
  const addItem = () => {
    setItems((prev) => [...prev, { name: "", price: "" }]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateItem = (index, key, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const hasToggle = typeof onToggle === "function";

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        {hasToggle ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onToggle(event.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            {title}
          </label>
        ) : (
          <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        )}

        {enabled ? (
          <button
            type="button"
            className="btn btn-add"
            onClick={addItem}
          >
            {addLabel}
          </button>
        ) : null}
      </div>

      <div
        className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
          enabled ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="space-y-3 overflow-hidden">
          {items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]"
            >
              <input
                type="text"
                value={item.name}
                onChange={(event) => updateItem(index, "name", event.target.value)}
                placeholder={t("field.name")}
                className="rounded-xl border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
              <input
                type="number"
                min="0"
                step="1000"
                value={item.price}
                onChange={(event) => updateItem(index, "price", event.target.value)}
                placeholder={t("field.price")}
                className="rounded-xl border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="btn btn-delete"
              >
                {t("common.delete")}
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </section>
  );
}

export default OptionList;
