import React from "react";

function FormSelect({ label, name, value, onChange, options, error }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <select
        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        name={name}
        value={value}
        onChange={onChange}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </label>
  );
}

export default FormSelect;
