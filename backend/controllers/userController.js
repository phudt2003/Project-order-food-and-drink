import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import validator from "validator";
import addressModel from "../models/addressModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import voucherModel from "../models/voucherModel.js";
import foodModel from "../models/foodModel.js";
import loyaltyTransactionModel from "../models/loyaltyTransactionModel.js";
import loyaltyMissionClaimModel from "../models/loyaltyMissionClaimModel.js";
import { getRankBySpend } from "../utils/loyaltyConfig.js";
import { buildUserVoucherPayloadFromTemplate, findAutoVoucherTemplate } from "../utils/autoVoucherTemplates.js";

const MAX_DELIVERY_DISTANCE_KM = 20;

const parseNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const STORE_LOCATION = {
  lat: parseNumber(process.env.STORE_LAT, 10.0705),
  lng: parseNumber(process.env.STORE_LNG, 105.81236),
};

const toRad = (value) => (value * Math.PI) / 180;

const haversineDistanceKm = (origin, destination) => {
  const lat1 = parseNumber(origin?.lat, NaN);
  const lng1 = parseNumber(origin?.lng, NaN);
  const lat2 = parseNumber(destination?.lat, NaN);
  const lng2 = parseNumber(destination?.lng, NaN);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return NaN;

  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const createToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

const ensureExistingUserForAddress = async (userId) => {
  const user = await userModel.findById(userId).select("_id").lean();
  if (user?._id) return true;

  await addressModel.deleteMany({ userId: String(userId || "") });
  return false;
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User doesn't exist." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const token = createToken(user._id);
    return res.json({ success: true, token });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: "Error" });
  }
};

const registerUser = async (req, res) => {
  const { name, password, email } = req.body;
  try {
    const exists = await userModel.findOne({ email });
    if (exists) {
      return res.json({ success: false, message: "User already exists." });
    }

    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: "Please enter a valid email." });
    }

    if (password.length < 8) {
      return res.json({ success: false, message: "Please enter a strong password." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await new userModel({
      name,
      email,
      password: hashedPassword,
    }).save();

    await ensureReferralCodeForUser(String(user._id));
    await grantWelcomeVoucher(String(user._id), new Date());

    const token = createToken(user._id);
    return res.json({ success: true, token });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: "Error" });
  }
};

const clerkSync = async (req, res) => {
  const { clerkId = "", email = "", name = "" } = req.body || {};

  try {
    const normalizedClerkId = String(clerkId || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(name || "").trim();

    if (!normalizedClerkId || !validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid Clerk profile." });
    }

    let user = await userModel.findOne({
      $or: [{ clerkId: normalizedClerkId }, { email: normalizedEmail }],
    });

    if (!user) {
      const randomPassword = await bcrypt.hash(`${normalizedClerkId}_${Date.now()}`, 10);
      user = await userModel.create({
        name: normalizedName || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        password: randomPassword,
        clerkId: normalizedClerkId,
      });

      await ensureReferralCodeForUser(String(user._id));
      await grantWelcomeVoucher(String(user._id), new Date());
    } else {
      let shouldSave = false;

      if (user.clerkId !== normalizedClerkId) {
        user.clerkId = normalizedClerkId;
        shouldSave = true;
      }

      if (normalizedName && user.name !== normalizedName) {
        user.name = normalizedName;
        shouldSave = true;
      }

      if (shouldSave) {
        await user.save();
      }
    }

    const token = createToken(user._id);
    return res.json({ success: true, token, userId: String(user._id) });
  } catch (error) {
    console.log("CLERK SYNC ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const clerkSyncUser = clerkSync;

const getUserAddresses = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userExists = await ensureExistingUserForAddress(userId);
    if (!userExists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const addresses = await addressModel
      .find({ userId })
      .sort({ is_default: -1, created_at: -1 })
      .lean();

    return res.json({ success: true, addresses });
  } catch (error) {
    console.log("GET USER ADDRESSES ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch addresses." });
  }
};

const addUserAddress = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userExists = await ensureExistingUserForAddress(userId);
    if (!userExists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const {
      name = "",
      phone = "",
      province = "",
      district = "",
      ward = "",
      detailAddress = "",
      lat,
      lng,
      is_default = false,
    } = req.body || {};

    if (!name || !phone || !province || !district || !ward || !detailAddress) {
      return res.status(400).json({ success: false, message: "Missing address fields." });
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return res.status(400).json({ success: false, message: "Invalid coordinates." });
    }

    const distanceKm = haversineDistanceKm(STORE_LOCATION, { lat: parsedLat, lng: parsedLng });
    if (Number.isFinite(distanceKm) && distanceKm > MAX_DELIVERY_DISTANCE_KM) {
      return res
        .status(400)
        .json({ success: false, message: `Địa chỉ nằm ngoài phạm vi giao hàng ${MAX_DELIVERY_DISTANCE_KM}km` });
    }

    const count = await addressModel.countDocuments({ userId });
    const shouldDefault = Boolean(is_default) || count === 0;

    if (shouldDefault) {
      await addressModel.updateMany({ userId }, { $set: { is_default: false } });
    }

    const address = await addressModel.create({
      userId,
      name: String(name).trim(),
      phone: String(phone).trim(),
      province: String(province).trim(),
      district: String(district).trim(),
      ward: String(ward).trim(),
      detail_address: String(detailAddress).trim(),
      lat: parsedLat,
      lng: parsedLng,
      is_default: shouldDefault,
      created_at: new Date(),
    });

    if (shouldDefault) {
      await userModel.findByIdAndUpdate(userId, { phone: String(phone).trim() });
    }

    return res.json({ success: true, address });
  } catch (error) {
    console.log("ADD USER ADDRESS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to save address." });
  }
};

