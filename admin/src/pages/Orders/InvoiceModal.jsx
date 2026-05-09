import React from "react";
import InvoiceBill from "../../components/InvoiceBill";

const INVOICE_MODAL_PRINT_CSS = `
  @page {
    margin: 0;
    size: 58mm auto;
  }

  @media print {
    html, body {
      width: 58mm !important;
      min-width: 58mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    .invoice-modal-overlay {
      position: static !important;
      background: #fff !important;
      padding: 0 !important;
      height: auto !important;
      overflow: visible !important;
    }

    .invoice-modal-actions {
      display: none !important;
    }
  }
`;

const getVoucherInfo = (order) => {
  const vouchers = [];

  if (order?.voucher && typeof order.voucher === "object") {
    vouchers.push(order.voucher);
  }

  if (order?.vouchers?.order && typeof order.vouchers.order === "object") {
    vouchers.push(order.vouchers.order);
  }

  if (order?.vouchers?.shipping && typeof order.vouchers.shipping === "object") {
    vouchers.push(order.vouchers.shipping);
  }

  if (vouchers.length === 0) return null;

  const codes = vouchers
    .map((voucher) =>
      String(
        voucher?.code ||
          voucher?.voucherCode ||
          voucher?.name ||
          voucher?.title ||
          ""
      ).trim()
    )
    .filter(Boolean);

  const discount = vouchers.reduce((sum, voucher) => {
    const value = Number(voucher?.discount ?? voucher?.value ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  if (codes.length === 0 && !(Number.isFinite(discount) && discount > 0)) return null;

  return {
    code: codes.join(", "),
    discount: Math.max(0, discount),
  };
};

const mapOrderToBill = (order) => {
  if (!order) return null;

  const customer = order?.customer || {};
  const voucher = getVoucherInfo(order);

  return {
    _id: order?._id || "",
    createdAt: order?.createdAt || order?.date || "",
    userName: customer?.name || order?.userName || "",
    phone: customer?.phone || order?.phone || "",
    address: customer?.detailAddress || order?.address || "",
    paymentMethod: order?.paymentMethod || "",
    shippingFee: order?.deliveryFee || order?.shippingFee || 0,
    totalAmount: order?.amount || order?.totalAmount || 0,
    paymentStatus: order?.payment ? "ĐÃ THANH TOÁN" : "CHƯA THANH TOÁN",
    items: Array.isArray(order?.items) ? order.items : [],
    voucher,
  };
};

const InvoiceModal = ({ order, isOpen, onClose }) => {
  if (!isOpen || !order) return null;

  const billOrder = mapOrderToBill(order);

  return (
    <div className="invoice-modal-overlay fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-6">

      <style>{INVOICE_MODAL_PRINT_CSS}</style>

      {/* Wrapper fix scroll + tránh bị che đáy */}
      <div className="flex justify-center min-h-full pb-20">

        <div className="w-auto">

          {/* Actions */}
          <div className="invoice-modal-actions mb-3 flex justify-end">
            <button
              type="button"
              className="btn btn-cancel"
              onClick={onClose}
            >
              Đóng
            </button>
          </div>

          {/* Bill */}
          <InvoiceBill order={billOrder} />

        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;