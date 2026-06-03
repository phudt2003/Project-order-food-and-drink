/* eslint-disable no-unused-vars */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./FoodItem.css";
import { formatVND } from "../../utils/currency";
import { FaStar } from "react-icons/fa";
import axios from "axios";
import { resolveImageSrc } from "../../utils/resolveImage";

function FoodItem({ id, name, price, description, image, url, onAdd }) {
  const imageSrc = resolveImageSrc(image, url);
  const [rating, setRating] = useState(5);

  useEffect(() => {
    console.log("FoodItem render =", { id, name, imageSrc });
  }, [id, name, imageSrc]);

  useEffect(() => {
    let isActive = true;

    const fetchRating = async () => {
      try {
        const response = await axios.get(`${url}/api/reviews/${id}`);
        const averageRating = Number(response?.data?.averageRating || 0);
        const reviewCount = Number(response?.data?.reviewCount || 0);
        const nextRating = reviewCount > 0 && Number.isFinite(averageRating)
          ? Math.min(5, Math.max(1, Math.round(averageRating)))
          : 5;
        if (isActive) setRating(nextRating);
      } catch (error) {
        if (isActive) setRating(5);
      }
    };

    if (id && url) fetchRating();

    return () => {
      isActive = false;
    };
  }, [id, url]);

  return (
    <div className="food-item">
      {/* IMAGE */}
      <div className="food-item-img-container">
        <Link to={`/product/${id}`} className="food-item-image-link">
          <img
            className="food-item-image"
            src={imageSrc}
            alt={name}
          />
        </Link>

      </div>

      {/* INFO */}
      <div className="food-item-info">
        <div className="food-item-name-rating">
          <Link to={`/product/${id}`} className="food-item-name-link">
            <p className="namewe">{name}</p>
          </Link>
          <span className="ratingstars" aria-label={`Đánh giá ${rating} sao`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <FaStar key={`${id}-star-${index}`} className={index < rating ? "is-filled" : "is-empty"} />
            ))}
          </span>
        </div>

        <p className="food-item-desc">{description}</p>
        <p className="food-item-price">{formatVND(price)}</p>

      </div>
    </div>
  );
}

export default React.memo(FoodItem);

