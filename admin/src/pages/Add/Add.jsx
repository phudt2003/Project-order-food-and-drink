import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import "./Add.css";
import { createProduct, getProductById, updateProduct } from "../../api/productsApi";
import { uploadImage } from "../../api/mediaApi";
import FormInput from "../../components/ui/FormInput";
import FormTextarea from "../../components/ui/FormTextarea";
import ProductTypeSelector from "../../components/products/ProductTypeSelector";
import DynamicPriceList from "../../components/products/DynamicPriceList";
import OptionList from "../../components/products/OptionList";
import ImageUploader from "../../components/products/ImageUploader";
import CategorySelect from "../../components/products/CategorySelect";
import { useCategoryStore } from "../../store/categoryStore.jsx";
import { t } from "../../i18n";
import { resolveImageSrc } from "../../utils/resolveImage";

const initialProductState = {
  name: "",
  description: "",
  categoryId: "",
  type: "Drink",
  imageUrl: "",
  imagePublicId: "",
  sizes: [{ name: "", price: "" }],
  toppings: [],
};

const emptyErrors = {
  name: "",
  description: "",
  image: "",
  categoryId: "",
  sizes: "",
  toppings: "",
};

const normalizeDynamicList = (list) =>
  list.map((item) => ({
    name: item.name.trim(),
    price: Number(item.price),
  }));

const normalizeOptionalDynamicList = (list) =>
  list
    .filter((item) => String(item?.name || "").trim() || String(item?.price ?? "").trim())
    .map((item) => ({
      name: String(item?.name || "").trim(),
      price: Number(item?.price),
    }));

const hasInvalidPartialRow = (list) =>
  list.some((item) => {
    const name = String(item?.name || "").trim();
    const priceRaw = String(item?.price ?? "").trim();

    if (!name && !priceRaw) return false;
    if (!name || !priceRaw) return true;

    const price = Number(item?.price);
    return !Number.isFinite(price);
  });

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const findDuplicateNames = (list) => {
  const seen = new Set();
  const duplicates = new Set();

  (Array.isArray(list) ? list : []).forEach((item) => {
    const name = normalizeName(item?.name);
    if (!name) return;
    if (seen.has(name)) {
      duplicates.add(name);
      return;
    }
    seen.add(name);
  });

  return Array.from(duplicates);
};

