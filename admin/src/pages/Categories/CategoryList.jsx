import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import DeleteConfirmModal from "../../components/products/DeleteConfirmModal";
import { useCategoryStore } from "../../store/categoryStore.jsx";
import { resolveImageSrc } from "../../utils/resolveImage";
import { t } from "../../i18n";

function CategoryList() {
  const navigate = useNavigate();
  const { categories, loading, getCategories, deleteCategory, apiUrl } = useCategoryStore();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const visibleCategories = categories.filter(
    (category) => String(category?.name || "").trim().toLowerCase() !== "uncategorized"
  );

  useEffect(() => {
    if (!apiUrl) return;
    getCategories({ force: true });
  }, [apiUrl]);

  const handleDelete = (category) => {
    if (category.isSystem) {
      toast.error(t("notify.system_category_cannot_delete"));
      return;
    }
    setDeleteTarget(category);
  };

  const confirmDelete = async () => {
    const targetId = deleteTarget?._id;
    if (!targetId) return;
    setDeleting(true);
    setRemovingId(targetId);
    try {
      const result = await deleteCategory(targetId);
      if (!result.success) {
        toast.error(result.message || t("notify.delete_failed"));
        return;
      }
      toast.success(result.message || t("notify.category_deleted"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(t("notify.delete_failed"));
    } finally {
      setDeleting(false);
      setRemovingId("");
    }
  };

  return (
    <div className="w-full flex-1 bg-amber-50/40 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 text-center flex flex-col">
          <h1 className="text-2xl font-semibold text-stone-800">Danh sách danh mục</h1>
          <p className="mt-1 text-sm text-stone-500">Xem và quản lý toàn bộ danh mục</p>
          <button
            type="button"
            onClick={() => navigate("/categories/add")}
            className="btn btn-add mt-3 self-end"
          >
            + {t("category.add_button")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-amber-200 bg-white p-6 text-sm text-stone-600">
            {t("category.loading")}
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-white p-8 text-center">
            <p className="text-base font-semibold text-stone-700">{t("category.no_categories")}</p>
            <p className="mt-1 text-sm text-stone-500">
              {t("category.no_categories_hint")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleCategories.map((category) => (
              <article
                key={category._id}
                className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"
              >
                <div className="h-36 overflow-hidden rounded-xl bg-amber-100">
                  {category.image ? (
                    <img
                      src={resolveImageSrc(category.image, apiUrl)}
                      alt={category.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-medium text-amber-700">
                      {t("common.no_image")}
                    </div>
                  )}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-stone-800">{category.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-stone-500">
                  {category.description || t("common.no_description")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/categories/edit/${category._id}`)}
                    className="btn btn-edit"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category)}
                    disabled={deleting || removingId === category._id || category.isSystem}
                    className="btn btn-delete"
                  >
                    {removingId === category._id ? `${t("common.delete")}...` : t("common.delete")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        itemName={deleteTarget?.name || ""}
        itemLabel={t("field.category")}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}

export default CategoryList;
