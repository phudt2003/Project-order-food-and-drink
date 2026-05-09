import React from 'react'
import { normalizeStatus } from './OrderStatusBadge'

const OrderActions = ({ order, onUpdateStatus, onOpenInvoice, onViewDetail, onDeleteOrder }) => {
  const normalized = normalizeStatus(order?.status)
  const isPaid = Boolean(order?.payment)

  if (normalized === 'pending') {
    if (!isPaid) {
      return (
        <div className="text-xs font-semibold text-slate-400">
          Chờ thanh toán
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-confirm"
          type="button"
          onClick={() => onUpdateStatus(order, 'preparing')}
        >
          Bắt đầu chuẩn bị
        </button>
        <button
          className="btn btn-cancel"
          type="button"
          onClick={() => onUpdateStatus(order, 'cancelled')}
        >
          Hủy đơn
        </button>
      </div>
    )
  }

  if (normalized === 'preparing') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-edit"
          type="button"
          onClick={() => onUpdateStatus(order, 'delivering')}
        >
          Đang giao
        </button>
        <button
          className="btn btn-view"
          type="button"
          onClick={() => onOpenInvoice(order)}
        >
          In hóa đơn
        </button>
        <button
          className="btn btn-cancel"
          type="button"
          onClick={() => onUpdateStatus(order, 'cancelled')}
        >
          Hủy đơn
        </button>
      </div>
    )
  }

  if (normalized === 'delivering') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-confirm"
          type="button"
          onClick={() => onUpdateStatus(order, 'completed')}
        >
          Hoàn tất
        </button>
      </div>
    )
  }

  if (normalized === 'completed') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-view"
          type="button"
          onClick={() => onViewDetail(order)}
        >
          Xem chi tiết
        </button>
      </div>
    )
  }

  if (normalized === 'cancelled') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-delete"
          type="button"
          onClick={() => onDeleteOrder?.(order)}
        >
          Xóa đơn hàng
        </button>
      </div>
    )
  }

  return null
}

export default OrderActions
