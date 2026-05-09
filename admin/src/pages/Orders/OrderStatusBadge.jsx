import React from 'react'

export const STATUS_META = {
  pending: { label: 'Chờ xử lý', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  paid: { label: 'Đã thanh toán', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  shipping: { label: 'Đang giao', className: 'bg-sky-100 text-sky-700 border-sky-200' },
  completed: { label: 'Đã giao', className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Đã hủy', className: 'bg-rose-100 text-rose-700 border-rose-200' },
  pending: { label: 'Đã đặt', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  preparing: { label: 'Đang chuẩn bị', className: 'bg-sky-100 text-sky-700 border-sky-200' },
  delivering: { label: 'Đang giao', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  completed: { label: 'Hoàn tất', className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Đã hủy', className: 'bg-rose-100 text-rose-700 border-rose-200' },
}

export const normalizeStatus = (status) => {
  const value = String(status || '').trim().toLowerCase()
  if (!value) return 'pending'
  if (value === 'food processing') return 'delivering'
  if (value === 'out for delivery') return 'delivering'
  if (value === 'delivered') return 'completed'
  if (value === 'canceled') return 'cancelled'
  if (value === 'paid') return 'preparing'
  if (value === 'shipping') return 'delivering'
  if (value === 'done') return 'completed'
  return value
}

const OrderStatusBadge = ({ status }) => {
  const normalized = normalizeStatus(status)
  const meta = STATUS_META[normalized] || STATUS_META.pending

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

export default OrderStatusBadge
