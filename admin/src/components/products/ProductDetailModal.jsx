import React from "react";
import { formatVND } from "../../utils/currency";
import { t } from "../../i18n";

function ProductDetailModal({ open, product, imageUrl, onClose }) {
  if (!open || !product) return null;
  const displayType = product.type === "Drink" ? t("product.drink") : t("product.food");
  const displayCategory = product.categoryId?.name || product.category || t("product.uncategorized");
  const sizes = product.sizes || [];
  const toppings = product.toppings || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-stone-800">{product.name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-cancel"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="mt-3 flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-100 p-2 sm:min-h-[240px]">
          <img
            src={imageUrl}
            alt={product.name}
            className="max-h-[52vh] w-auto max-w-full rounded-lg object-contain"
          />
        </div>

        <p className="mt-3 text-sm text-stone-600">{product.description}</p>
        <p className="mt-2 text-sm text-stone-700">
          {t("field.category")}: <b>{displayCategory}</b> | {t("field.type")}: <b>{displayType}</b>
        </p>

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-stone-800">{t("field.sizes")}</h4>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {sizes.length === 0 ? (
              <li>{t("field.base_price")}: {formatVND(product.price || 0)}</li>
            ) : (
              sizes.map((size, idx) => (
                <li key={`size-${idx}`}>
                  {size.name}: {formatVND(size.price || 0)}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-stone-800">{t("field.toppings")}</h4>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {toppings.length === 0 ? (
              <li>{t("notify.no_toppings")}</li>
            ) : (
              toppings.map((topping, idx) => (
                <li key={`topping-${idx}`}>
                  {topping.name}: {formatVND(topping.price || 0)}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailModal;
