import React from "react";

import InvoiceBill from "./InvoiceBill";
import { formatToppings, normalizeToppingsKey } from "../utils/formatToppings";

const LINE_WIDTH = 32;

const formatMoney = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat("vi-VN").format(number);
};

const formatDate = (value) => {
  if (!value) return "--";

  const d = new Date(value);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${h}:${m}`;
};

const removeVietnamese = (str = "") => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const normalizeText = (value) => String(value ?? "").trim();

const buildItemKey = (item) => {
  const toppingsKey = normalizeToppingsKey(item?.toppings ?? item?.topping);
  return [
    normalizeText(item?.name).toLowerCase(),
    normalizeText(item?.size).toLowerCase(),
    toppingsKey,
    normalizeText(item?.sugarLevel).toLowerCase(),
    normalizeText(item?.iceLevel).toLowerCase(),
    normalizeText(item?.note).toLowerCase()
  ].join("|");
};

const mergeItems = (items) => {
  if (!Array.isArray(items)) return [];

  const merged = new Map();

  items.forEach((item) => {
    const key = buildItemKey(item);
    const quantity = Number(item?.quantity || 0);
    const unitPrice = Number(item?.price || 0);
    const totalPrice = unitPrice * quantity;

    if (merged.has(key)) {
      const current = merged.get(key);
      current.quantity += quantity;
      current.totalPrice += totalPrice;
      merged.set(key, current);
      return;
    }

    merged.set(key, {
      ...item,
      quantity,
      totalPrice,
      toppingText: formatToppings(item?.toppings ?? item?.topping)
    });
  });

  return Array.from(merged.values());
};

const wrapTextByWidth = (text, width) => {
  const normalized = String(text ?? "").trim();
  if (!normalized) return [];

  const maxWidth = Number(width);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [normalized];

  const words = normalized.split(/\s+/).filter(Boolean);
  const lines = [];

  let current = "";
  const flush = () => {
    if (!current) return;
    lines.push(current);
    current = "";
  };

  const pushLongWord = (word) => {
    for (let i = 0; i < word.length; i += maxWidth) {
      lines.push(word.slice(i, i + maxWidth));
    }
  };

  for (const word of words) {
    if (word.length > maxWidth) {
      flush();
      pushLongWord(word);
      continue;
    }

    if (!current) {
      current = word;
      continue;
    }

    const next = `${current} ${word}`;
    if (next.length <= maxWidth) {
      current = next;
    } else {
      flush();
      current = word;
    }
  }

  flush();
  return lines;
};

const wrapLabeledValue = (label, value, width = LINE_WIDTH) => {
  const text = String(value ?? "").trim();
  if (!text) return [];

  const prefix = `${label}: `;
  const indent = " ".repeat(prefix.length);
  const maxValueWidth = Math.max(1, Number(width) - prefix.length);

  const wrapped = wrapTextByWidth(text, maxValueWidth);
  return wrapped.map((line, idx) => (idx === 0 ? prefix + line : indent + line));
};

const wrapCommaSeparatedValue = (label, value, width = LINE_WIDTH) => {
  const text = String(value ?? "").trim();
  if (!text) return [];

  const prefix = `${label}: `;
  const indent = " ".repeat(prefix.length);
  const maxValueWidth = Math.max(1, Number(width) - prefix.length);

  const parts = text
    .split(/\s*,\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const valueLines = [];
  let current = "";

  const flush = () => {
    if (!current) return;
    valueLines.push(current);
    current = "";
  };

  const append = (part) => {
    if (!current) {
      current = part;
      return;
    }

    const next = `${current}, ${part}`;
    if (next.length <= maxValueWidth) {
      current = next;
      return;
    }

    flush();
    current = part;
  };

  for (const part of parts) {
    if (part.length <= maxValueWidth) {
      append(part);
      continue;
    }

    flush();
    valueLines.push(...wrapTextByWidth(part, maxValueWidth));
  }

  flush();

  return valueLines.map((line, idx) => (idx === 0 ? prefix + line : indent + line));
};

const getOptionLines = (item) => {
  const lines = [];

  if (hasValue(item?.size)) {
    lines.push(`Size: ${item.size}`);
  }

  const toppingText =
    item?.toppingText ?? formatToppings(item?.toppings ?? item?.topping);
  if (hasValue(toppingText)) {
    lines.push(...wrapCommaSeparatedValue("Topping", toppingText));
  }

  if (hasValue(item?.sugarLevel)) {
    lines.push(`Duong: ${item.sugarLevel}`);
  }

  if (hasValue(item?.iceLevel)) {
    lines.push(`Da: ${item.iceLevel}`);
  }

  if (hasValue(item?.note)) {
    lines.push(`Ghi chu: ${item.note}`);
  }

  return lines;
};

const splitAddress = (address) =>
  address ? address.split(",").map((i) => i.trim()) : [];

const PrintBill = ({ order }) => {

  if (!order) return null;
  return <InvoiceBill order={order} />;

  /*
  const items = order.items || [];
  const address = splitAddress(order.address);
  const mergedItems = mergeItems(items);
  const hasVoucher =
    order?.voucher && (order.voucher.code || order.voucher.discount);
  const voucherCode = order?.voucher?.code || "--";
  const voucherDiscount = Math.abs(Number(order?.voucher?.discount || 0));

  return (
    <div>

<style>
{`
@media print {

@page{
size:58mm auto;
margin:0;
}

body *{
visibility:hidden;
}

#receipt,#receipt *{
visibility:visible;
}

#receipt{
position:absolute;
left:0;
top:0;
width:58mm;
font-family:monospace;
font-size:12px;
line-height:16px;
}

