import React, { useMemo, useState } from "react";
import FormInput from "../ui/FormInput";
import FormTextarea from "../ui/FormTextarea";
import ImageUploader from "../products/ImageUploader";
import { t } from "../../i18n";
import { uploadImage } from "../../api/mediaApi";
import { useCategoryStore } from "../../store/categoryStore.jsx";
import { resolveImageSrc } from "../../utils/resolveImage";

function CategoryForm({
  initialValue,
  submitLabel,
  submitVariant = "create",
  loading,
  onSubmit,
  onCancel,
}) {
  const { apiUrl } = useCategoryStore();
  const initialImageUrl = initialValue?.image || "";
  const initialImagePublicId = initialValue?.imagePublicId || "";
  const [form, setForm] = useState({
    name: initialValue?.name || "",
    description: initialValue?.description || "",
    imageUrl: initialImageUrl,
    imagePublicId: initialImagePublicId,
  });
  const [previewUrl, setPreviewUrl] = useState(
    initialValue?.image ? resolveImageSrc(initialValue.image, apiUrl) : ""
  );
  const [errors, setErrors] = useState({ name: "", image: "" });
  const [uploading, setUploading] = useState(false);

  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && !loading,
    [form.name, loading]
  );
  const submitClass = submitVariant === "edit" ? "btn-edit" : "btn-add";

  const handleBasicChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "name" && value.trim()) {
      setErrors((prev) => ({ ...prev, name: "" }));
    }
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const result = await uploadImage(apiUrl, file);
      if (!result?.success || !result?.data?.url || !result?.data?.publicId) {
        setErrors((prev) => ({ ...prev, image: result?.message || t("notify.submit_failed") }));
        return;
      }
      setForm((prev) => ({
        ...prev,
        imageUrl: result.data.url,
        imagePublicId: result.data.publicId,
      }));
      setPreviewUrl(result.data.url);
      setErrors((prev) => ({ ...prev, image: "" }));
    } catch {
      setErrors((prev) => ({ ...prev, image: t("notify.cannot_load_selected_image") }));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrors((prev) => ({ ...prev, name: t("notify.category_name_required") }));
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
    };

    if (form.imagePublicId) {
      payload.imageUrl = form.imageUrl || "";
      payload.imagePublicId = form.imagePublicId || "";
    } else if (!initialImagePublicId && !form.imagePublicId && form.imageUrl !== initialImageUrl) {
      payload.imageUrl = form.imageUrl || "";
      payload.imagePublicId = "";
    }

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ImageUploader
        previewUrl={previewUrl}
        onChange={handleImageChange}
        error={errors.image}
      />

      <FormInput
        label={t("category.name")}
        name="name"
        value={form.name}
        onChange={handleBasicChange}
        placeholder={t("category.name_placeholder")}
        required
        error={errors.name}
      />

      <FormTextarea
        label={t("field.description")}
        name="description"
        value={form.description}
        onChange={handleBasicChange}
        placeholder={t("category.description_placeholder")}
        rows={4}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!canSubmit || uploading}
          className={`btn ${submitClass}`}
        >
          {loading ? `${t("common.save")}...` : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-cancel"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export default CategoryForm;