const updateUserAddress = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const addressId = String(req.params?.id || "");
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address id is required." });
    }

    const userExists = await ensureExistingUserForAddress(userId);
    if (!userExists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const {
      name = "",
      phone = "",
      province = "",
      district = "",
      ward = "",
      detailAddress = "",
      lat,
      lng,
    } = req.body || {};

    if (!name || !phone || !province || !district || !ward || !detailAddress) {
      return res.status(400).json({ success: false, message: "Missing address fields." });
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return res.status(400).json({ success: false, message: "Invalid coordinates." });
    }

    const distanceKm = haversineDistanceKm(STORE_LOCATION, { lat: parsedLat, lng: parsedLng });
    if (Number.isFinite(distanceKm) && distanceKm > MAX_DELIVERY_DISTANCE_KM) {
      return res
        .status(400)
        .json({ success: false, message: `Địa chỉ nằm ngoài phạm vi giao hàng ${MAX_DELIVERY_DISTANCE_KM}km` });
    }

    const address = await addressModel.findOneAndUpdate(
      { _id: addressId, userId },
      {
        $set: {
          name: String(name).trim(),
          phone: String(phone).trim(),
          province: String(province).trim(),
          district: String(district).trim(),
          ward: String(ward).trim(),
          detail_address: String(detailAddress).trim(),
          lat: parsedLat,
          lng: parsedLng,
        },
      },
      { new: true }
    );

    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    if (address.is_default) {
      await userModel.findByIdAndUpdate(userId, { phone: String(address.phone || "").trim() });
    }

    return res.json({ success: true, address });
  } catch (error) {
    console.log("UPDATE USER ADDRESS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update address." });
  }
};

const deleteUserAddress = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const addressId = String(req.params?.id || "");
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address id is required." });
    }

    const userExists = await ensureExistingUserForAddress(userId);
    if (!userExists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const address = await addressModel.findOneAndDelete({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    if (address.is_default) {
      const fallback = await addressModel.findOne({ userId }).sort({ created_at: -1 });
      if (fallback) {
        fallback.is_default = true;
        await fallback.save();
        await userModel.findByIdAndUpdate(userId, { phone: String(fallback.phone || "").trim() });
      } else {
        await userModel.findByIdAndUpdate(userId, { phone: "" });
      }
    }

    return res.json({ success: true, message: "Address deleted.", addressId });
  } catch (error) {
    console.log("DELETE USER ADDRESS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to delete address." });
  }
};

export {
  loginUser,
  registerUser,
  clerkSync,
  clerkSyncUser,
  getUserAddresses,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress,
  getMe,
  updateMe,
  saveBirthday,
  dailyCheckin,
  checkBirthdayReward,
  autoSyncVouchers,
  listMyVouchers,
};