button{
display:none;
}

}
`}
</style>

<button onClick={() => window.print()}>
In hoa don
</button>

<div
 id="receipt"
 style={{
 width:"58mm",
 padding:"3mm",
 fontFamily:"monospace",
 fontSize:"12px",
 lineHeight:"16px",
 whiteSpace:"pre-wrap",
 overflowWrap:"anywhere",
 background:"white"
 }}
 >

<div style={{textAlign:"center",fontWeight:"bold"}}>
COFFEE BINGO
</div>

<div>--------------------------------</div>

<div>Ma: {order._id}</div>
<div>Ngay: {formatDate(order.createdAt)}</div>

<div>--------------------------------</div>

<div>KH: {removeVietnamese(order.userName)}</div>
<div>SDT: {order.phone}</div>

{address.map((a,i)=>(
<div key={i}>{removeVietnamese(a)}</div>
))}

<div>--------------------------------</div>

{mergedItems.map((item,i)=>{

const name = removeVietnamese(item.name);
const optionLines = getOptionLines(item).map((line) =>
  removeVietnamese(line)
);
const lineTotal =
  item.totalPrice ?? Number(item.price || 0) * Number(item.quantity || 0);

return(
<div key={i} style={{marginBottom:"4px"}}>

<div>{name}</div>

{optionLines.map((line,idx)=>(
<div key={idx}>{line}</div>
))}

<div style={{
display:"flex",
justifyContent:"space-between"
}}>
<span>SL:{item.quantity}</span>
<span>{formatMoney(lineTotal)}</span>
</div>

</div>
)

})}

<div>--------------------------------</div>

<div style={{display:"flex",justifyContent:"space-between"}}>
<span>Ship</span>
<span>{formatMoney(order.shippingFee)}</span>
</div>

{hasVoucher && (
<>
<div style={{display:"flex",justifyContent:"space-between"}}>
<span>Voucher</span>
<span>{removeVietnamese(voucherCode)}</span>
</div>
<div style={{display:"flex",justifyContent:"space-between"}}>
<span>Giam gia</span>
<span>-{formatMoney(voucherDiscount)}</span>
</div>
</>
)}

<div style={{
display:"flex",
justifyContent:"space-between",
fontWeight:"bold"
}}>
<span>TONG</span>
<span>{formatMoney(order.totalAmount)}</span>
</div>

<div>--------------------------------</div>

<div>TT: {order.paymentMethod || "--"}</div>

<div>
{order.paymentMethod ? "DA THANH TOAN" : "CHUA THANH TOAN"}
</div>

<div>--------------------------------</div>

<div style={{textAlign:"center"}}>
Cam on quy khach
</div>

</div>

</div>
  );
  */
};

export default PrintBill;
