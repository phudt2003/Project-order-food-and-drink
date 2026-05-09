import React, { createContext, useContext, useMemo, useState } from "react";
import {
  createCategory as createCategoryApi,
  deleteCategory as deleteCategoryApi,
  getCategories,
  updateCategory as updateCategoryApi,
} from "../api/categoriesApi";

const CategoryStoreContext = createContext(null);

export function CategoryStoreProvider({ children, apiUrl }) {
  const [categories, setCategories] = useState([]);
  const [fallbackCategoryId, setFallbackCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const getCategoryList = async ({ force = false } = {}) => {
    if (!force && initialized && categories.length > 0) return categories;

    setLoading(true);
    try {
      const result = await getCategories(apiUrl);
      if (!result.success) {
        setInitialized(true);
        return [];
      }

      const list = Array.isArray(result.data) ? result.data : [];
      setCategories(list);
      setFallbackCategoryId(result.fallbackCategoryId || list[0]?._id || "");
      setInitialized(true);
      return list;
    } catch (error) {
      setInitialized(true);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async (payload) => {
    try {
      const result = await createCategoryApi(apiUrl, payload);
      if (!result.success || !result.data) return result;

      setCategories((prev) => {
        const existed = prev.some((item) => item._id === result.data._id);
        return existed ? prev : [...prev, result.data];
      });
      return result;
    } catch (error) {
      return { success: false, message: "Không thể tạo danh mục. Backend không khả dụng." };
    }
  };

  const updateCategory = async (id, payload) => {
    try {
      const result = await updateCategoryApi(apiUrl, id, payload);
      if (!result.success || !result.data) return result;

      setCategories((prev) =>
        prev.map((item) => (item._id === id ? { ...item, ...result.data } : item))
      );
      return result;
    } catch (error) {
      return {
        success: false,
        message:
          error?.response?.data?.message ||
          error?.message ||
          "Không thể cập nhật danh mục. Backend không khả dụng.",
      };
    }
  };

  const deleteCategory = async (id) => {
    try {
      const result = await deleteCategoryApi(apiUrl, id);
      if (!result.success) return result;
      setCategories((prev) => prev.filter((item) => item._id !== id));
      return result;
    } catch (error) {
      return { success: false, message: "Không thể xóa danh mục. Backend không khả dụng." };
    }
  };

  const getCategoryById = (id) => categories.find((item) => item._id === id);

  const contextValue = useMemo(
    () => ({
      categories,
      fallbackCategoryId,
      loading,
      apiUrl,
      getCategories: getCategoryList,
      getCategoryById,
      addCategory,
      updateCategory,
      deleteCategory,
    }),
    [categories, fallbackCategoryId, loading, initialized, apiUrl]
  );

  return (
    <CategoryStoreContext.Provider value={contextValue}>
      {children}
    </CategoryStoreContext.Provider>
  );
}

export const useCategoryStore = () => {
  const context = useContext(CategoryStoreContext);
  if (!context) {
    throw new Error("useCategoryStore must be used within CategoryStoreProvider");
  }
  return context;
};

