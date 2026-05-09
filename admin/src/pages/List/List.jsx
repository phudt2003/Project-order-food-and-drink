import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { deleteProduct, getProducts, updateProductStatus } from "../../api/productsApi";
import ProductCard from "../../components/products/ProductCard";
import DeleteConfirmModal from "../../components/products/DeleteConfirmModal";
import ProductDetailModal from "../../components/products/ProductDetailModal";
import { t } from "../../i18n";
import { resolveImageSrc } from "../../utils/resolveImage";

function List({ url }) {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const result = await getProducts(url);
      if (!result.success) {
        toast.error(result.message || t("notify.cannot_load_products"));
        return;
      }
      setProducts(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error(t("notify.network_load_products"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!url) return;
    fetchProducts();
  }, [url]);

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      ),
    [products]
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await deleteProduct(url, deleteTarget._id);
      if (!result.success) {
        toast.error(result.message || t("notify.delete_failed"));
        return;
      }
      toast.success(t("notify.product_deleted"));
      setDeleteTarget(null);
      await fetchProducts();
    } catch (error) {
      toast.error(t("notify.network_delete"));
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (product) => {
    if (!product?._id || updatingStatusId) return;
    const nextIsActive = product?.isActive === false;

    setUpdatingStatusId(product._id);
    try {
      const result = await updateProductStatus(url, product._id, nextIsActive);
      if (!result.success) {
        toast.error(result.message || "Không thể cập nhật trạng thái.");
        return;
      }
      setProducts((prev) =>
        prev.map((item) =>
          String(item._id) === String(product._id)
            ? { ...item, isActive: result?.data?.isActive ?? nextIsActive }
            : item
        )
      );
      toast.success(nextIsActive ? "Đã chuyển sang đang bán." : "Đã chuyển sang ngưng bán.");
    } catch (error) {
      toast.error("Không thể cập nhật trạng thái.");
    } finally {
      setUpdatingStatusId("");
    }
  };

  return (
    <div className="w-full flex-1 bg-amber-50/40 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold text-stone-800">{t("list.title")}</h1>
            <p className="text-sm text-stone-500">
              {t("list.subtitle")}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-add self-center sm:self-auto"
            onClick={() => navigate("/add")}
          >
            + {t("list.add_product")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-amber-200 bg-white p-6 text-sm text-stone-600">
            {t("list.loading_products")}
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-white p-8 text-center">
            <p className="text-base font-semibold text-stone-700">{t("list.no_products")}</p>
            <p className="mt-1 text-sm text-stone-500">
              {t("list.no_products_hint")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedProducts.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                imageUrl={resolveImageSrc(product.image, url)}
                onView={() => setDetailTarget(product)}
                onToggleStatus={() => toggleStatus(product)}
                isUpdatingStatus={updatingStatusId === product._id}
                onEdit={() => navigate(`/add?edit=${product._id}`)}
                onDelete={() => setDeleteTarget(product)}
              />
            ))}
          </div>
        )}
      </div>

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        productName={deleteTarget?.name || ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />

      <ProductDetailModal
        open={Boolean(detailTarget)}
        product={detailTarget}
        imageUrl={detailTarget ? resolveImageSrc(detailTarget.image, url) : ""}
        onClose={() => setDetailTarget(null)}
      />
    </div>
  );
}

export default List;
