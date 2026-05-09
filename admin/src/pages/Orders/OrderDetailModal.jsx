import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import http from '../../api/http'
import { formatVND } from '../../utils/currency'
import { STATUS_META, normalizeStatus } from './OrderStatusBadge'
import { formatToppings, normalizeToppingsKey } from '../../utils/formatToppings'

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value)

const resolveImageSrc = (value, baseUrl) => {
  if (!value) return ''
  if (/^data:/i.test(value) || isAbsoluteUrl(value)) return value
  if (!baseUrl) return value

  const trimmedBase = String(baseUrl).replace(/\/$/, '')
  const raw = String(value).replace(/^\/+/, '').replace(/\\/g, '/')

  if (raw.startsWith('images/')) return `${trimmedBase}/${raw}`
  if (raw.startsWith('uploads/')) return `${trimmedBase}/images/${raw.replace(/^uploads\//, '')}`
  if (!raw.includes('/')) return `${trimmedBase}/images/${raw}`

  return `${trimmedBase}/${raw}`
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

const getOrderCustomer = (order) => {
  const customer = order?.customer || {}
  const name = customer?.name || order?.customerName || 'Khách hàng'
  const phone = customer?.phone || order?.phone || 'Chưa có'
  const address =
    customer?.detailAddress ||
    order?.addressText ||
    order?.deliveryAddress?.text ||
    'Chưa có địa chỉ'
  return { name, phone, address }
}

const getItems = (order) => (Array.isArray(order?.items) ? order.items : [])

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

const getItemsTotal = (order) =>
  getItems(order).reduce((sum, item) => {
    const price = Number(item?.price || 0)
    const quantity = Number(item?.quantity || 0)
    return sum + price * quantity
  }, 0)

const getDeliveryFee = (order) =>
  Number(order?.deliveryFee ?? order?.shippingFee ?? order?.shipping_fee ?? 0)

const getOrderTotal = (order) => {
  const total = Number(order?.total ?? order?.amount ?? order?.totalPrice)
  if (Number.isFinite(total) && total > 0) return total
  return getItemsTotal(order) + getDeliveryFee(order)
}

const getVoucherInfo = (order) => {
  const vouchers = []

  if (order?.voucher && typeof order.voucher === 'object') {
    vouchers.push(order.voucher)
  }

  if (order?.vouchers?.order && typeof order.vouchers.order === 'object') {
    vouchers.push(order.vouchers.order)
  }

  if (order?.vouchers?.shipping && typeof order.vouchers.shipping === 'object') {
    vouchers.push(order.vouchers.shipping)
  }

  if (vouchers.length === 0) return null

  const codes = vouchers
    .map((voucher) =>
      String(
        voucher?.code ||
          voucher?.voucherCode ||
          voucher?.name ||
          voucher?.title ||
          ''
      ).trim()
    )
    .filter(Boolean)

  const discount = vouchers.reduce((sum, voucher) => {
    const value = Number(voucher?.discount ?? voucher?.value ?? 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)

  if (codes.length === 0 && !(Number.isFinite(discount) && discount > 0)) return null

  return {
    code: codes.join(', '),
    discount: Number.isFinite(discount) ? Math.max(0, discount) : 0,
  }
}

const getOptionLines = (item) => {
  const size = item?.size || item?.variant?.size
  const sugar = item?.sugar || item?.variant?.sugar
  const ice = item?.ice || item?.variant?.ice
  const note = item?.note || item?.variant?.note
  const toppingsRaw = item?.toppings || item?.topping || item?.variant?.toppings || []
  const toppingsText = formatToppings(toppingsRaw)

  return [
    size ? `Size: ${size}` : '',
    sugar ? `Đường: ${sugar}` : '',
    ice ? `Đá: ${ice}` : '',
    toppingsText ? `Topping: ${toppingsText}` : '',
    note ? `Ghi chú: ${note}` : '',
  ].filter(Boolean)
}

const OrderDetailModal = ({ order, isOpen, onClose, apiBase, onOrderUpdated }) => {
  const [imgError, setImgError] = useState({})
  const [externalShippingFeeInput, setExternalShippingFeeInput] = useState('0')
  const [savingExternal, setSavingExternal] = useState(false)

  const normalizedStatus = normalizeStatus(order?.status)
  const statusMeta = STATUS_META[normalizedStatus] || STATUS_META.pending
  const customer = useMemo(() => getOrderCustomer(order), [order])
  const items = useMemo(() => getItems(order), [order])
  const mergedItems = useMemo(() => mergeOrderItems(items), [items])
  const itemsTotal = useMemo(() => getItemsTotal(order), [order])
  const deliveryFee = useMemo(() => getDeliveryFee(order), [order])
  const externalShippingFee = useMemo(() => Number(order?.externalShippingFee ?? 0), [order])
  const orderTotal = useMemo(() => getOrderTotal(order), [order])
  const voucherInfo = useMemo(() => getVoucherInfo(order), [order])
  const distanceFromOrder = Number(order?.distance ?? order?.distanceKm ?? 0)
  const deliveryTime = Number(order?.deliveryTime ?? order?.durationMinutes ?? order?.duration ?? 0)

  const distanceFallback = calcDistanceByHaversine(
    order?.storeLocation,
    order?.deliveryAddress
  )

  const distanceKm =
    Number.isFinite(distanceFromOrder) && distanceFromOrder > 0
      ? distanceFromOrder
      : Number.isFinite(distanceFallback)
        ? distanceFallback
        : 0

  useEffect(() => {
    if (!order) return
    setExternalShippingFeeInput(String(Number(order?.externalShippingFee || 0)))
  }, [order?._id])

  const externalShippingFeePreview = Number(externalShippingFeeInput)
  const externalShippingFeeValue = Number.isFinite(externalShippingFeePreview)
    ? externalShippingFeePreview
    : externalShippingFee
  const netShippingFee = deliveryFee - externalShippingFeeValue

  const handleSaveExternalShippingFee = async () => {
    if (!order?._id || !apiBase) return
    const fee = Number(externalShippingFeeInput)
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error('Phí ship thuê ngoài phải >= 0')
      return
    }
    setSavingExternal(true)
    try {
      const response = await http.patch(
        `${apiBase}/api/orders/${order._id}/external-shipping`,
        { externalShippingFee: fee }
      )
      if (response?.data?.success) {
        const updated = response?.data?.data
        toast.success('Đã cập nhật phí ship thuê ngoài')
        if (typeof onOrderUpdated === 'function' && updated) {
          onOrderUpdated(updated)
        }
      } else {
        toast.error(response?.data?.message || 'Cập nhật thất bại')
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Cập nhật thất bại')
    } finally {
      setSavingExternal(false)
    }
  }

  if (!isOpen || !order) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Chi tiết đơn hàng</h3>
            <p className="text-sm text-slate-500">{order?._id || '-'}</p>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5 space-y-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Mã đơn hàng</p>
                <p className="text-sm font-semibold text-slate-800">{order?.orderCode || order?._id}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Ngày đặt</p>
                <p className="text-sm font-semibold text-slate-700">{formatDateTime(order?.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-800">Thông tin khách hàng</h4>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <span>Tên khách</span>
                <span className="font-medium text-slate-800">{customer.name}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span>Số điện thoại</span>
                <span className="font-medium text-slate-800">{customer.phone}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span>Địa chỉ</span>
                <span className="font-medium text-slate-800 text-right">{customer.address}</span>
              </div>
              {Number.isFinite(distanceKm) && distanceKm > 0 ? (
                <div className="flex items-start justify-between gap-4">
                  <span>Khoảng cách</span>
                  <span className="font-medium text-slate-800">{distanceKm.toFixed(1)} km</span>
                </div>
              ) : null}
              {Number.isFinite(deliveryTime) && deliveryTime > 0 ? (
                <div className="flex items-start justify-between gap-4">
                  <span>Thời gian giao</span>
                  <span className="font-medium text-slate-800">{Math.round(deliveryTime)} phút</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Danh sách sản phẩm</h4>
            <div className="space-y-3">
              {mergedItems.length === 0 ? (
                <p className="text-sm text-slate-500">Không có sản phẩm.</p>
              ) : (
                mergedItems.map((item, index) => {
                  const itemKey = item?._id || item?.productId || `item-${index}`
                  const imgSrc = !imgError[itemKey]
                    ? resolveImageSrc(item?.image, apiBase)
                    : ''
                  const optionLines = getOptionLines(item)
                  return (
                    <div
                      key={itemKey}
                      className="flex items-start gap-4 rounded-xl border border-slate-100 bg-white p-3"
                    >
                      <div className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={item?.name || 'Sản phẩm'}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                            onError={() =>
                              setImgError((prev) => ({ ...prev, [itemKey]: true }))
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            Không có ảnh
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {item?.name || 'Sản phẩm'}
                        </p>
                        {optionLines.length > 0 ? (
                          <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                            {optionLines.map((line, lineIndex) => (
                              <p key={`${itemKey}-opt-${lineIndex}`}>{line}</p>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">x{Number(item?.quantity || 0)}</p>
                      </div>
                      <p className="text-sm font-semibold text-orange-500">
                        {formatVND(item?.price || 0)}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Tiền sản phẩm</span>
              <span className="font-semibold text-slate-900">{formatVND(itemsTotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-slate-600">
              <span>Phi ship (khach tra)</span>
              <span>{formatVND(deliveryFee)}</span>
            </div>
            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-600">Phí ship thuê ngoài</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={externalShippingFeeInput}
                  onChange={(e) => setExternalShippingFeeInput(e.target.value)}
                  className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <button
                  type="button"
                  onClick={handleSaveExternalShippingFee}
                  className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingExternal}
                >
                  {savingExternal ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Chi phí cửa hàng trả cho đơn này.</p>
            </div>
            <div className="mt-2 flex items-center justify-between text-slate-600">
              <span>Phi ship thuc nhan</span>
              <span className="font-semibold text-slate-900">{formatVND(netShippingFee)}</span>
            </div>
            {voucherInfo ? (
              <>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-gray-500">Voucher</span>
                  <span className="text-gray-800">{voucherInfo.code || '--'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-gray-500">Giảm giá</span>
                  <span className="text-green-600">-{formatVND(voucherInfo.discount)}</span>
                </div>
              </>
            ) : null}
            <div className="mt-3 flex items-center justify-between text-base font-semibold text-orange-500">
              <span>Tổng tiền</span>
              <span>{formatVND(orderTotal)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

export default OrderDetailModal