const TIMEZONE = String(process.env.BIRTHDAY_TZ || "Asia/Ho_Chi_Minh");

const getDatePartsInTimeZone = (date, timeZone) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(lookup.year),
      month: Number(lookup.month),
      day: Number(lookup.day),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }
};

const getTimePartsInTimeZone = (date, timeZone) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      hour: Number(lookup.hour),
      minute: Number(lookup.minute),
    };
  } catch {
    return {
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
};

const addDays = (date, days) => new Date(date.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);

const addHours = (date, hours) => new Date(date.getTime() + Number(hours || 0) * 60 * 60 * 1000);

const buildKeyYearMonth = (year, month) => year * 100 + month;

const buildKeyYMD = (year, month, day) => year * 10000 + month * 100 + day;

const buildDateKeyInTimeZone = (value, timeZone = TIMEZONE) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = getDatePartsInTimeZone(date, timeZone);
  const key = buildKeyYMD(parts.year, parts.month, parts.day);
  return Number.isFinite(key) ? key : null;
};

const isDateWithinVoucherRange = ({ voucher, now, timeZone = TIMEZONE }) => {
  const currentKey = buildDateKeyInTimeZone(now, timeZone);
  const startKey = buildDateKeyInTimeZone(voucher?.startDate, timeZone);
  const endKey = buildDateKeyInTimeZone(voucher?.endDate, timeZone);
  if (currentKey == null || startKey == null || endKey == null) return false;
  return startKey <= currentKey && currentKey <= endKey;
};

const parseBirthday = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const isToday = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
};

const serializeMeUser = (user) => ({
  _id: String(user?._id || ""),
  name: String(user?.name || ""),
  email: String(user?.email || ""),
  birthday: user?.birthday || null,
  lastBirthdayRewardYear: Number(user?.lastBirthdayRewardYear || 0),
  lastCheckInDate: user?.lastCheckInDate || null,
  coinBalance: Math.max(0, Number(user?.coinBalance || 0)),
  xuBalance: Math.max(0, Number(user?.coinBalance || 0)),
  coins: Math.max(0, Number(user?.coinBalance || 0)),
});

