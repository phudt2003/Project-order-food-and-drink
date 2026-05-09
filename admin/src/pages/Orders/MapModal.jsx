import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const MapModal = ({
  isOpen,
  storeLat,
  storeLng,
  customerLat,
  customerLng,
  distanceKm,
  deliveryTime,
  items,
  onClose,
}) => {
  if (!isOpen) return null

  const storeLatNum = Number(storeLat)
  const storeLngNum = Number(storeLng)
  const customerLatNum = Number(customerLat)
  const customerLngNum = Number(customerLng)

  const hasStore = Number.isFinite(storeLatNum) && Number.isFinite(storeLngNum)
  const hasCustomer = Number.isFinite(customerLatNum) && Number.isFinite(customerLngNum)

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

  const normalizeItemType = (item) => {
    const rawType = String(
      item?.type ||
        item?.productType ||
        item?.product?.type ||
        item?.category ||
        item?.categoryName ||
        ''
    )
      .toLowerCase()
      .trim()

    if (!rawType) {
      const name = String(item?.name || '').toLowerCase()
      if (item?.sugarLevel || item?.iceLevel) return 'drink'
      if (name.includes('bánh') || name.includes('banh') || name.includes('cake') || name.includes('dessert')) {
        return 'food'
      }
      return ''
    }

    if (rawType.includes('drink') || rawType.includes('beverage') || rawType.includes('coffee') || rawType.includes('nuoc')) {
      return 'drink'
    }
    if (rawType.includes('food') || rawType.includes('banh') || rawType.includes('cake') || rawType.includes('dessert')) {
      return 'food'
    }
    return rawType
  }

  const getPrepMinutes = (orderItems) => {
    if (!Array.isArray(orderItems)) return 0
    let drinkCount = 0
    let foodCount = 0

    orderItems.forEach((item) => {
      const qty = Number(item?.quantity || 0)
      const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1
      const type = normalizeItemType(item)

      if (type === 'food') {
        foodCount += safeQty
      } else {
        drinkCount += safeQty
      }
    })

    return drinkCount * 3 + foodCount * 2
  }

  const [route, setRoute] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !hasStore || !hasCustomer) return

    const controller = new AbortController()

    const fetchRoute = async () => {
      setLoading(true)
      setError('')
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${storeLngNum},${storeLatNum};${customerLngNum},${customerLatNum}?overview=full&geometries=geojson`
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('OSRM error')
        const data = await response.json()

        const routeData = data?.routes?.[0]
        const coords = routeData?.geometry?.coordinates || []

        if (!routeData || coords.length === 0) {
          setRoute([])
          setError('Không tìm được tuyến đường giao hàng.')
          return
        }

        const converted = coords.map(([lng, lat]) => [lat, lng])
        setRoute(converted)
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError('Không tìm được tuyến đường giao hàng.')
          setRoute([])
        }
      } finally {
        setLoading(false)
      }
    }

    fetchRoute()
    return () => controller.abort()
  }, [isOpen, hasStore, hasCustomer, storeLatNum, storeLngNum, customerLatNum, customerLngNum])

  const bounds = useMemo(() => {
    if (hasStore && hasCustomer) {
      return [
        [storeLatNum, storeLngNum],
        [customerLatNum, customerLngNum],
      ]
    }
    if (hasStore) return [[storeLatNum, storeLngNum]]
    if (hasCustomer) return [[customerLatNum, customerLngNum]]
    return null
  }, [storeLatNum, storeLngNum, customerLatNum, customerLngNum, hasStore, hasCustomer])

  const center = hasStore
    ? [storeLatNum, storeLngNum]
    : hasCustomer
      ? [customerLatNum, customerLngNum]
      : [10.8231, 106.6297]

  const storeIcon = useMemo(
    () =>
      L.divIcon({
        className: 'gm-pin gm-pin--green',
        html: '<div class="gm-pin__outer"><div class="gm-pin__inner"></div></div>',
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        tooltipAnchor: [0, -34],
      }),
    []
  )

  const customerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'gm-pin gm-pin--red',
        html: '<div class="gm-pin__outer"><div class="gm-pin__inner"></div></div>',
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        tooltipAnchor: [0, -34],
      }),
    []
  )

  const distanceValue = Number(distanceKm)
  const fallbackDistance = hasStore && hasCustomer
    ? calcDistanceByHaversine(
        { lat: storeLatNum, lng: storeLngNum },
        { lat: customerLatNum, lng: customerLngNum }
      )
    : null
  const finalDistance = Number.isFinite(distanceValue) && distanceValue > 0
    ? distanceValue
    : Number.isFinite(fallbackDistance)
      ? fallbackDistance
      : null

  const timeValue = Number(deliveryTime)
  const prepMinutes = getPrepMinutes(items)
  const travelMinutes = Number.isFinite(finalDistance)
    ? finalDistance * 2.5
    : null
  const estimatedTime = Number.isFinite(travelMinutes)
    ? Math.max(1, Math.round(prepMinutes + travelMinutes))
    : null
  const finalTime = Number.isFinite(timeValue) && timeValue > 0
    ? timeValue
    : Number.isFinite(estimatedTime)
      ? estimatedTime
      : null

  const displayDistance = Number.isFinite(finalDistance)
    ? `${finalDistance.toFixed(2)} km`
    : '--'

  const displayEta = Number.isFinite(finalTime)
    ? `${Math.round(finalTime)} phút`
    : '--'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-[800px] rounded-xl bg-white p-4 shadow-lg">
        <style>{`
          .gm-pin {
            background: transparent;
            border: none;
          }
          .gm-pin__outer {
            width: 28px;
            height: 28px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            position: relative;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          }
          .gm-pin__inner {
            width: 12px;
            height: 12px;
            background: #fff;
            border-radius: 50%;
            position: absolute;
            top: 8px;
            left: 8px;
          }
          .gm-pin--green .gm-pin__outer {
            background: #16a34a;
          }
          .gm-pin--red .gm-pin__outer {
            background: #dc2626;
          }
        `}</style>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Bản đồ giao hàng</p>
            <p className="text-xs text-slate-500">Đường đi thực tế theo OSRM</p>
          </div>
          <button
            type="button"
            className="btn btn-cancel"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>

        <div className="mt-4 h-[400px] overflow-hidden rounded-xl border border-slate-200">
          {loading && (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-orange-300 border-t-transparent" />
              Đang tải đường đi...
            </div>
          )}
          {!loading && (
            <MapContainer
              className="h-full w-full"
              center={center}
              zoom={13}
              scrollWheelZoom={false}
              bounds={bounds || undefined}
              boundsOptions={{ padding: [40, 40] }}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {hasStore && (
                <Marker position={[storeLatNum, storeLngNum]} icon={storeIcon}>
                  <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    Cửa hàng
                  </Tooltip>
                </Marker>
              )}
              {hasCustomer && (
                <Marker position={[customerLatNum, customerLngNum]} icon={customerIcon}>
                  <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    Khách hàng
                  </Tooltip>
                </Marker>
              )}
              {route.length > 0 && <Polyline positions={route} color="orange" weight={4} />}
            </MapContainer>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span>Khoảng cách: <span className="font-semibold text-slate-800">{displayDistance}</span></span>
            <span>Thời gian: <span className="font-semibold text-slate-800">{displayEta}</span></span>
          </div>
          {error && <span className="text-rose-500">{error}</span>}
        </div>
      </div>
    </div>
  )
}

export default MapModal
