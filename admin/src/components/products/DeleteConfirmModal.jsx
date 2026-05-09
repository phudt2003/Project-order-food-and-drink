import React from "react";
import { t } from "../../i18n";

function DeleteConfirmModal({
  open,
  productName,
  itemName,
  itemLabel,
  title,
  message,
  onCancel,
  onConfirm,
  loading,
}) {
  if (!open) return null;
  const displayName = itemName || productName || "";
  const heading = title || `${t("common.delete")} ${itemLabel || t("sidebar.list_items")}`;
  const content =
    message || (
      <>
        {t("notify.are_you_sure")} {t("common.delete")} <b>{displayName}</b>?
      </>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h3 className="text-lg font-semibold text-stone-800">{heading}</h3>
        <p className="mt-2 text-sm text-stone-600">{content}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-cancel"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn btn-delete"
          >
            {loading ? `${t("common.delete")}...` : t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