const getMe = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await userModel
      .findById(userId)
      .select("name email birthday lastBirthdayRewardYear lastCheckInDate coinBalance")
      .lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    return res.json({
      success: true,
      user: serializeMeUser(user),
    });
  } catch (error) {
    console.log("GET ME ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const updateMe = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const birthday = parseBirthday(req.body?.birthday);
    if (!birthday) {
      return res.status(400).json({ success: false, message: "Birthday is invalid." });
    }

    const now = new Date();
    if (birthday.getTime() > now.getTime()) {
      return res.status(400).json({ success: false, message: "Birthday cannot be in the future." });
    }

    const user = await userModel.findByIdAndUpdate(
      userId,
      { $set: { birthday } },
      { new: true, runValidators: true }
    ).select("name email birthday lastBirthdayRewardYear lastCheckInDate coinBalance");

    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    return res.json({
      success: true,
      message: "Profile updated.",
      user: serializeMeUser(user),
    });
  } catch (error) {
    console.log("UPDATE ME ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const saveBirthday = async (req, res) => updateMe(req, res);

const dailyCheckin = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const now = new Date();
    const loyaltyTz = String(process.env.LOYALTY_TZ || "Asia/Ho_Chi_Minh");
    const parts = getDatePartsInTimeZone(now, loyaltyTz);
    const todayYmd = buildKeyYMD(parts.year, parts.month, parts.day);

    const user = await userModel
      .findById(userId)
      .select("name email birthday lastBirthdayRewardYear lastCheckInDate coinBalance totalSpend")
      .lean();

    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (!user.birthday) return res.status(400).json({ success: false, message: "Birthday is required to check in." });

    if (isToday(user.lastCheckInDate)) {
      return res.status(400).json({ success: false, message: "Already checked in today." });
    }

    try {
      await loyaltyMissionClaimModel.create({ userId, missionKey: "checkin", ymd: todayYmd, claimedAt: now });
    } catch (error) {
      if (error?.code === 11000) {
        await userModel.updateOne({ _id: userId }, { $set: { lastCheckInDate: now } });
        const updated = await userModel
          .findById(userId)
          .select("name email birthday lastBirthdayRewardYear lastCheckInDate coinBalance")
          .lean();
        return res.status(400).json({
          success: false,
          message: "Already checked in today.",
          user: serializeMeUser(updated),
        });
      }
      throw error;
    }

    const { current } = getRankBySpend(Number(user.totalSpend || 0));
    const rewardCoins = Math.max(0, Number(current?.checkinCoins || 0));

    const updated = await userModel
      .findByIdAndUpdate(
        userId,
        { $inc: { coinBalance: rewardCoins }, $set: { lastCheckInDate: now } },
        { new: true }
      )
      .select("name email birthday lastBirthdayRewardYear lastCheckInDate coinBalance")
      .lean();

    const coinBalance = Math.max(0, Number(updated?.coinBalance || 0));

    await loyaltyTransactionModel.create({
      userId,
      amount: rewardCoins,
      reason: "checkin",
      ymd: todayYmd,
      meta: { rank: String(current?.key || "") },
      balanceAfter: coinBalance,
    });

    return res.json({ success: true, rewardCoins, coinBalance, user: serializeMeUser(updated) });
  } catch (error) {
    console.log("DAILY CHECKIN ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const checkBirthdayReward = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await userModel.findById(userId).select("birthday lastBirthdayRewardYear totalSpend").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (!user.birthday) {
      return res.json({
        success: true,
        needBirthday: true,
        isBirthdayToday: false,
        voucherGranted: false,
        voucher: null,
      });
    }

    const now = new Date();
    const todayParts = getDatePartsInTimeZone(now, TIMEZONE);
    const birthParts = getDatePartsInTimeZone(new Date(user.birthday), TIMEZONE);

    const isBirthdayToday = todayParts.day === birthParts.day && todayParts.month === birthParts.month;
    const currentYear = Number(todayParts.year);

    if (!isBirthdayToday) {
      return res.json({
        success: true,
        needBirthday: false,
        isBirthdayToday: false,
        voucherGranted: false,
        voucher: null,
      });
    }

    const existing = await userVoucherModel
      .findOne({
        userId,
        rewardType: "birthday",
        rewardYear: currentYear,
      })
      .sort({ endDate: -1 })
      .lean();

    if (Number(user.lastBirthdayRewardYear || 0) !== currentYear) {
      await userModel.updateOne({ _id: userId }, { $set: { lastBirthdayRewardYear: currentYear } });
    }

    if (existing) {
      return res.json({
        success: true,
        needBirthday: false,
        isBirthdayToday: true,
        voucherGranted: false,
        voucher: existing,
      });
    }

    const template = await findAutoVoucherTemplate({ issueType: "birthday", now });
    const templatePayload = buildUserVoucherPayloadFromTemplate({
      template,
      userId,
      rewardType: "birthday",
      rewardYear: currentYear,
      now,
      defaultExpireDays: 3,
    });

    const fallbackPayload = {
      userId,
      rewardType: "birthday",
      rewardYear: currentYear,
      voucherCode: "BIRTHDAY30",
      voucherName: "Voucher sinh nhật - Giảm 30.000đ",
      campaignType: "birthday",
      voucherType: "FOOD",
      type: "product",
      discountType: "amount",
      discountValue: 30000,
      startDate: now,
      endDate: addDays(now, 3),
      applyFor: "all",
      minOrderValue: 60000,
      maxUsage: 1,
      usagePerUser: 1,
      status: "active",
    };

    let createdVoucher = null;
    try {
      createdVoucher = await userVoucherModel.create(templatePayload || fallbackPayload);
    } catch (error) {
      if (error?.code === 11000) {
        createdVoucher = await userVoucherModel
          .findOne({ userId, rewardType: "birthday", rewardYear: currentYear })
          .sort({ endDate: -1 });
      } else {
        throw error;
      }
    }

    return res.json({
      success: true,
      needBirthday: false,
      isBirthdayToday: true,
      voucherGranted: true,
      voucher: createdVoucher ? (createdVoucher.toObject ? createdVoucher.toObject() : createdVoucher) : null,
    });
  } catch (error) {
    console.log("CHECK BIRTHDAY REWARD ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const getPaidOrderStats = async (userId) => {
  const query = {
    userId,
    $or: [{ payment: true }, { status: "paid" }],
  };

  const [totalOrders, lastOrder] = await Promise.all([
    orderModel.countDocuments(query),
    orderModel.findOne(query).sort({ paidAt: -1, createdAt: -1 }).select("paidAt createdAt").lean(),
  ]);

  const lastOrderAt = lastOrder?.paidAt || lastOrder?.createdAt || null;
  return {
    totalOrders: Number(totalOrders || 0),
    lastOrderAt: lastOrderAt ? new Date(lastOrderAt) : null,
  };
};

const getFavoriteCategory = async (userId) => {
  const paidQuery = {
    userId,
    $or: [{ payment: true }, { status: "paid" }],
  };

  const orders = await orderModel
    .find(paidQuery)
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(30)
    .select("items")
    .lean();

  if (!orders.length) return null;

  const productCounts = new Map();
  orders.forEach((order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item) => {
      const productId = String(item?.productId || "").trim();
      if (!productId) return;
      const qty = Math.max(1, Math.round(Number(item?.quantity || 1)));
      productCounts.set(productId, (productCounts.get(productId) || 0) + qty);
    });
  });

  const isObjectIdLike = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ""));
  const productIds = [...productCounts.keys()].filter(isObjectIdLike);
  if (!productIds.length) return null;

  const foods = await foodModel.find({ _id: { $in: productIds } }, "_id categoryId category").lean();
  if (!foods.length) return null;

  const categoryCounts = new Map();
  const categoryNames = new Map();

  foods.forEach((food) => {
    const productId = String(food?._id || "");
    const qty = productCounts.get(productId) || 0;
    const categoryId = String(food?.categoryId || "");
    if (!categoryId || qty <= 0) return;
    categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + qty);
    if (!categoryNames.has(categoryId)) {
      categoryNames.set(categoryId, String(food?.category || "").trim());
    }
  });

  let bestCategoryId = "";
  let bestCount = 0;
  categoryCounts.forEach((count, categoryId) => {
    if (count > bestCount) {
      bestCount = count;
      bestCategoryId = categoryId;
    }
  });

  if (!bestCategoryId) return null;
  return {
    categoryId: bestCategoryId,
    categoryName: categoryNames.get(bestCategoryId) || "",
    count: bestCount,
  };
};

