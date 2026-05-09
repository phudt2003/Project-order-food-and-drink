import React from "react";
import { formatVND } from "../../utils/currency";
import { t } from "../../i18n";

const formatDate = (isoDate) => {
  if (!isoDate) return "--";
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("vi-VN");
};

function ProductCard({ product, imageUrl, onView, onEdit, onDelete, onToggleStatus, isUpdatingStatus }) {
  const displayType = product.type === "Drink" ? t("product.drink") : t("product.food");
  const displayCategory = product.categoryId?.name || product.category || t("product.uncategorized");
  const isActive = product?.isActive !== false;
  const statusLabel = isActive ? "Đang bán" : "Ngưng bán";

  return (
    <article className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
      <img
        src={imageUrl}
        alt={product.name}
        className="h-40 w-full rounded-xl object-cover"
      />

      <div className="mt-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="line-clamp-1 text-base font-semibold text-stone-800">
            {product.name}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isActive ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-stone-500">
          {displayCategory} / {displayType}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-amber-50 p-2">
          <dt className="text-stone-500">{t("field.base_price")}</dt>
          <dd className="font-semibold text-stone-800">
            {formatVND(product.price || 0)}
          </dd>
        </div>
        <div className="rounded-lg bg-amber-50 p-2">
          <dt className="text-stone-500">{t("field.toppings")}</dt>
          <dd className="font-semibold text-stone-800">
            {product.toppings?.length || 0}
          </dd>
        </div>
        <div className="col-span-2 rounded-lg bg-amber-50 p-2">
          <dt className="text-stone-500">{t("field.created_at")}</dt>
          <dd className="font-semibold text-stone-800">
            {formatDate(product.createdAt)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onView}
          className="btn btn-view"
        >
          {t("list.view_detail")}
        </button>
        <button
          type="button"
          onClick={onToggleStatus}
          className={`btn ${isActive ? "btn-status-off" : "btn-status-on"}`}
          disabled={isUpdatingStatus}
        >
          {isActive ? "Ngưng bán" : "Đang bán"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="btn btn-edit"
        >
          {t("common.edit")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn btn-delete"
        >
          {t("common.delete")}
        </button>
      </div>
    </article>
  );
}

export default ProductCard;
