import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import CategoryForm from "../../components/categories/CategoryForm";
import { useCategoryStore } from "../../store/categoryStore.jsx";
import { t } from "../../i18n";

function EditCategory() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { categories, getCategories, getCategoryById, updateCategory } = useCategoryStore();

  const [initialValue, setInitialValue] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadCategory = async () => {
      setLoadingPage(true);
      if (!categories.length) {
        await getCategories();
      }

      const found = getCategoryById(id);
      if (!mounted) return;

      if (!found) {
        toast.error(t("category.not_found"));
        navigate("/categories");
        return;
      }

      setInitialValue(found);
      setLoadingPage(false);
    };

    loadCategory();

    return () => {
      mounted = false;
    };
  }, [id, categories.length]);

  const handleSubmit = async (payload) => {
    setSaving(true);
    const result = await updateCategory(id, payload);
    setSaving(false);

    if (!result.success) {
      toast.error(result.message || t("notify.cannot_update_category"));
      return;
    }

    toast.success(result.message || t("notify.category_updated"));
    navigate("/categories");
  };

  return (
    <div className="w-full flex-1 bg-amber-50/40 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-stone-800">{t("category.edit_title")}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {t("category.edit_subtitle")}
        </p>

        {loadingPage || !initialValue ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-stone-600">
            {t("category.loading")}
          </div>
        ) : (
          <div className="mt-4">
            <CategoryForm
              initialValue={initialValue}
              submitLabel={t("category.update_button")}
              submitVariant="edit"
              loading={saving}
              onSubmit={handleSubmit}
              onCancel={() => navigate("/categories")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default EditCategory;
