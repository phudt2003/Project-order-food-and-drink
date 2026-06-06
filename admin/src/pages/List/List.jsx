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
    <div className="w-full flex-1 bg-transparent p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-stone-200/80 bg-white/90 p-5 shadow-sm shadow-stone-200/70 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Products</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{t("list.title")}</h1>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              {t("list.subtitle")}
            </p>
          </div>
          <button
            type="button"
            className="self-center rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/10 transition-all hover:-translate-y-0.5 hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-200 sm:self-auto"
            onClick={() => navigate("/add")}
          >
            + {t("list.add_product")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm shadow-stone-200/70">
            <p className="text-sm font-semibold text-stone-600">{t("list.loading_products")}</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-stone-200 p-4">
                  <div className="h-36 animate-pulse rounded-2xl bg-stone-100" />
                  <div className="mt-4 h-4 w-2/3 animate-pulse rounded-full bg-stone-100" />
                  <div className="mt-3 h-4 w-1/2 animate-pulse rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center shadow-sm shadow-stone-200/70">
            <p className="text-lg font-bold text-stone-800">{t("list.no_products")}</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
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
