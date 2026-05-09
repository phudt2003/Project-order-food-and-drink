import http from "./http";

export const listToppingInventory = async (url, params) => {
  const response = await http.get(`${url}/api/topping-inventory`, { params });
  return response?.data || { success: false, message: "Failed to load topping inventory." };
};

export const createToppingInventory = async (url, payload) => {
  const response = await http.post(`${url}/api/topping-inventory`, payload);
  return response?.data || { success: false, message: "Failed to create topping." };
};

export const updateToppingInventory = async (url, id, payload) => {
  const response = await http.patch(`${url}/api/topping-inventory/${id}`, payload);
  return response?.data || { success: false, message: "Failed to update topping." };
};

export const previewToppingProduction = async (url, payload) => {
  const response = await http.post(`${url}/api/topping-inventory/preview`, payload);
  return response?.data || { success: false, message: "Failed to preview production." };
};

export const produceTopping = async (url, payload) => {
  const response = await http.post(`${url}/api/topping-inventory/produce`, payload);
  return response?.data || { success: false, message: "Failed to produce topping." };
};

export const getToppingDashboard = async (url) => {
  const response = await http.get(`${url}/api/topping-inventory/dashboard`);
  return response?.data || { success: false, message: "Failed to load topping dashboard." };
};