async function ensureUserVoucher(payload, options = {}) {
  const renewIfExpired = Boolean(options?.renewIfExpired);
  const now = options?.now instanceof Date ? options.now : new Date(options?.now || Date.now());

  const existed = await userVoucherModel
    .findOne({
      userId: payload.userId,
      rewardType: payload.rewardType,
      rewardYear: payload.rewardYear,
    })
    .lean();

  if (existed) {
    if (renewIfExpired) {
      const endDate = existed?.endDate ? new Date(existed.endDate) : null;
      const isExpired =
        endDate && Number.isFinite(endDate.getTime()) ? now.getTime() > endDate.getTime() : false;

      const usedCount = Number(existed?.usedCount || 0);
      const usedByUsers = Array.isArray(existed?.usedByUsers) ? existed.usedByUsers : [];
      const usedByAnyUser = usedByUsers.some((row) => Number(row?.count || 0) > 0);
      const isUsed = usedCount > 0 || usedByAnyUser;

      if (isExpired && !isUsed) {
        const { userId, rewardType, rewardYear, ...updates } = payload || {};
        await userVoucherModel.updateOne({ _id: existed._id }, { $set: updates });
        const refreshed = await userVoucherModel.findById(existed._id).lean();
        return { voucher: refreshed || existed, created: false, renewed: true };
      }
    }

    return { voucher: existed, created: false, renewed: false };
  }

  try {
    const created = await userVoucherModel.create(payload);
    return { voucher: created?.toObject ? created.toObject() : created, created: true, renewed: false };
  } catch (error) {
    if (error?.code === 11000) {
      const fallback = await userVoucherModel
        .findOne({
          userId: payload.userId,
          rewardType: payload.rewardType,
          rewardYear: payload.rewardYear,
        })
        .lean();
      return { voucher: fallback, created: false, renewed: false };
    }
    throw error;
  }
}

