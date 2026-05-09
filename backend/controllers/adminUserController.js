import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import addressModel from "../models/addressModel.js";

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Admin search user (customer) theo name/phone/email, limit 20.
// Lưu ý: user schema hiện tại có thể không có `phone`, nên field này có thể rỗng.
export const searchUsers = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const limitRaw = Math.floor(Number(req.query?.limit || 20));
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;
    const digits = q.replace(/\D/g, "");

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const or = [{ name: rx }, { email: rx }, { phone: rx }];
      if (digits.length >= 3) {
        const phonePattern = digits.split("").join("\\D*");
        or.push({ phone: new RegExp(phonePattern) });
        const addressUsers = await addressModel
          .find({ phone: new RegExp(phonePattern), is_default: true })
          .select("user_id")
          .lean();
        const addressUserIds = addressUsers
          .map((a) => String(a?.user_id || ""))
          .filter(Boolean);
        if (addressUserIds.length > 0) {
          or.push({ _id: { $in: addressUserIds } });
        }
      }
      filter.$or = or;
    }

    const users = await userModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .select("name phone email")
      .lean();

    let merged = Array.isArray(users) ? [...users] : [];
    const existingIds = new Set(merged.map((u) => String(u?._id || "")));

    if (digits.length >= 3 && merged.length < limit) {
      const phonePattern = digits.split("").join("\\D*");
      const orderUsers = await orderModel
        .find({ phone: new RegExp(phonePattern) })
        .sort({ _id: -1 })
        .limit(limit)
        .select("userId")
        .lean();
      const extraIds = orderUsers
        .map((o) => String(o?.userId || ""))
        .filter((id) => id && !existingIds.has(id));

      if (extraIds.length > 0) {
        const addressUsers = await addressModel
          .find({ user_id: { $in: extraIds }, is_default: true })
          .select("user_id")
          .lean();
        const addressUserIds = new Set(addressUsers.map((a) => String(a?.user_id || "")));
        const filteredExtraIds = extraIds.filter((id) => !addressUserIds.has(id));

        if (filteredExtraIds.length > 0) {
          const extras = await userModel
            .find({ _id: { $in: filteredExtraIds } })
            .select("name phone email")
            .lean();
          merged = [...merged, ...(extras || [])].slice(0, limit);
        }
      }
    }

    return res.json({
      success: true,
      data: (Array.isArray(merged) ? merged : []).map((u) => ({
        _id: String(u?._id || ""),
        name: String(u?.name || ""),
        phone: String(u?.phone || ""),
        email: String(u?.email || ""),
      })),
    });
  } catch (error) {
    console.log("ADMIN SEARCH USERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tìm khách hàng" });
  }
};
