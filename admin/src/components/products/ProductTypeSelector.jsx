import React from "react";
import { t } from "../../i18n";

function ProductTypeSelector({ value, onChange }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4">
      <p className="text-sm font-medium text-stone-700">{t("field.type")}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {["Drink", "Food"].map((type) => (
          <label
            key={type}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
              value === type
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-amber-200 text-stone-700"
            }`}
          >
            <input
              type="radio"
              className="h-4 w-4 accent-amber-600"
              checked={value === type}
              onChange={() => onChange(type)}
            />
            {type === "Drink" ? t("product.drink") : t("product.food")}
          </label>
        ))}
      </div>
    </div>
  );
}

export default ProductTypeSelector;
