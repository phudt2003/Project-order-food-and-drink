import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import InventoryTabs from "../../components/InventoryTabs";
import Ingredients from "./Ingredients";
import InventoryHistory from "./InventoryHistory";
import InventoryAnalytics from "./InventoryAnalytics";
import InventoryDashboard from "./InventoryDashboard";
import RecipeProduct from "./RecipeProduct";
import RecipeTopping from "./RecipeTopping";
import ProductionTopping from "./ProductionTopping";
import ImportStock from "./ImportStock";
import ExportStock from "./ExportStock";

const InventoryModule = ({ url }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromQuery = useMemo(() => String(searchParams.get("tab") || "").trim(), [searchParams]);

  const allowedTabs = useMemo(
    () =>
      new Set([
        "dashboard",
        "ingredients",
        "import",
        "export",
        "recipe-product",
        "recipe-topping",
        "production-topping",
        "history",
        "analytics",
      ]),
    []
  );

  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    if (!tabFromQuery) return;
    if (!allowedTabs.has(tabFromQuery)) return;
    setTab(tabFromQuery);
  }, [allowedTabs, tabFromQuery]);

  const handleChangeTab = (nextTab) => {
    setTab(nextTab);
    const current = Object.fromEntries(searchParams.entries());
    setSearchParams({ ...current, tab: nextTab });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Quản lý kho</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Trung tâm quản lý nguyên liệu • công thức • sản xuất • lịch sử • thống kê
          </p>
        </div>
      </div>

      <InventoryTabs active={tab} onChange={handleChangeTab} />

      {tab === "dashboard" ? <InventoryDashboard url={url} /> : null}
      {tab === "ingredients" ? <Ingredients url={url} /> : null}
      {tab === "import" ? <ImportStock url={url} /> : null}
      {tab === "export" ? <ExportStock url={url} /> : null}
      {tab === "recipe-product" ? <RecipeProduct url={url} /> : null}
      {tab === "recipe-topping" ? <RecipeTopping url={url} /> : null}
      {tab === "production-topping" ? <ProductionTopping url={url} /> : null}
      {tab === "history" ? <InventoryHistory url={url} /> : null}
      {tab === "analytics" ? <InventoryAnalytics url={url} /> : null}
    </div>
  );
};

export default InventoryModule;