const isUserVoucherAvailable = (voucher, { userId, now = new Date() } = {}) => {
  if (!voucher) return false;

  const current = now instanceof Date ? now : new Date(now || Date.now());
  const currentTime = current.getTime();
  if (!Number.isFinite(currentTime)) return false;

  const status = String(voucher?.status || "active").trim().toLowerCase();
  if (status !== "active") return false;

  const startDate = voucher?.startDate ? new Date(voucher.startDate) : null;
  const endDate = voucher?.endDate ? new Date(voucher.endDate) : null;

  if (startDate && Number.isFinite(startDate.getTime()) && currentTime < startDate.getTime()) return false;
  if (endDate && Number.isFinite(endDate.getTime()) && currentTime > endDate.getTime()) return false;

  const maxUsage = Number(voucher?.maxUsage || 0);
  const usedCount = Number(voucher?.usedCount || 0);
  if (maxUsage > 0 && usedCount >= maxUsage) return false;

  const perUserLimit = Number(voucher?.usagePerUser || 1);
  const usedByUsers = Array.isArray(voucher?.usedByUsers) ? voucher.usedByUsers : [];
  const perUserUsedRow = userId ? usedByUsers.find((row) => String(row?.userId) === String(userId)) : null;
  const perUserUsed = perUserUsedRow ? Number(perUserUsedRow?.count || 0) : usedCount;
  if (perUserLimit > 0 && perUserUsed >= perUserLimit) return false;

  return true;
};

async function grantWelcomeVoucher(userId, now = new Date()) {
  if (!userId) return;

  try {
    const template = await findAutoVoucherTemplate({ issueType: "new_user", now });
    const templatePayload = buildUserVoucherPayloadFromTemplate({
      template,
      userId,
      rewardType: "welcome",
      rewardYear: 0,
      now,
      defaultExpireDays: 7,
    });

    const fallbackPayload = {
      userId,
      rewardType: "welcome",
      rewardYear: 0,
      voucherCode: "WELCOME10",
      voucherName: "Voucher chào mừng - Giảm 10.000đ cho đơn đầu tiên",
      campaignType: "welcome",
      voucherType: "FOOD",
      type: "product",
      discountType: "amount",
      discountValue: 10000,
      startDate: now,
      endDate: addDays(now, 7),
      applyFor: "all",
      minOrderValue: 50000,
      maxUsage: 1,
      usagePerUser: 1,
      status: "active",
    };

    await ensureUserVoucher(templatePayload || fallbackPayload);
  } catch (error) {
    console.log("GRANT WELCOME VOUCHER ERROR:", error.message);
  }
}

const randomReferralCode = (length = 6) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `CB${out}`;
};

