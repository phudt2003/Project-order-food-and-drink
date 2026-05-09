import http from "./http";

export const getVouchers = async (url, params = {}) => {
  try {
    const response = await http.get(`${url}/api/voucher`, { params });
    return { success: Boolean(response?.data?.success), data: response?.data?.data || [] };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to fetch vouchers." };
  }
};

export const getAutoVouchers = async (url, params = {}) => {
  try {
    const response = await http.get(`${url}/api/voucher/auto`, { params });
    return {
      success: Boolean(response?.data?.success),
      data: response?.data?.data || [],
      pagination: response?.data?.pagination || null,
    };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to fetch auto vouchers." };
  }
};

export const checkVoucherCode = async (url, code, excludeId = "") => {
  try {
    const response = await http.get(`${url}/api/voucher/check`, {
      params: { code, excludeId },
    });
    return response?.data || { success: false, available: false };
  } catch (error) {
    return {
      success: false,
      available: false,
      message: error?.response?.data?.message || "Failed to check voucher code.",
    };
  }
};

export const createVoucher = async (url, payload) => {
  try {
    const response = await http.post(`${url}/api/voucher`, payload);
    return response?.data || { success: false, message: "Failed to create voucher." };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to create voucher." };
  }
};

export const updateVoucher = async (url, id, payload) => {
  try {
    const response = await http.put(`${url}/api/voucher/${id}`, payload);
    return response?.data || { success: false, message: "Failed to update voucher." };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to update voucher." };
  }
};

export const deleteVoucher = async (url, id) => {
  try {
    const response = await http.delete(`${url}/api/voucher/${id}`);
    return response?.data || { success: false, message: "Failed to delete voucher." };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to delete voucher." };
  }
};

export const updateVoucherStatus = async (url, id, status) => {
  try {
    const response = await http.patch(`${url}/api/voucher/${id}/status`, { status });
    return response?.data || { success: false, message: "Failed to update voucher status." };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to update voucher status." };
  }
};

export const updateAutoVoucher = async (url, payload) => {
  try {
    const response = await http.patch(`${url}/api/voucher/auto`, payload);
    return response?.data || { success: false, message: "Failed to update auto vouchers." };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to update auto vouchers." };
  }
};

export const deleteAutoVoucher = async (url, payload) => {
  try {
    const response = await http.delete(`${url}/api/voucher/auto`, { data: payload });
    return response?.data || { success: false, message: "Failed to delete auto vouchers." };
  } catch (error) {
    return { success: false, message: error?.response?.data?.message || "Failed to delete auto vouchers." };
  }
};
