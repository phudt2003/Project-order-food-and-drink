import React, { useState } from "react";
import DashboardTab from "./tabs/DashboardTab";
import IngredientsTab from "./tabs/IngredientsTab";
import StockMoveTab from "./tabs/StockMoveTab";
import HistoryTab from "./tabs/HistoryTab";
import AnalyticsTab from "./tabs/AnalyticsTab";

const TABS = [
  { key: "dashboard", label: "Dashboard kho" },
  { key: "ingredients", label: "Nguyen lieu" },
  { key: "import", label: "Nhap kho" },
  { key: "export", label: "Xuat kho" },
  { key: "history", label: "Lich su kho" },
  { key: "analytics", label: "Thong ke" },
];

const InventoryPage = ({ url }) => {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Quan ly kho nguyen lieu</h1>
        <p className="text-sm text-stone-600">
          Ingredients ? Import/Export ? Logs ? Analytics
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`btn btn-tab ${activeTab === tab.key ? "btn-view" : "btn-cancel"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" ? <DashboardTab url={url} /> : null}
      {activeTab === "ingredients" ? <IngredientsTab url={url} /> : null}
      {activeTab === "import" ? <StockMoveTab url={url} kind="import" /> : null}
      {activeTab === "export" ? <StockMoveTab url={url} kind="export" /> : null}
      {activeTab === "history" ? <HistoryTab url={url} /> : null}
      {activeTab === "analytics" ? <AnalyticsTab url={url} /> : null}
    </div>
  );
};

export default InventoryPage;
