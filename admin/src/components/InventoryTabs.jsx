import React from "react";

const InventoryTabs = ({ active, onChange }) => {
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ingredients", label: "Nguyên liệu" },
    { key: "import", label: "Nhập kho" },
    { key: "export", label: "Xuất kho" },
    { key: "recipe-product", label: "Công thức sản phẩm" },
    { key: "recipe-topping", label: "Công thức topping" },
    { key: "production-topping", label: "Topping thành phẩm" },
    { key: "history", label: "Lịch sử kho" },
    { key: "analytics", label: "Thống kê" },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex w-max gap-4 pb-1">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`btn btn-tab ${isActive ? "btn-view" : "btn-cancel"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InventoryTabs;
