import React from "react";
import { t } from "../../i18n";

function CategorySelect({ categories, value, loading, error, onSelect }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4 category-select">
      <label className="flex flex-col gap-1.5 category-select-label">
        <span className="text-sm font-medium text-stone-700">{t("field.category")}</span>
        <select
          value={value}
          onChange={(event) => onSelect(event.target.value)}
          disabled={loading}
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-100"
        >
          {categories.length === 0 ? (
            <option value="">{t("product.uncategorized")}</option>
          ) : null}
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      {loading ? <p className="mt-2 text-xs text-stone-500">{t("category.loading")}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

export default CategorySelect;
