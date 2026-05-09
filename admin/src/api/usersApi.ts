import http from "./http";

export type CustomerUser = {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
};

// Tìm khách hàng (admin) theo name/phone/email
export const searchCustomerUsers = async (url: string, q: string) => {
  try {
    const response = await http.get(`${url}/api/admin/users/search`, {
      params: { q: String(q || "").trim(), role: "customer", limit: 20 },
    });
    return {
      success: Boolean(response?.data?.success),
      data: (response?.data?.data || []) as CustomerUser[],
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || "Failed to search users.",
      data: [] as CustomerUser[],
    };
  }
};

