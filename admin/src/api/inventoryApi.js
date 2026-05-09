import http from "./http";

export const listIngredients = async (url, params = {}) => {
  const response = await http.get(`${url}/api/ingredients`, { params });
  return response?.data || { success: false, data: [] };
};

export const createIngredient = async (url, payload) => {
  const response = await http.post(`${url}/api/ingredients`, payload);
  return response?.data || { success: false, message: "Failed to create ingredient." };
};

export const updateIngredient = async (url, id, payload) => {
  const response = await http.put(`${url}/api/ingredients/${id}`, payload);
  return response?.data || { success: false, message: "Failed to update ingredient." };
};

export const deleteIngredient = async (url, id) => {
  const response = await http.delete(`${url}/api/ingredients/${id}`);
  return response?.data || { success: false, message: "Failed to delete ingredient." };
};

export const listRecipes = async (url, params = {}) => {
  const response = await http.get(`${url}/api/product-recipes`, { params });
  return response?.data || { success: false, data: [] };
};

export const getRecipe = async (url, productId) => {
  const response = await http.get(`${url}/api/product-recipes/${productId}`);
  return response?.data || { success: false, data: null };
};

export const saveRecipe = async (url, productId, ingredients) => {
  const normalized = (Array.isArray(ingredients) ? ingredients : [])
    .map((row) => ({
      ingredient_id: row?.ingredient_id || row?.ingredientId || "",
      quantity: row?.quantity,
      isSweetener: Boolean(row?.isSweetener),
    }))
    .filter((row) => String(row.ingredient_id || "").trim() && Number(row.quantity) > 0);
  const response = await http.post(`${url}/api/product-recipes`, {
    product_id: productId,
    ingredients: normalized,
    toppings: [],
  });
  return response?.data || { success: false, message: "Failed to save recipe." };
};

export const deleteRecipe = async (url, productId) => {
  const response = await http.delete(`${url}/api/product-recipes/${productId}`);
  return response?.data || { success: false, message: "Failed to delete recipe." };
};

// ===== Topping recipes =====
export const listToppings = async (url, params = {}) => {
  const response = await http.get(`${url}/api/toppings`, { params });
  return response?.data || { success: false, data: [] };
};

export const getTopping = async (url, id) => {
  const response = await http.get(`${url}/api/toppings/${id}`);
  return response?.data || { success: false, data: null };
};

export const saveToppingRecipe = async (url, id, ingredients) => {
  const normalized = (Array.isArray(ingredients) ? ingredients : [])
    .map((row) => ({
      ingredient_id: row?.ingredient_id || row?.ingredientId || "",
      quantity: row?.quantity,
      unit: row?.unit,
      note: row?.note,
    }))
    .filter((row) => String(row.ingredient_id || "").trim() && Number(row.quantity) > 0);
  const response = await http.post(`${url}/api/topping-recipes`, {
    topping_id: id,
    ingredients: normalized,
  });
  return response?.data || { success: false, message: "Failed to save topping recipe." };
};

export const deleteToppingRecipe = async (url, id) => {
  const response = await http.delete(`${url}/api/topping-recipes/${id}`);
  return response?.data || { success: false, message: "Failed to delete topping recipe." };
};

// v2 recipe endpoints
export const getProductRecipeV2 = async (url, productId) => {
  const response = await http.get(`${url}/api/product-recipes/${productId}`);
  return response?.data || { success: false, data: null };
};

export const saveProductRecipeV2 = async (url, payload) => {
  const response = await http.post(`${url}/api/product-recipes`, payload);
  return response?.data || { success: false, message: "Failed to save product recipe." };
};

export const deleteProductRecipeV2 = async (url, productId) => {
  const response = await http.delete(`${url}/api/product-recipes/${productId}`);
  return response?.data || { success: false, message: "Failed to delete product recipe." };
};

export const getToppingRecipeV2 = async (url, toppingId) => {
  const response = await http.get(`${url}/api/topping-recipes/${toppingId}`);
  return response?.data || { success: false, data: null };
};

export const saveToppingRecipeV2 = async (url, payload) => {
  const response = await http.post(`${url}/api/topping-recipes`, payload);
  return response?.data || { success: false, message: "Failed to save topping recipe." };
};

export const deleteToppingRecipeV2 = async (url, toppingId) => {
  const response = await http.delete(`${url}/api/topping-recipes/${toppingId}`);
  return response?.data || { success: false, message: "Failed to delete topping recipe." };
};

export const importStock = async (url, payload) => {
  const response = await http.post(`${url}/api/inventory/import`, payload);
  return response?.data || { success: false, message: "Failed to import stock." };
};

export const exportStock = async (url, payload) => {
  const response = await http.post(`${url}/api/inventory/export`, payload);
  return response?.data || { success: false, message: "Failed to export stock." };
};

export const exportSmart = async (url, payload) => {
  const response = await http.post(`${url}/api/inventory/export-smart`, payload);
  return response?.data || { success: false, message: "Failed to export stock." };
};

export const listInventoryLogs = async (url, params = {}) => {
  const response = await http.get(`${url}/api/inventory/logs`, { params });
  return response?.data || { success: false, data: [], pagination: { total: 0, page: 1, limit: 50 } };
};

export const getInventoryDashboard = async (url) => {
  const response = await http.get(`${url}/api/inventory/dashboard`);
  return response?.data || { success: false, data: null };
};

export const getLowStock = async (url) => {
  const response = await http.get(`${url}/api/inventory/low-stock`);
  return response?.data || { success: false, data: [] };
};

export const getTopUsedIngredients = async (url, params = {}) => {
  const response = await http.get(`${url}/api/inventory/top-used`, { params });
  return response?.data || { success: false, data: [] };
};

export const getStockByDay = async (url, params = {}) => {
  const response = await http.get(`${url}/api/inventory/stock-by-day`, { params });
  return response?.data || { success: false, data: null };
};

export const listFoods = async (url, params = {}) => {
  const response = await http.get(`${url}/api/product/list`, { params });
  const data = response?.data?.data;
  return response?.data?.success === false
    ? response.data
    : { success: true, data: Array.isArray(data) ? data : [] };
};

