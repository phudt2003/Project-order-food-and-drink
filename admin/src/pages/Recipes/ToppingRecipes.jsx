import React from "react";
import { useSearchParams } from "react-router-dom";
import Recipes from "../Inventory/Recipes";

const ToppingRecipes = ({ url }) => {
  const [searchParams] = useSearchParams();
  const target = String(searchParams.get("target") || "").trim();

  return (
    <Recipes
      url={url}
      initialTarget={target}
      mode="topping"
    />
  );
};

export default ToppingRecipes;
