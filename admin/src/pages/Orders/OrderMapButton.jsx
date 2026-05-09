import React from 'react'

const OrderMapButton = ({ disabled, onClick }) => (
  <button
    type="button"
    className="btn btn-view"
    onClick={onClick}
    disabled={disabled}
  >
    Xem bản đồ
  </button>
)

export default OrderMapButton