function Add({ url }) {
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get("edit");

  const {
    categories,
    fallbackCategoryId,
    loading: categoryLoading,
    getCategories,
  } = useCategoryStore();

  const [product, setProduct] = useState(initialProductState);
  const [enableToppings, setEnableToppings] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [errors, setErrors] = useState(emptyErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const isEditMode = Boolean(editingId);
  const submitButtonClass = isEditMode ? "btn-edit" : "btn-add";

  useEffect(() => {
    getCategories();
  }, []);

  useEffect(() => {
    if (!product.categoryId && fallbackCategoryId) {
      setProduct((prev) => ({ ...prev, categoryId: fallbackCategoryId }));
    }
  }, [fallbackCategoryId]);

  useEffect(() => {
    let mounted = true;

    const loadEditingData = async () => {
      if (!editingId) {
        setProduct((prev) => ({
          ...initialProductState,
          categoryId: prev.categoryId || fallbackCategoryId,
        }));
        setEnableToppings(false);
        setPreviewUrl("");
        return;
      }

      setIsLoadingProduct(true);
      try {
        const result = await getProductById(url, editingId);
        if (!mounted) return;

        if (!result.success || !result.data) {
          toast.error(result.message || t("notify.cannot_load_product"));
          return;
        }

        const item = result.data;
        const selectedCategoryId =
          (typeof item.categoryId === "string" ? item.categoryId : item.categoryId?._id) ||
          fallbackCategoryId;
        const nextType = item.type || "Drink";
        const nextToppings =
          item.toppings?.length > 0
            ? item.toppings.map((topping) => ({
                name: topping.name || "",
                price: String(topping.price ?? ""),
              }))
            : [];

        setProduct({
          name: item.name || "",
          description: item.description || "",
          categoryId: selectedCategoryId || "",
          type: nextType,
          imageUrl: item.image || "",
          imagePublicId: item.imagePublicId || "",
          sizes:
            item.sizes?.length > 0
              ? item.sizes.map((size) => ({
                  name: size.name || "",
                  price: String(size.price ?? ""),
                }))
              : [{ name: "", price: "" }],
          toppings: nextToppings,
        });
        setEnableToppings(nextToppings.length > 0);
        setPreviewUrl(item.image ? resolveImageSrc(item.image, url) : "");
      } catch (error) {
        toast.error(t("notify.cannot_load_product"));
      } finally {
        if (mounted) {
          setIsLoadingProduct(false);
        }
      }
    };

    loadEditingData();

    return () => {
      mounted = false;
    };
  }, [editingId, url, fallbackCategoryId]);

  const finalPayload = useMemo(() => {
    const sizes = normalizeDynamicList(product.sizes);
    const toppings = enableToppings ? normalizeOptionalDynamicList(product.toppings) : [];

    return {
      ...product,
      sizes,
      toppings,
    };
  }, [product, enableToppings]);

  const setField = (name, value) => {
    setProduct((prev) => ({ ...prev, [name]: value }));
  };

  const handleBasicChange = (event) => {
    const { name, value } = event.target;
    setField(name, value);
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const result = await uploadImage(url, file);
      if (!result?.success || !result?.data?.url || !result?.data?.publicId) {
        toast.error(result?.message || t("notify.submit_failed"));
        return;
      }

      setField("imageUrl", result.data.url);
      setField("imagePublicId", result.data.publicId);
      setPreviewUrl(result.data.url);
      setErrors((prev) => ({ ...prev, image: "" }));
    } catch (error) {
      toast.error(t("notify.network_submit_product"));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleTypeChange = (type) => {
    setField("type", type);
  };

  const addDynamicItem = (field) => {
    setProduct((prev) => ({
      ...prev,
      [field]: [...prev[field], { name: "", price: "" }],
    }));
  };

  const removeDynamicItem = (field, index) => {
    setProduct((prev) => {
      const next = prev[field].filter((_, idx) => idx !== index);
      return { ...prev, [field]: next.length > 0 ? next : [{ name: "", price: "" }] };
    });
  };

  const changeDynamicItem = (field, index, key, value) => {
    setProduct((prev) => {
      const next = [...prev[field]];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, [field]: next };
    });
  };

  const setOptionItems = (field, updater) => {
    setProduct((prev) => ({
      ...prev,
      [field]: typeof updater === "function" ? updater(prev[field]) : updater,
    }));
  };

  const toggleOptionSection = (field, setEnabled, checked) => {
    setEnabled(checked);
    setProduct((prev) => ({
      ...prev,
      [field]: checked ? (prev[field].length > 0 ? prev[field] : [{ name: "", price: "" }]) : [],
    }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const nextErrors = { ...emptyErrors };

    if (!product.name.trim()) nextErrors.name = t("notify.product_name_required");
    if (!product.description.trim()) nextErrors.description = t("notify.description_required");
    if (!isEditMode && !(product.imageUrl && product.imagePublicId)) {
      nextErrors.image = t("notify.upload_product_image");
    }
    if (!product.categoryId) {
      nextErrors.categoryId = t("notify.category_required");
    }

    if (finalPayload.sizes.length === 0) {
      nextErrors.sizes = t("notify.size_required");
    } else if (
      finalPayload.sizes.some((item) => !item.name || !Number.isFinite(item.price))
    ) {
      nextErrors.sizes = t("notify.size_invalid");
    }

    if (enableToppings && hasInvalidPartialRow(product.toppings)) {
      nextErrors.toppings = t("notify.topping_invalid");
    }
    if (enableToppings && !nextErrors.toppings) {
      const duplicates = findDuplicateNames(product.toppings);
      if (duplicates.length > 0) {
        nextErrors.toppings = t("notify.topping_duplicate");
      }
    }

    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const resetCreateForm = () => {
    setProduct({ ...initialProductState, categoryId: fallbackCategoryId });
    setEnableToppings(false);
    setPreviewUrl("");
    setErrors(emptyErrors);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const requestForm = {
        ...product,
        sizes: finalPayload.sizes,
        toppings: finalPayload.toppings,
      };

      const result = isEditMode
        ? await updateProduct(url, editingId, requestForm)
        : await createProduct(url, requestForm);

      if (!result.success) {
        toast.error(result.message || t("notify.submit_failed"));
        return;
      }

      toast.success(
        result.message || (isEditMode ? t("notify.product_updated") : t("notify.product_created"))
      );
      if (!isEditMode) {
        resetCreateForm();
      }
    } catch (error) {
      toast.error(t("notify.network_submit_product"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex-1 bg-amber-50/40 p-4 sm:p-6">
      <div className="w-full">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-stone-800">
            {isEditMode ? t("add.edit_title") : t("add.title")}
          </h1>
          <p className="text-sm text-stone-500">
            {t("add.subtitle")}
          </p>
        </div>

        {isLoadingProduct ? (
          <div className="rounded-2xl border border-amber-200 bg-white p-6 text-sm text-stone-600">
            {t("add.loading_product")}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <ImageUploader
              previewUrl={previewUrl}
              onChange={handleImageChange}
              error={errors.image}
            />

            <div className="form-row">
              <div className="form-group">
                <FormInput
                  label={t("add.product_name")}
                  name="name"
                  value={product.name}
                  onChange={handleBasicChange}
                  placeholder={t("add.product_name_placeholder")}
                  required
                  error={errors.name}
                />
              </div>
              <div className="form-group">
                <CategorySelect
                  categories={categories}
                  value={product.categoryId}
                  loading={categoryLoading}
                  error={errors.categoryId}
                  onSelect={(categoryId) => setField("categoryId", categoryId)}
                />
              </div>
            </div>

            <FormTextarea
              label={t("add.description")}
              name="description"
              value={product.description}
              onChange={handleBasicChange}
              placeholder={t("add.description_placeholder")}
              rows={4}
              required
              error={errors.description}
            />

            <ProductTypeSelector value={product.type} onChange={handleTypeChange} />

            <DynamicPriceList
              title={t("field.sizes")}
              items={product.sizes}
              onAdd={() => addDynamicItem("sizes")}
              onRemove={(index) => removeDynamicItem("sizes", index)}
              onChange={(index, key, value) =>
                changeDynamicItem("sizes", index, key, value)
              }
              minItems={1}
              error={errors.sizes}
            />

            <OptionList
              title={t("add.enable_toppings")}
              enabled={enableToppings}
              onToggle={(checked) => toggleOptionSection("toppings", setEnableToppings, checked)}
              items={product.toppings}
              setItems={(updater) => setOptionItems("toppings", updater)}
              error={errors.toppings}
            />

            {/* Sugar & ice levels are now fixed in frontend for drinks. */}

            <button
              type="submit"
              disabled={isSubmitting || isUploadingImage}
              className={`btn ${submitButtonClass} w-full self-stretch sm:w-auto sm:self-start`}
            >
              {isSubmitting
                ? t("add.submit_loading")
                : isEditMode
                ? t("add.update_product")
                : t("add.create_product")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Add;
