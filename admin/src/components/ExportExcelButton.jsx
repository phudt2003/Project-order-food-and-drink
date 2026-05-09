import React, { useState } from "react";
import { toast } from "react-toastify";
import { exportJsonToExcel } from "../utils/exportExcel";

const ExportExcelButton = ({ data, fileName, sheetName, columns, label = "Xuất Excel", disabled }) => {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (disabled) return;
    setLoading(true);
    try {
      await exportJsonToExcel({ data, fileName, sheetName, columns });
      toast.success("Đã xuất Excel.");
    } catch (error) {
      toast.error(error?.message || "Không thể xuất Excel.");
    } finally {
      setLoading(false);
    }
  };

  const buttonStyle =
    "inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-600 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={buttonStyle}
    >
      {loading ? "Đang xuất..." : label}
    </button>
  );
};

export default ExportExcelButton;
