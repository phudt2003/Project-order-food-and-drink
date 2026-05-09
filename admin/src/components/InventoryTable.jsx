import React from "react";

const InventoryTable = ({ columns = [], rows = [], rowKey, compact = false }) => {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className={`${compact ? "min-w-full" : "min-w-[900px]"} w-full text-sm`}>
          <thead className="bg-gray-50 text-gray-700">
          <tr className="divide-x divide-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  compact ? "px-4 py-3 text-left font-semibold whitespace-nowrap" : "px-6 py-4 text-left font-semibold whitespace-nowrap",
                  col.headerClassName || "",
                ].join(" ")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
          <tbody className="text-gray-900">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-3 text-center text-stone-500">
                Không có dữ liệu
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={rowKey ? rowKey(row, idx) : idx}
                className="divide-x divide-gray-200 border-t border-gray-200 transition-colors duration-200 hover:bg-gray-50"
              >
                {columns.map((col) => (
                  <td key={col.key} className={[(compact ? "px-4 py-3" : "px-6 py-4"), col.cellClassName || ""].join(" ")}>
                    {typeof col.render === "function" ? col.render(row, idx) : row?.[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryTable;
