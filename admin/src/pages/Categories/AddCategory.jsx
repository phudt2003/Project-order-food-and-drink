import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import CategoryForm from "../../components/categories/CategoryForm";
import { useCategoryStore } from "../../store/categoryStore.jsx";
import { t } from "../../i18n";

function AddCategory() {
  const navigate = useNavigate();
  const { addCategory } = useCategoryStore();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (payload) => {
    setSaving(true);
    const result = await addCategory(payload);
    setSaving(false);

    if (!result.success) {
      toast.error(result.message || t("notify.cannot_save_category"));
      return;
    }

    toast.success(result.message || t("notify.category_saved"));
    navigate("/categories");
  };

  return (
    <div className="w-full flex-1 bg-amber-50/40 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-stone-800">{t("category.add_title")}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {t("category.add_subtitle")}
        </p>
        <div className="mt-4">
          <CategoryForm
            submitLabel={t("category.save_button")}
            submitVariant="create"
            loading={saving}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/categories")}
          />
        </div>
      </div>
    </div>
  );
}

export default AddCategory;
