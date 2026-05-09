import React from "react";
import { useSearchParams } from "react-router-dom";
import Recipes from "../Inventory/Recipes";

const ProductRecipes = ({ url }) => {
  const [searchParams] = useSearchParams();
  const productId = String(searchParams.get("productId") || "").trim();

  return (
    <Recipes
      url={url}
      initialProductId={productId}
      mode="product"
    />
  );
};

export default ProductRecipes;
