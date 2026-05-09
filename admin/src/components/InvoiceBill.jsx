import React from "react";

import { useRef } from "react";
import { useReactToPrint } from "react-to-print";

import { formatToppings, normalizeToppingsKey } from "../utils/formatToppings";

const LINE_WIDTH = 32;

const RECEIPT_WIDTH = "58mm";
// `@page size` does not reliably support `auto` height in Chrome.
// Keep a large fallback so Chrome uses a 58mm page instead of defaulting to A4.
const RECEIPT_FALLBACK_HEIGHT = "500mm";

const RECEIPT_BASE_CSS = `
  #receipt, #receipt * { box-sizing: border-box; }
  #receipt { width: ${RECEIPT_WIDTH}; max-width: ${RECEIPT_WIDTH}; margin: 0; }

  .receipt {
    width: ${RECEIPT_WIDTH};
    max-width: ${RECEIPT_WIDTH};
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    line-height: 16px;
    padding: 3mm;
    background: #fff;
    color: #000;
  }

  .receipt-line { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
  .receipt-item { break-inside: avoid; page-break-inside: avoid; }
  .receipt-center { text-align: center; }
  .receipt-bold { font-weight: 700; }
  .receipt-gap { margin-top: 4px; }
`;

const RECEIPT_PRINT_CSS = `
  @page {
    margin: 0;
    size: ${RECEIPT_WIDTH} ${RECEIPT_FALLBACK_HEIGHT};
    size: ${RECEIPT_WIDTH} auto;
  }

  @media print {
    html, body {
      width: ${RECEIPT_WIDTH} !important;
      min-width: ${RECEIPT_WIDTH} !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-text-size-adjust: 100%;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    #receipt {
      width: ${RECEIPT_WIDTH} !important;
      max-width: ${RECEIPT_WIDTH} !important;
      margin: 0 !important;
      overflow: visible !important;
    }
  }

  ${RECEIPT_BASE_CSS}
`;

const formatMoney = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat("vi-VN").format(number);
};

const formatDate = (value) => {
  if (!value) return "--";

  const date = new Date(value);

  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();

  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${d}/${m}/${y} ${h}:${min}`;
};

const line = "-".repeat(LINE_WIDTH);

const formatLine = (left, right) => {
  left = String(left);
  right = String(right);

  if (left.length + right.length >= LINE_WIDTH) {
    return left + " " + right;
  }

  const space = LINE_WIDTH - left.length - right.length;

  return left + " ".repeat(space) + right;
};

const center = (text = "") => {
  const space = Math.floor((LINE_WIDTH - text.length) / 2);
  return " ".repeat(space > 0 ? space : 0) + text;
};

const removeVietnamese = (str = "") =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

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

const InvoiceBill = ({ order }) => {
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const address = splitAddress(order.address);
  const mergedItems = mergeItems(items);
  const hasVoucher =
    order?.voucher && (order.voucher.code || order.voucher.discount);
  const voucherCode = order?.voucher?.code || "--";
  const voucherDiscount = Math.abs(Number(order?.voucher?.discount || 0));

  const paid =
    order?.paymentStatus ||
    (order?.paymentMethod ? "DA THANH TOAN" : "CHUA THANH TOAN");

  const receiptRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `invoice-${String(order._id || "receipt")}`,
    pageStyle: RECEIPT_PRINT_CSS,
  });

  const wrapLines = (text) =>
    wrapTextByWidth(String(text ?? ""), LINE_WIDTH).map((t) => String(t));

  const safePhone = String(order.phone || "").trim();
  const safeCustomer = removeVietnamese(order.userName || "");

  return (
    <div className="w-[58mm]">
      <style>{RECEIPT_BASE_CSS}</style>
      <div className="mb-2 flex justify-center print:hidden">
        <button type="button" onClick={handlePrint} className="btn btn-confirm rounded-lg">
          In hóa đơn
        </button>
      </div>

      <div
        id="receipt"
        ref={receiptRef}
        className="receipt"
      >
        <div className="receipt-center receipt-bold receipt-line">COFFEE BINGO</div>
        <div className="receipt-line">{line}</div>

        <div className="receipt-line">Ma: {String(order._id || "")}</div>
        <div className="receipt-line">Ngay: {formatDate(order.createdAt)}</div>
        <div className="receipt-line">{line}</div>

        <div className="receipt-line">KH: {safeCustomer}</div>
        {safePhone ? <div className="receipt-line">SDT: {safePhone}</div> : null}
        {address.flatMap((a) => wrapLines(removeVietnamese(a))).map((t, idx) => (
          <div key={`addr-${idx}`} className="receipt-line">
            {t}
          </div>
        ))}

        <div className="receipt-line">{line}</div>

        {mergedItems.map((item, idx) => {
          const nameLines = wrapLines(removeVietnamese(item?.name || ""));
          const optionLines = getOptionLines(item).flatMap((l) => wrapLines(removeVietnamese(l)));
          const qty = "SL:" + String(item?.quantity ?? 0);
          const lineTotal =
            item?.totalPrice ?? Number(item?.price || 0) * Number(item?.quantity || 0);
          const price = formatMoney(lineTotal);

          return (
            <div key={buildItemKey(item) || idx} className="receipt-item receipt-gap">
              {nameLines.map((t, i) => (
                <div key={`n-${i}`} className="receipt-line">
                  {t}
                </div>
              ))}
              {optionLines.map((t, i) => (
                <div key={`o-${i}`} className="receipt-line">
                  {t}
                </div>
              ))}
              <div className="receipt-line">{formatLine(qty, price)}</div>
            </div>
          );
        })}

        <div className="receipt-gap receipt-line">{line}</div>
        <div className="receipt-line">{formatLine("Ship", formatMoney(order.shippingFee))}</div>

        {hasVoucher ? (
          <>
            <div className="receipt-line">{formatLine("Voucher", removeVietnamese(voucherCode))}</div>
            <div className="receipt-line">{formatLine("Giam gia", "-" + formatMoney(voucherDiscount))}</div>
          </>
        ) : null}

        <div className="receipt-line receipt-bold">
          {formatLine("TONG", formatMoney(order.totalAmount))}
        </div>
        <div className="receipt-line">{line}</div>

        <div className="receipt-line">TT: {removeVietnamese(order.paymentMethod || "--")}</div>
        <div className="receipt-line">{removeVietnamese(paid)}</div>

        <div className="receipt-line">{line}</div>
        <div className="receipt-center receipt-line">Cam on quy khach</div>
      </div>
    </div>
  );
};

export default InvoiceBill;
