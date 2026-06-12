import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { FaStar } from "react-icons/fa";
import { StoreContext } from "../../context/StoreContext";
import ProductInfo from "../../components/ProductDetail/ProductInfo";
import OptionGroup from "../../components/ProductDetail/OptionGroup";
import QuantitySelector from "../../components/ProductDetail/QuantitySelector";
import ToppingQuantityGroup from "../../components/ProductDetail/ToppingQuantityGroup";
import SugarLevelPicker from "../../components/SugarLevelPicker/SugarLevelPicker";
import { formatVND } from "../../utils/currency";
import "./ProductDetail.css";

const GROUP_KEYS = {
  size: "size",
};

const slugify = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const mapOptions = (options, prefix, fallbackLabel) => {
  if (!Array.isArray(options)) return [];

  return options.map((item, index) => ({
    id: String(item?._id || item?.id || slugify(item?.name) || `${prefix}-${index}`),
    name: String(item?.name || `${fallbackLabel} ${index + 1}`),
    price: Number(item?.price || 0),
  }));
};

const clampRating = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.round(numeric)));
};

const normalizeReviews = (reviews) => {
  if (!Array.isArray(reviews)) return [];

  return reviews.map((review, index) => {
    const rating = clampRating(
      review?.rating ?? review?.stars ?? review?.score ?? review?.point ?? 0
    );

    const avatarUrl = String(
      review?.userAvatar ||
        review?.avatar ||
        review?.avatarUrl ||
        review?.user?.avatar ||
        review?.user?.image ||
        review?.user?.imageUrl ||
        ""
    ).trim();

    return {
      id: String(review?._id || review?.id || `review-${index}`),
      name: String(
        review?.name ||
          review?.userName ||
          review?.user?.name ||
          review?.customerName ||
          "Khách hàng"
      ),
      avatarUrl,
      rating,
      date: review?.createdAt || review?.date || review?.created || review?.updatedAt || "",
      comment: String(review?.comment || review?.content || review?.message || "").trim(),
      adminReply: String(review?.adminReply || review?.reply || "").trim(),
    };
  });
};

const formatReviewDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN");
};

