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
    <div className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg bg-[var(--card-bg)] shadow-[0_0_10px_#00000015] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(46,26,12,0.14)]">
      {/* IMAGE */}
      <div className="relative">
        <Link to={`/product/${id}`} className="block aspect-[4/3] w-full overflow-hidden bg-[#ece6dc]">
          <img
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
            src={imageSrc}
            alt={name}
          />
        </Link>

      </div>

      {/* INFO */}
      <div className="flex flex-1 min-w-0 flex-col p-3 sm:p-4">
        <div className="mb-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <Link to={`/product/${id}`} className="block min-w-0 flex-1 text-[var(--text-primary)] no-underline transition-colors hover:text-[var(--accent)]">
            <p className="line-clamp-2 min-h-[2.5em] break-words text-sm font-semibold leading-tight text-[var(--text-primary)] transition-colors sm:text-base">{name}</p>
          </Link>
          <span className="ratingstars" role="img" aria-label={`Đánh giá ${rating} sao`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <FaStar key={`${id}-star-${index}`} className={index < rating ? "is-filled" : "is-empty"} />
            ))}
          </span>
        </div>

        <p className="line-clamp-2 min-h-[3em] text-xs leading-6 text-[var(--text-secondary)] transition-colors">{description}</p>
        <p className="mt-auto pt-2 text-base font-bold text-[var(--accent)] transition-colors sm:text-lg">{formatVND(price)}</p>

      </div>
    </div>
  );
}

export default React.memo(FoodItem);