async function ensureReferralCodeForUser(userId) {
  if (!userId) return "";

  const existing = await userModel.findById(userId).select("referralCode").lean();
  if (existing?.referralCode) return String(existing.referralCode);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = randomReferralCode(6);
    try {
      await userModel.updateOne({ _id: userId, referralCode: null }, { $set: { referralCode: candidate } });
      const updated = await userModel.findById(userId).select("referralCode").lean();
      if (updated?.referralCode) return String(updated.referralCode);
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  return "";
}

const autoSyncVouchers = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await userModel.findById(userId).select("birthday lastBirthdayRewardYear").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const now = new Date();
    const dateParts = getDatePartsInTimeZone(now, TIMEZONE);
    const timeParts = getTimePartsInTimeZone(now, TIMEZONE);
    const currentYear = Number(dateParts.year);

    const { totalOrders, lastOrderAt } = await getPaidOrderStats(userId);

    const results = {
      welcome: { eligible: totalOrders === 0, voucherGranted: false, voucher: null },
      birthday: { needBirthday: !user.birthday, isBirthdayToday: false, voucherGranted: false, voucher: null },
      comeback: { eligible: false, daysSinceLastOrder: null, voucherGranted: false, voucher: null },
      monthly: { eligible: false, voucherGranted: false, voucher: null, rank: null },
      flash_sale: { active: false, voucher: null },
      personalized: { eligible: false, voucherGranted: false, voucher: null, favoriteCategory: null },
    };

    if (results.welcome.eligible) {
      const rewardYear = 0;
      const template = await findAutoVoucherTemplate({ issueType: "new_user", now });
      const templatePayload = buildUserVoucherPayloadFromTemplate({
        template,
        userId,
        rewardType: "welcome",
        rewardYear,
        now,
        defaultExpireDays: 7,
      });
      const fallbackPayload = {
        userId,
        rewardType: "welcome",
        rewardYear,
        voucherCode: "WELCOME10",
        voucherName: "Voucher chào mừng - Giảm 10.000đ cho đơn đầu tiên",
        campaignType: "welcome",
        voucherType: "FOOD",
        type: "product",
        discountType: "amount",
        discountValue: 10000,
        startDate: now,
        endDate: addDays(now, 7),
        applyFor: "all",
        minOrderValue: 50000,
        maxUsage: 1,
        usagePerUser: 1,
        status: "active",
      };
      const { voucher, created } = await ensureUserVoucher(templatePayload || fallbackPayload, { renewIfExpired: true, now });
      results.welcome.voucher = voucher;
      results.welcome.voucherGranted = Boolean(created);
      results.welcome.eligible = Boolean(voucher && isUserVoucherAvailable(voucher, { userId, now }));
    }

    if (!user.birthday) {
      results.birthday.needBirthday = true;
    } else {
      const birthParts = getDatePartsInTimeZone(new Date(user.birthday), TIMEZONE);
      const isBirthdayToday = dateParts.day === birthParts.day && dateParts.month === birthParts.month;
      results.birthday.isBirthdayToday = isBirthdayToday;

      if (isBirthdayToday) {
        const rewardYear = currentYear;
        const existing = await userVoucherModel
          .findOne({ userId, rewardType: "birthday", rewardYear })
          .sort({ endDate: -1 })
          .lean();

        if (Number(user.lastBirthdayRewardYear || 0) !== currentYear) {
          await userModel.updateOne({ _id: userId }, { $set: { lastBirthdayRewardYear: currentYear } });
        }

        if (existing) {
          results.birthday.voucher = existing;
        } else {
          const template = await findAutoVoucherTemplate({ issueType: "birthday", now });
          const templatePayload = buildUserVoucherPayloadFromTemplate({
            template,
            userId,
            rewardType: "birthday",
            rewardYear,
            now,
            defaultExpireDays: 3,
          });
          const fallbackPayload = {
            userId,
            rewardType: "birthday",
            rewardYear,
            voucherCode: "BIRTHDAY30",
            voucherName: "Voucher sinh nhật - Giảm 30.000đ",
            campaignType: "birthday",
            voucherType: "FOOD",
            type: "product",
            discountType: "amount",
            discountValue: 30000,
            startDate: now,
            endDate: addDays(now, 3),
            applyFor: "all",
            minOrderValue: 60000,
            maxUsage: 1,
            usagePerUser: 1,
            status: "active",
          };
          const { voucher, created } = await ensureUserVoucher(templatePayload || fallbackPayload);
          results.birthday.voucher = voucher;
          results.birthday.voucherGranted = Boolean(created);
        }
      }
    }

    if (totalOrders > 0 && lastOrderAt) {
      const daysSinceLastOrder = Math.floor((now.getTime() - lastOrderAt.getTime()) / (24 * 60 * 60 * 1000));
      results.comeback.daysSinceLastOrder = daysSinceLastOrder;

      const comebackTemplate = await findAutoVoucherTemplate({ issueType: "comeback", now });
      const comebackThreshold = Math.max(1, Number(comebackTemplate?.comebackAfterDays || 14));
      results.comeback.eligible = daysSinceLastOrder >= comebackThreshold;

      if (results.comeback.eligible) {
        const rewardYear = buildKeyYearMonth(currentYear, dateParts.month);
        const templatePayload = buildUserVoucherPayloadFromTemplate({
          template: comebackTemplate,
          userId,
          rewardType: "comeback",
          rewardYear,
          now,
          defaultExpireDays: 5,
        });
        const fallbackPayload = {
          userId,
          rewardType: "comeback",
          rewardYear,
          voucherCode: "COMEBACK20",
          voucherName: "Voucher quay lại - Giảm 20.000đ",
          campaignType: "comeback",
          voucherType: "FOOD",
          type: "product",
          discountType: "amount",
          discountValue: 20000,
          startDate: now,
          endDate: addDays(now, 5),
          applyFor: "all",
          minOrderValue: 60000,
          maxUsage: 1,
          usagePerUser: 1,
          status: "active",
        };
        const { voucher, created } = await ensureUserVoucher(templatePayload || fallbackPayload);
        results.comeback.voucher = voucher;
        results.comeback.voucherGranted = Boolean(created);
      }
    }

    const spend = Number(user?.totalSpend || 0);
    const { current } = getRankBySpend(spend);
    results.monthly.rank = current?.key || null;
    if (current?.monthlyVoucher) {
      results.monthly.eligible = true;

      const rewardYear = buildKeyYearMonth(currentYear, dateParts.month);
      const fallbackExpireDays = Number(current.monthlyVoucher.expireDays || 7);
      const template = await findAutoVoucherTemplate({ issueType: "monthly_rank", targetRank: current.key, now });
      const templatePayload = buildUserVoucherPayloadFromTemplate({
        template,
        userId,
        rewardType: "monthly",
        rewardYear,
        now,
        defaultExpireDays: fallbackExpireDays,
      });
      const fallbackPayload = {
        userId,
        rewardType: "monthly",
        rewardYear,
        voucherCode: current.monthlyVoucher.code,
        voucherName: `Voucher thang - Giam ${Number(current.monthlyVoucher.discountValue || 0).toLocaleString("vi-VN")}d`,
        campaignType: "monthly",
        voucherType: "FOOD",
        type: "product",
        discountType: "amount",
        discountValue: Number(current.monthlyVoucher.discountValue || 0),
        startDate: now,
        endDate: addDays(now, fallbackExpireDays),
        applyFor: "all",
        minOrderValue: Number(current.monthlyVoucher.minOrderValue || 0),
        maxUsage: 1,
        usagePerUser: 1,
        status: "active",
      };
      const { voucher, created } = await ensureUserVoucher(templatePayload || fallbackPayload, { renewIfExpired: true, now });
      results.monthly.voucher = voucher;
      results.monthly.voucherGranted = Boolean(created);
    }

    const flashVoucherCandidates = await voucherModel
      .find({
        status: "active",
        campaignType: "happy_hour",
      })
      .sort({ discountValue: -1, createdAt: -1 })
      .lean();
    const flashVoucher = flashVoucherCandidates.find((voucher) =>
      isDateWithinVoucherRange({ voucher, now, timeZone: TIMEZONE })
    );

    if (flashVoucher) {
      results.flash_sale.active = true;
      results.flash_sale.voucher = flashVoucher;
    }

    if (totalOrders > 0) {
      const favorite = await getFavoriteCategory(userId);
      if (favorite?.categoryId) {
        results.personalized.eligible = true;
        results.personalized.favoriteCategory = favorite;

        const rewardYear = buildKeyYearMonth(currentYear, dateParts.month);
        const rawName = String(favorite.categoryName || "").trim().toLowerCase();
        const voucherCode = rawName.includes("trà sữa") || rawName.includes("tra sua") || rawName.includes("milk tea")
          ? "MILKTEA20"
          : "FAVORITE20";

        const { voucher, created } = await ensureUserVoucher({
          userId,
          rewardType: "order_value",
          rewardYear,
          voucherCode,
          voucherName: favorite.categoryName
            ? `Voucher dành riêng cho bạn - Giảm 20% ${favorite.categoryName}`
            : "Voucher dành riêng cho bạn - Giảm 20%",
          campaignType: "order_value",
          voucherType: "FOOD",
          type: "product",
          discountType: "percent",
          discountValue: 20,
          startDate: now,
          endDate: addDays(now, 5),
          applyFor: "category",
          categoryId: favorite.categoryId,
          productIds: [],
          minOrderValue: 0,
          maxUsage: 1,
          usagePerUser: 1,
          status: "active",
        });

        results.personalized.voucher = voucher;
        results.personalized.voucherGranted = Boolean(created);
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    console.log("AUTO SYNC VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const listMyVouchers = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const vouchers = await userVoucherModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: vouchers });
  } catch (error) {
    console.log("LIST MY VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Error" });
  }
};
