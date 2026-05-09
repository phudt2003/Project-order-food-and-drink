import React from "react";

function FormTextarea({
  label,
  name,
  value,
  onChange,
  placeholder,
  rows = 4,
  required = false,
  error,
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <textarea
        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        required={required}
      />
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </label>
  );
}

export default FormTextarea;
