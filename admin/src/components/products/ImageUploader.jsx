import React from "react";
import { assets } from "../../assets/assets";
import { t } from "../../i18n";

function ImageUploader({ previewUrl, onChange, error }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4">
      <p className="mb-2 text-sm font-medium text-stone-700">{t("field.image")}</p>
      <label
        htmlFor="image"
        className="flex h-40 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/60"
      >
        <img
          src={previewUrl || assets.upload_area}
          alt="preview"
          className="h-full w-full rounded-xl object-contain p-2"
        />
      </label>
      <input
        id="image"
        name="image"
        type="file"
        accept="image/*"
        hidden
        onChange={onChange}
      />
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

export default ImageUploader;
