import http from "./http";

export const buildProductPayload = (form) => {
  const payload = {
    name: String(form.name || "").trim(),
    description: String(form.description || "").trim(),
    categoryId: form.categoryId || "",
    type: form.type || "Drink",
    sizes: Array.isArray(form.sizes) ? form.sizes : [],
    toppings: Array.isArray(form.toppings) ? form.toppings : [],
  };

  const imageUrl = String(form.imageUrl || "").trim();
  const imagePublicId = String(form.imagePublicId || "").trim();
  if (imageUrl && imagePublicId) {
    payload.imageUrl = imageUrl;
    payload.imagePublicId = imagePublicId;
  }

  return payload;
};

export const getProducts = async (url) => {
  const response = await http.get(`${url}/api/product/list`);
  return response.data;
};

export const getProductById = async (url, id) => {
  const response = await http.get(`${url}/api/product/${id}`);
  return response.data;
};

export const createProduct = async (url, form) => {
  const payload = buildProductPayload(form);
  const response = await http.post(`${url}/api/product/add`, payload);
  return response.data;
};

export const updateProduct = async (url, id, form) => {
  const payload = buildProductPayload(form);
  const response = await http.put(`${url}/api/product/update/${id}`, payload);
  return response.data;
};

export const deleteProduct = async (url, id) => {
  const response = await http.post(`${url}/api/product/remove`, { id });
  return response.data;
};

export const updateProductStatus = async (url, id, isActive) => {
  const response = await http.patch(`${url}/api/product/status/${id}`, { isActive });
  return response.data;
};

