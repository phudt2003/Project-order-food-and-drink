import categoryModel from "../models/categoryModel.js";
import foodModel from "../models/foodModel.js";
import { uploadImageDataUrl, deleteByPublicId } from "../services/cloudinaryService.js";
import { claimMediaAsUsed, createTemporaryMedia, deleteMediaRecord } from "../services/mediaService.js";

const UNCATEGORIZED_NAME = "Uncategorized";
const UNCATEGORIZED_SLUG = "uncategorized";

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const actorFromRequest = (req) => ({
  userId: req.userId || null,
  adminUsername: req.admin?.username || "admin",
});

export const ensureUncategorizedCategory = async () => {
  let category = await categoryModel.findOne({ slug: UNCATEGORIZED_SLUG });
  if (category) return category;

  try {
    category = await categoryModel.create({
      name: UNCATEGORIZED_NAME,
      slug: UNCATEGORIZED_SLUG,
      description: "Fallback category for products without an assigned category",
      isSystem: true,
    });
    return category;
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await categoryModel.findOne({ slug: UNCATEGORIZED_SLUG });
      if (existing) return existing;
    }
    throw error;
  }
};

const listCategory = async (req, res) => {
  try {
    const uncategorized = await ensureUncategorizedCategory();
    const categories = await categoryModel.find({}).sort({ name: 1 });

    res.json({
      success: true,
      data: categories,
      fallbackCategoryId: uncategorized._id,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const createCategory = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.json({ success: false, message: "Category name is required" });
    }

    const slug = slugify(name);
    if (!slug) {
      return res.json({ success: false, message: "Invalid category name" });
    }

    const existedBySlug = await categoryModel.findOne({ slug });
    if (existedBySlug) {
      return res.json({ success: true, message: "Category already exists", data: existedBySlug });
    }

    let imageUrl = String(req.body.imageUrl || "").trim();
    let imagePublicId = String(req.body.imagePublicId || "").trim();

    const legacyImage = String(req.body.image || "").trim();
    if ((!imageUrl || !imagePublicId) && /^data:image\//i.test(legacyImage)) {
      const uploaded = await uploadImageDataUrl({
        dataUrl: legacyImage,
        filename: `category_${slug}`,
        tags: ["category"],
      });
      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
      await createTemporaryMedia({ cloudinaryResult: uploaded, actor: actorFromRequest(req) }).catch(() => {});
    }

    const category = await categoryModel.create({
      name,
      slug,
      image: imageUrl || legacyImage,
      imagePublicId: imagePublicId || "",
      description: String(req.body.description || "").trim(),
      isSystem: false,
    });

    if (category.imagePublicId && /^https?:\/\//i.test(category.image)) {
      await claimMediaAsUsed({
        publicId: category.imagePublicId,
        url: category.image,
        actor: actorFromRequest(req),
        linkedTo: { model: "category", id: category._id, field: "image" },
      });
    }
    res.json({ success: true, message: "Category created", data: category });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const category = await categoryModel.findById(req.params.id);
    if (!category) {
      return res.json({ success: false, message: "Category not found" });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const category = await categoryModel.findById(req.params.id);
    if (!category) {
      return res.json({ success: false, message: "Category not found" });
    }

    const nextName = String(req.body.name || "").trim();
    if (!nextName) {
      return res.json({ success: false, message: "Category name is required" });
    }

    const nextSlug = slugify(nextName);
    const duplicated = await categoryModel.findOne({
      slug: nextSlug,
      _id: { $ne: category._id },
    });
    if (duplicated) {
      return res.json({ success: false, message: "Category name already exists" });
    }

    category.name = nextName;
    category.slug = nextSlug;
    category.description = String(req.body.description || "").trim();

    const hasImageUrlFields =
      Object.prototype.hasOwnProperty.call(req.body, "imageUrl") ||
      Object.prototype.hasOwnProperty.call(req.body, "imagePublicId");
    const hasLegacyImageField = Object.prototype.hasOwnProperty.call(req.body, "image");

    if (hasImageUrlFields || hasLegacyImageField) {
      let nextImageUrl = String(req.body.imageUrl || "").trim();
      let nextImagePublicId = String(req.body.imagePublicId || "").trim();
      const legacyImage = String(req.body.image || "").trim();

      if ((nextImageUrl || nextImagePublicId) && (!nextImageUrl || !nextImagePublicId)) {
        return res.status(400).json({ success: false, message: "imageUrl and imagePublicId are required together" });
      }

      if ((!nextImageUrl || !nextImagePublicId) && /^data:image\//i.test(legacyImage)) {
        const uploaded = await uploadImageDataUrl({
          dataUrl: legacyImage,
          filename: `category_${nextSlug}`,
          tags: ["category"],
        });
        nextImageUrl = uploaded.secure_url;
        nextImagePublicId = uploaded.public_id;
        await createTemporaryMedia({ cloudinaryResult: uploaded, actor: actorFromRequest(req) }).catch(() => {});
      }

      const isNewImage = Boolean(nextImageUrl && nextImagePublicId);
      if (isNewImage) {
        const prevPublicId = String(category.imagePublicId || "").trim();
        category.image = nextImageUrl;
        category.imagePublicId = nextImagePublicId;

        if (prevPublicId && prevPublicId !== nextImagePublicId) {
          await deleteByPublicId({ publicId: prevPublicId, resourceType: "image" }).catch(() => {});
          await deleteMediaRecord(prevPublicId).catch(() => {});
        }

        await claimMediaAsUsed({
          publicId: nextImagePublicId,
          url: nextImageUrl,
          actor: actorFromRequest(req),
          linkedTo: { model: "category", id: category._id, field: "image" },
        });
      } else {
        // Allow clearing or setting a custom string (not tracked in Cloudinary)
        category.image = legacyImage;
        category.imagePublicId = "";
      }
    }

    await category.save();
    res.json({ success: true, message: "Category updated", data: category });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const category = await categoryModel.findById(req.params.id);
    if (!category) {
      return res.json({ success: false, message: "Category not found" });
    }

    if (category.slug === UNCATEGORIZED_SLUG || category.isSystem) {
      return res.json({ success: false, message: "Cannot delete system category" });
    }

    const childProductCount = await foodModel.countDocuments({ categoryId: category._id });
    if (childProductCount > 0) {
      return res.json({
        success: false,
        message: `Không thể xóa danh mục vì còn ${childProductCount} sản phẩm thuộc danh mục này.`,
      });
    }

    await categoryModel.findByIdAndDelete(category._id);

    if (category.imagePublicId) {
      await deleteByPublicId({ publicId: category.imagePublicId, resourceType: "image" }).catch(() => {});
      await deleteMediaRecord(category.imagePublicId).catch(() => {});
    }
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

export { listCategory, createCategory, getCategoryById, updateCategory, deleteCategory };
