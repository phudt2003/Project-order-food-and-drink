import React, { useState } from 'react'
import { formatVND } from '../../utils/currency'

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

const OrderProductItem = ({ item, apiBase }) => {
  const [imgError, setImgError] = useState(false)
  const imgSrc = !imgError ? resolveImageSrc(item?.image, apiBase) : ''
  const quantity = Number(item?.quantity || 0)

  return (
    <div className="flex items-start gap-3">
      <div className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item?.name || 'Sản phẩm'}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            Không có ảnh
          </div>
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{item?.name || 'Sản phẩm'}</p>
        <p className="text-xs text-slate-500">x{Number.isFinite(quantity) ? quantity : 0}</p>
      </div>
      <p className="text-sm font-semibold text-orange-500">{formatVND(item?.price || 0)}</p>
    </div>
  )
}

export default OrderProductItem
