import React from 'react'
import { formatVND } from '../../utils/currency'
import OrderActions from './OrderActions'
import OrderMapButton from './OrderMapButton'
import OrderProductItem from './OrderProductItem'
import OrderStatusBadge from './OrderStatusBadge'
import { normalizeToppingsKey } from '../../utils/formatToppings'

const normalizeOption = (value) => String(value ?? '').trim().toLowerCase()

const normalizeToppings = (value) => normalizeToppingsKey(value)

const calcDistanceByHaversine = (origin, destination) => {
  const lat1 = Number(origin?.lat)
  const lng1 = Number(origin?.lng)
  const lat2 = Number(destination?.lat)
  const lng2 = Number(destination?.lng)

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null

  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((6371 * c).toFixed(2))
}

const mergeOrderItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return []

  const map = new Map()

  items.forEach((item) => {
    const productId = String(
      item?.productId ||
        item?._id ||
        item?.id ||
        item?.product?._id ||
        item?.product?.id ||
        ''
    )
    const productKey = productId || normalizeOption(item?.name)

    const size = item?.size || item?.variant?.size
    const sugarLevel = item?.sugarLevel || item?.sugar || item?.variant?.sugarLevel || item?.variant?.sugar
    const iceLevel = item?.iceLevel || item?.ice || item?.variant?.iceLevel || item?.variant?.ice
    const note = item?.note || item?.variant?.note
    const toppingsRaw = item?.toppings || item?.topping || item?.variant?.toppings || []

    const key = [
      productKey,
      normalizeOption(size),
      normalizeOption(sugarLevel),
      normalizeOption(iceLevel),
      normalizeToppings(toppingsRaw),
      normalizeOption(note),
    ].join('|')

    const quantity = Number(item?.quantity || 0)
    const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1

    if (map.has(key)) {
      const existing = map.get(key)
      existing.quantity = Number(existing.quantity || 0) + safeQty
      return
    }

    map.set(key, { ...item, quantity: safeQty })
  })

  return Array.from(map.values())
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

const OrderCard = ({
  order,
  apiBase,
  onUpdateStatus,
  onOpenInvoice,
  onOpenMap,
  onViewDetail,
  onDeleteOrder,
}) => {
  const items = Array.isArray(order?.items) ? order.items : []
  const mergedItems = mergeOrderItems(items)
  const customer = order?.customer || {}
  const paymentMethod = String(order?.paymentMethod || '').toLowerCase()
  const isPaid = Boolean(order?.payment)
  const orderNote = String(order?.note || order?.customerNote || '').trim()
  const deliveryFee = Number(order?.deliveryFee ?? order?.shippingFee ?? 0)
  const externalShippingFee = Number(order?.externalShippingFee ?? 0)
  const netShippingFee = deliveryFee - externalShippingFee
  const distanceFromOrder = Number(order?.distance ?? order?.distanceKm ?? 0)
  const totalQuantity = mergedItems.reduce((sum, item) => {
    const qty = Number(item?.quantity || 0)
    return sum + (Number.isFinite(qty) ? qty : 0)
  }, 0)

  const storeLat = Number(order?.storeLocation?.lat)
  const storeLng = Number(order?.storeLocation?.lng)
  const customerLat = Number(order?.deliveryAddress?.lat)
  const customerLng = Number(order?.deliveryAddress?.lng)
  const hasMap =
    Number.isFinite(storeLat) &&
    Number.isFinite(storeLng) &&
    Number.isFinite(customerLat) &&
    Number.isFinite(customerLng)

  const distanceFallback = hasMap
    ? calcDistanceByHaversine(
        { lat: storeLat, lng: storeLng },
        { lat: customerLat, lng: customerLng }
      )
    : null

  const distance =
    Number.isFinite(distanceFromOrder) && distanceFromOrder > 0
      ? distanceFromOrder
      : Number.isFinite(distanceFallback)
        ? distanceFallback
        : null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">{order?._id || 'ĐƠN_XXXX'}</p>
          <p className="text-xs text-slate-500">{formatDateTime(order?.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order?.status} />
      </div>

      <div className="grid gap-5 pt-4 lg:grid-cols-[2.2fr_1.4fr_1.2fr]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Sản phẩm</p>
          <div className="space-y-3">
            {mergedItems.length === 0 ? (
              <p className="text-sm text-slate-400">Không có sản phẩm</p>
            ) : (
              mergedItems.map((item, index) => (
                <OrderProductItem key={`${order?._id || 'order'}-${index}`} item={item} apiBase={apiBase} />
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Giao hàng</p>
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Tên:</span> {customer?.name || 'Khách hàng'}
            </p>
            <p>
              <span className="font-semibold">SĐT:</span> {customer?.phone || 'Chưa có'}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-semibold">Địa chỉ:</span> {customer?.detailAddress || 'Chưa có địa chỉ'}
            </p>
            {orderNote && (
              <p className="text-sm text-slate-600 whitespace-pre-line break-words">
                <span className="font-semibold">Ghi chú:</span> {orderNote}
              </p>
            )}
            <p className="text-sm text-slate-600">
              <span className="font-semibold">Khoảng cách:</span>{' '}
              {Number.isFinite(distance) ? `${distance.toFixed(1)} km` : '--'}
            </p>
          </div>
          <OrderMapButton disabled={!hasMap} onClick={() => onOpenMap(order)} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Thanh toán</p>
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Phương thức:</span> {order?.paymentMethod || 'Chưa rõ'}
            </p>
            <p>
              <span className="font-semibold">Phí giao hàng:</span> {formatVND(netShippingFee)}
            </p>
            {externalShippingFee > 0 && (
              <p className="text-xs text-slate-500">
                Trừ ship thuê ngoài: {formatVND(externalShippingFee)}
              </p>
            )}
            <p className="text-base font-semibold text-orange-500">Tổng đơn: {formatVND(order?.amount || 0)}</p>
            {isPaid && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                ĐÃ THANH TOÁN
              </span>
            )}
          </div>

          {paymentMethod === 'sepay' && order?.qrCode && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">QR thanh toán</p>
              <img
                src={order.qrCode}
                alt="Mã QR"
                loading="lazy"
                decoding="async"
                className="h-36 w-36 rounded-md border border-slate-200 bg-white object-contain"
              />
              <p className="mt-2 text-xs text-slate-600">
                Nội dung chuyển khoản:{' '}
                <span className="font-semibold text-slate-800">
                  {order?.transferContent || order?.paymentReferenceCode || order?._id || 'ĐƠN'}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
        <div className="text-xs text-slate-500">{totalQuantity} sản phẩm</div>
        <OrderActions
          order={order}
          onUpdateStatus={onUpdateStatus}
          onOpenInvoice={onOpenInvoice}
          onViewDetail={onViewDetail}
          onDeleteOrder={onDeleteOrder}
        />
      </div>
    </div>
  )
}

export default OrderCard