const getInitials = (name) => {
  const parts = String(name || "")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const ReviewAvatar = ({ avatarUrl, name }) => {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(avatarUrl) && !broken;

  return (
    <div className="review-avatar">
      {showImage ? (
        <img
          src={avatarUrl}
          alt={`Ảnh của ${name}`}
          className="review-avatar-img"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="review-avatar-initials">{getInitials(name)}</span>
      )}
    </div>
  );
};

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { food_list, url, addToCart, reviewsRefreshKey } = useContext(StoreContext);

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [selectedToppings, setSelectedToppings] = useState({});
  const [sugarLevel, setSugarLevel] = useState(50);
  const [sugarQuickSelected, setSugarQuickSelected] = useState(50);
  const [iceLevel, setIceLevel] = useState("Bình thường");
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({ averageRating: 0, reviewCount: 0 });
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [toppingInventory, setToppingInventory] = useState([]);
  const [toppingNotice, setToppingNotice] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchProduct = async () => {
      setIsLoading(true);

      try {
        const response = await axios.get(`${url}/api/product/${id}`);
        if (isMounted && response?.data?.success) {
          setProduct(response.data.data || null);
          return;
        }
      } catch (error) {
        console.error("Fetch product detail error:", error);
      }

      if (isMounted) {
        const fallback = food_list.find((item) => item._id === id) || null;
        setProduct(fallback);
      }
    };

    fetchProduct().finally(() => {
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [id, url, food_list]);

  useEffect(() => {
    let isMounted = true;
    if (!url) return undefined;

    const loadToppingStock = async () => {
      try {
        const response = await axios.get(`${url}/api/toppings`);
        const list = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (isMounted) setToppingInventory(list);
      } catch {
        if (isMounted) setToppingInventory([]);
      }
    };

    loadToppingStock();

    return () => {
      isMounted = false;
    };
  }, [url]);

  const sizes = useMemo(() => mapOptions(product?.sizes, "size", "Cỡ"), [product?.sizes]);
  const toppings = useMemo(
    () => mapOptions(product?.toppings, "topping", "Topping"),
    [product?.toppings]
  );

  const isDrink = useMemo(() => {
    const type = String(product?.type || "").trim().toLowerCase();
    if (!type) return false;
    return type === "drink" || type === "do_uong" || type.includes("đồ uống") || type.includes("do uong");
  }, [product?.type]);

  const optionGroups = useMemo(() => {
    const groups = [];

    if (sizes.length > 0) {
      groups.push({ key: GROUP_KEYS.size, name: "Kích cỡ", type: "single", items: sizes });
    }

    return groups;
  }, [sizes]);

  useEffect(() => {
    let isMounted = true;

    const fetchReviews = async () => {
      if (!id) {
        setReviews([]);
        setReviewStats({ averageRating: 0, reviewCount: 0 });
        return;
      }

      setIsLoadingReviews(true);

      try {
        const response = await axios.get(`${url}/api/reviews/${id}`);
        if (isMounted && response?.data?.success) {
          const normalized = normalizeReviews(response.data.data || []);
          setReviews(normalized);
          setReviewStats({
            averageRating: Number(response.data.averageRating || 0),
            reviewCount: Number(response.data.reviewCount || normalized.length || 0),
          });
          return;
        }
      } catch (error) {
        console.error("Fetch reviews error:", error);
      }

      if (isMounted) {
        setReviews([]);
        setReviewStats({ averageRating: 0, reviewCount: 0 });
      }
    };

    fetchReviews().finally(() => {
      if (isMounted) setIsLoadingReviews(false);
    });

    return () => {
      isMounted = false;
    };
  }, [id, url, reviewsRefreshKey]);

  const averageRating = useMemo(() => {
    if (Number.isFinite(reviewStats.averageRating) && reviewStats.averageRating > 0) {
      return reviewStats.averageRating;
    }
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return Math.round((total / reviews.length) * 10) / 10;
  }, [reviewStats.averageRating, reviews]);

  const reviewCount = useMemo(() => {
    if (Number.isFinite(reviewStats.reviewCount) && reviewStats.reviewCount > 0) {
      return reviewStats.reviewCount;
    }
    return reviews.length;
  }, [reviewStats.reviewCount, reviews.length]);

  useEffect(() => {
    if (!product?._id) return;

    const defaults = {};
    optionGroups.forEach((group) => {
      defaults[group.key] = group.type === "single" ? group.items[0]?.id || "" : [];
    });

    setSelectedOptions(defaults);
    setSelectedToppings({});
    setSugarLevel(100);
    setSugarQuickSelected(100);
    setIceLevel("Bình thường");
    setQuantity(1);
    setToppingNotice("");
  }, [product?._id, optionGroups]);

  const selectedSize = useMemo(
    () => sizes.find((item) => item.id === selectedOptions[GROUP_KEYS.size]) || null,
    [sizes, selectedOptions]
  );

  const toppingsById = useMemo(() => {
    const map = new Map();
    toppings.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [toppings]);

  const toppingStockByName = useMemo(() => {
    const map = new Map();
    (Array.isArray(toppingInventory) ? toppingInventory : []).forEach((t) => {
      const key = normalizeName(t?.name);
      if (!key) return;
      const stock = Number(t?.stock ?? NaN);
      if (Number.isFinite(stock)) map.set(key, stock);
    });
    return map;
  }, [toppingInventory]);

  const toppingMaxById = useMemo(() => {
    const result = {};
    toppings.forEach((item) => {
      const key = normalizeName(item?.name);
      const stock = toppingStockByName.get(key);
      if (!Number.isFinite(stock)) return;
      result[item.id] = Math.max(0, Math.floor(stock));
    });
    return result;
  }, [toppings, toppingStockByName]);

  const getToppingStock = (toppingId) => {
    const topping = toppingsById.get(toppingId);
    if (!topping) return null;
    const stock = toppingStockByName.get(normalizeName(topping.name));
    return Number.isFinite(stock) ? stock : null;
  };

  const increaseTopping = (toppingId) => {
    setSelectedToppings((prev) => {
      const current = Number(prev?.[toppingId]) || 0;
      const next = current + 1;
      const stock = getToppingStock(toppingId);
      if (Number.isFinite(stock) && next > stock) {
        const name = toppingsById.get(toppingId)?.name || "Topping";
        setToppingNotice(`${name} chỉ còn ${stock}. Vui lòng giảm số lượng.`);
        return prev;
      }
      setToppingNotice("");
      return { ...prev, [toppingId]: next };
    });
  };

  const decreaseTopping = (toppingId) => {
    setSelectedToppings((prev) => {
      const currentQuantity = Number(prev?.[toppingId]) || 0;
      if (currentQuantity <= 1) {
        const { [toppingId]: _removed, ...rest } = prev;
        setToppingNotice("");
        return rest;
      }
      setToppingNotice("");
      return { ...prev, [toppingId]: currentQuantity - 1 };
    });
  };

  const toppingSelections = useMemo(() => {
    return Object.entries(selectedToppings)
      .map(([toppingId, rawQuantity]) => {
        const quantity = Number(rawQuantity) || 0;
        const topping = toppingsById.get(toppingId);
        if (!topping || quantity <= 0) return null;
        return {
          toppingId,
          quantity,
          name: topping.name,
          price: Number(topping.price || 0),
        };
      })
      .filter(Boolean);
  }, [selectedToppings, toppingsById]);

  const toppingsTotal = useMemo(
    () => toppingSelections.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [toppingSelections]
  );

  const basePrice = Number(product?.basePrice || 0);
  const productPrice = Number(product?.price || 0);
  const sizePrice = Number(selectedSize?.price || 0);
  const baseAndSizePrice =
    basePrice > 0 ? basePrice + sizePrice : selectedSize ? sizePrice : productPrice;

  const unitPrice = baseAndSizePrice + toppingsTotal;
  const totalPrice = baseAndSizePrice * quantity + toppingsTotal;
  const cartUnitPrice = quantity > 0 ? totalPrice / quantity : unitPrice;

  const handleOptionChange = (groupKey, itemId, type) => {
    setSelectedOptions((prev) => {
      if (type === "single") {
        return { ...prev, [groupKey]: itemId };
      }

      const current = Array.isArray(prev[groupKey]) ? prev[groupKey] : [];
      const exists = current.includes(itemId);

      return {
        ...prev,
        [groupKey]: exists
          ? current.filter((idItem) => idItem !== itemId)
          : [...current, itemId],
      };
    });
  };

  const handleAddToCart = async () => {
    if (!product) return;

    const added = await addToCart({
      productId: product._id,
      itemId: product._id,
      name: product.name,
      size: selectedSize?.name || "",
      sugarLevel: isDrink ? `${sugarLevel}%` : "",
      iceLevel: isDrink ? iceLevel : "",
      toppings: toppingSelections.map(({ toppingId, quantity, name }) => ({
        toppingId,
        quantity,
        name,
      })),
      quantity,
      price: cartUnitPrice,
    });

    if (added !== false) navigate("/cart");
  };

  const handleBuyNow = async () => {
    if (!product) return;

    const buyNowItem = {
      productId: product._id,
      name: product.name,
      image: product.image,
      type: product.type || "",
      size: selectedSize?.name || "",
      sugarLevel: isDrink ? `${sugarLevel}%` : "",
      iceLevel: isDrink ? iceLevel : "",
      toppings: toppingSelections.map(({ toppingId, quantity, name }) => ({
        toppingId,
        quantity,
        name,
      })),
      quantity,
      price: cartUnitPrice,
    };

    localStorage.removeItem("selectedCartLineKeys");
    localStorage.removeItem("checkoutItems");
    localStorage.setItem("buy_now_item", JSON.stringify([buyNowItem]));

    navigate("/checkout");
  };

  if (isLoading) {
    return <p className="product-detail-status">Đang tải sản phẩm...</p>;
  }

  if (!product) {
    return <p className="product-detail-status">Không tìm thấy sản phẩm.</p>;
  }

  return (
    <div className="product-detail-wrapper">
      <div className="product-detail-page">
        <ProductInfo product={product} url={url} />

        <div className="product-options-panel">
          {optionGroups.map((group) => {
            const groupKey = group.key;
            const currentValue =
              selectedOptions[groupKey] ?? (group.type === "single" ? "" : []);

            return (
              <OptionGroup
                key={groupKey}
                group={group}
                groupKey={groupKey}
                value={currentValue}
                onChange={handleOptionChange}
              />
            );
          })}

          {isDrink ? (
            <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-800">Mức đường</h3>
                <span className="text-xs font-medium text-slate-600">{sugarLevel}%</span>
              </div>

              <SugarLevelPicker
                className="mt-3"
                value={sugarQuickSelected ?? sugarLevel}
                onChange={(value) => {
                  setSugarLevel(value);
                  setSugarQuickSelected(value);
                }}
              />

            </section>
          ) : null}

          {isDrink ? (
            <section className="mt-2 rounded-2xl border border-slate-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800">Mức đá</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {["Không đá", "Ít đá", "Bình thường", "Nhiều đá"].map((label) => {
                  const isActive = iceLevel === label;
                  return (
                    <button
                      key={`ice-${label}`}
                      type="button"
                      onClick={() => setIceLevel(label)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        isActive
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {toppings.length > 0 ? (
            <>
              <ToppingQuantityGroup
                title="Topping"
                items={toppings}
                value={selectedToppings}
                maxById={toppingMaxById}
                onIncrease={increaseTopping}
                onDecrease={decreaseTopping}
              />
              {toppingNotice ? (
                <p className="mt-2 text-xs font-semibold text-rose-600">{toppingNotice}</p>
              ) : null}
            </>
          ) : null}

          <QuantitySelector
            quantity={quantity}
            onDecrease={() => {
              setToppingNotice("");
              setQuantity((prev) => Math.max(1, prev - 1));
            }}
            onIncrease={() => {
              setToppingNotice("");
              setQuantity((prev) => prev + 1);
            }}
          />

          <section className="total-price-box">
            <p>Tổng cộng</p>
            <strong>{formatVND(totalPrice)}</strong>
          </section>

          <div className="button-group">
            <button className="add-to-cart-btn add-cart" type="button" onClick={handleAddToCart}>
              Thêm vào giỏ
            </button>
            <button className="buy-now-btn buy-now" type="button" onClick={handleBuyNow}>
              Mua ngay
            </button>
          </div>
        </div>
      </div>

      <section className="product-reviews">
        <div className="review-header">
          <div className="review-title">
            <h2>Đánh giá khách hàng</h2>
            <p>Những phản hồi mới nhất từ khách đã mua sản phẩm</p>
          </div>
          <div className="review-score">
            <div className="review-score-value">{averageRating.toFixed(1)}</div>
            <div className="review-score-stars" aria-label="Đánh giá trung bình">
              {Array.from({ length: 5 }).map((_, index) => (
                <FaStar
                  key={`avg-${index}`}
                  size={16}
                  className={`review-star ${
                    index < Math.round(averageRating) ? "filled" : "empty"
                  }`}
                />
              ))}
            </div>
            <p className="review-score-count">{reviewCount} đánh giá</p>
          </div>
        </div>

        {isLoadingReviews ? (
          <div className="review-empty">Đang tải đánh giá...</div>
        ) : reviews.length === 0 ? (
          <div className="review-empty">Chưa có đánh giá cho sản phẩm này.</div>
        ) : (
          <div className="review-list">
            {reviews.map((review) => (
              <article key={review.id} className="review-card">
                <ReviewAvatar avatarUrl={review.avatarUrl} name={review.name} />
                <div className="review-content">
                  <div className="review-meta">
                    <div>
                      <p className="review-name">{review.name}</p>
                      <span className="review-date">{formatReviewDate(review.date)}</span>
                    </div>
                    <div className="review-stars" aria-label={`Đánh giá ${review.rating} sao`}>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <FaStar
                          key={`${review.id}-${index}`}
                          size={14}
                          className={`review-star ${
                            index < review.rating ? "filled" : "empty"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="review-comment">
                    {review.comment || "Khách hàng chưa để lại nhận xét chi tiết."}
                  </p>

                  {review.adminReply ? (
                    <div className="review-admin-reply" aria-label="Phản hồi từ quản trị viên">
                      <p className="review-admin-reply-title">Phản hồi Admin</p>
                      <p className="review-admin-reply-content">{review.adminReply}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default ProductDetail;

