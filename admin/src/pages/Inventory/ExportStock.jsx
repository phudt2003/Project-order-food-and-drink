import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { exportSmart, listIngredients, listToppings, listFoods } from "../../api/inventoryApi";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ExportStock = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [itemType, setItemType] = useState("nguyen_lieu"); // nguyen_lieu | thanh_pham | san_pham
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("hu_hong"); // hu_hong | do_vo | khac
  const [note, setNote] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [toppings, setToppings] = useState([]);
  const [products, setProducts] = useState([]);

  const inputStyle =
    "h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-800 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400";
  const buttonBase = "btn inline-flex h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold";
  const submitButtonStyle = `${buttonBase} btn-confirm`;

  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [ingredients]
  );
  const toppingOptions = useMemo(
    () => [...toppings].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [toppings]
  );
  const productOptions = useMemo(
    () => [...products].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [products]
  );

  const loadLists = async () => {
    if (!url) return;
    try {
      const [ingRes, topRes, foodRes] = await Promise.all([listIngredients(url), listToppings(url), listFoods(url)]);
      if (!ingRes?.success) throw new Error(ingRes?.message || "Khong tai duoc nguyen lieu");
      if (!topRes?.success) throw new Error(topRes?.message || "Khong tai duoc thanh pham");
      if (!foodRes?.success) throw new Error(foodRes?.message || "Khong tai duoc san pham");
      setIngredients(Array.isArray(ingRes.data) ? ingRes.data : []);
      setToppings(Array.isArray(topRes.data) ? topRes.data : []);
      setProducts(Array.isArray(foodRes.data) ? foodRes.data : []);
    } catch (error) {
      toast.error(error?.message || "Khong tai duoc du lieu");
      setIngredients([]);
      setToppings([]);
      setProducts([]);
    }
  };

  useEffect(() => {
    loadLists();
  }, [url]);

  useEffect(() => {
    setItemId("");
  }, [itemType]);

  const handleSubmit = async () => {
    if (!url) return;

    if (!itemId) return toast.error("Chon item truoc khi xuat kho.");

    const qty = toNumber(quantity, Number.NaN);
    if (!Number.isFinite(qty) || qty <= 0) {
      return toast.error("So luong phai lon hon 0.");
    }

    if (itemType === "nguyen_lieu") {
      const selected = ingredientOptions.find((x) => String(x?._id || "") === String(itemId));
      const stock = toNumber(selected?.stock, 0);
      if (selected && qty > stock) {
        return toast.error(`Vuot ton kho nguyen lieu (${stock}).`);
      }
    }

    if (itemType === "thanh_pham") {
      const selected = toppingOptions.find((x) => String(x?._id || "") === String(itemId));
      const stock = toNumber(selected?.stock, 0);
      if (selected && qty > stock) {
        return toast.error(`Vuot ton kho thanh pham (${stock}).`);
      }
    }

    setLoading(true);
    try {
      const payload = {
        itemType,
        itemId,
        quantity: qty,
        reason,
        note,
      };
      const result = await exportSmart(url, payload);
      if (!result?.success) throw new Error(result?.message || "Xuất kho thất bại");
      toast.success("Xuất kho thành công");
      setItemId("");
      setQuantity("");
      setNote("");
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Xuất kho thất bại");
    } finally {
      setLoading(false);
    }
  };

  const optionsByType = useMemo(() => {
    if (itemType === "thanh_pham") return toppingOptions;
    if (itemType === "san_pham") return productOptions;
    return ingredientOptions;
  }, [itemType, ingredientOptions, toppingOptions, productOptions]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">Xuat kho thong minh</div>
          <div className="text-sm text-stone-500">Hu hong / do vo / dieu chinh.</div>
        </div>
        <button type="button" className={submitButtonStyle} onClick={handleSubmit} disabled={loading}>
          {loading ? "Dang xu ly..." : "Xác nhận xuất kho"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-600">Loai</label>
          <select value={itemType} onChange={(e) => setItemType(e.target.value)} className={inputStyle}>
            <option value="nguyen_lieu">Nguyen lieu</option>
            <option value="thanh_pham">Thanh pham (topping, flan...)</option>
            <option value="san_pham">San pham (ly hoan chinh)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-600">Chon item</label>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputStyle}>
            <option value="">-- Chon --</option>
            {optionsByType.map((item) => (
              <option key={String(item._id)} value={String(item._id)}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-600">So luong</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputStyle}
            placeholder="Nhap so luong"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-600">Ly do</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputStyle}>
            <option value="hu_hong">Hu hong</option>
            <option value="do_vo">Do vo</option>
            <option value="khac">Khac</option>
          </select>
        </div>

        <div className="md:col-span-2 space-y-2">
          <label className="text-xs font-semibold text-stone-600">Ghi chu</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputStyle} min-h-[80px]`}
            placeholder="Mo ta them (tuy chon)"
          />
        </div>
      </div>

      <div className="text-xs text-stone-500 leading-relaxed">
        - Hu hong thanh pham: tru truc tiep stock thanh pham. <br />
        - Do vo thanh pham: khong tru thanh pham, tru nguyen lieu theo cong thuc thanh pham. <br />
        - San pham bi do: khong tru thanh pham, tru nguyen lieu (va topping) theo cong thuc san pham. <br />
        - Xuat nguyen lieu: tru truc tiep. <br />
        - He thong chan tru am ton kho va ghi log lich su.
      </div>
    </div>
  );
};

export default ExportStock;
