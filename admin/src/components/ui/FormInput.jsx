import React from "react";

const baseClassName =
  "w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

function FormInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  step,
  required = false,
  error,
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <input
        className={baseClassName}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        step={step}
        required={required}
      />
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </label>
  );
}

export default FormInput;
