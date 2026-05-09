import React from "react";

const InventoryForm = ({ mode, values, onChange, onSubmit, onCancel, loading }) => {
  const isEdit = mode === "edit";
  const inputStyle =
    "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";

  const buttonBase =
    "inline-flex h-11 items-center justify-center rounded-lg px-6 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none";
  const saveButtonStyle = `${buttonBase} min-w-[50px] px-7 bg-green-500 text-white hover:bg-green-600`;
  const cancelButtonStyle = `${buttonBase} bg-orange-500 text-white hover:bg-orange-600`;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">
            {isEdit ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}
          </div>
          <div className="text-sm text-stone-500">Quản lý tồn kho nguyên liệu theo đơn vị.</div>
        </div>

        {isEdit ? (
          <button
            type="button"
            className={cancelButtonStyle}
            onClick={onCancel}
          >
            Hủy
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Tên</span>
          <input
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ví dụ: Sữa"
            className={inputStyle}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Đơn vị</span>
          <input
            value={values.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="ml, g, kg..."
            className={inputStyle}
          />
        </label>

        {!isEdit ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Tồn kho ban đầu</span>
            <input
              type="number"
              min="0"
              value={values.stock}
              onChange={(e) => onChange({ stock: e.target.value })}
              className={inputStyle}
            />
          </label>
        ) : (
          <div className="hidden md:block" />
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Mức cảnh báo</span>
          <input
            type="number"
            min="0"
            value={values.minStock}
            onChange={(e) => onChange({ minStock: e.target.value })}
            className={inputStyle}
          />
        </label>
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={loading}
          className={saveButtonStyle}
        >
          {loading ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </form>
  );
};

export default InventoryForm;
