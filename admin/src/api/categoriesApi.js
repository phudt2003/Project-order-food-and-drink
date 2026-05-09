import http from "./http";

export const getCategories = async (url) => {
  const response = await http.get(`${url}/api/category/list`);
  return response.data;
};

export const getCategoryById = async (url, id) => {
  const response = await http.get(`${url}/api/category/${id}`);
  return response.data;
};

export const createCategory = async (url, payload) => {
  const response = await http.post(`${url}/api/category/add`, payload);
  return response.data;
};

export const updateCategory = async (url, id, payload) => {
  const response = await http.put(`${url}/api/category/update/${id}`, payload);
  return response.data;
};

export const deleteCategory = async (url, id) => {
  const response = await http.delete(`${url}/api/category/${id}`);
  return response.data;
};
