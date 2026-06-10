import React, { useContext, useEffect, useMemo, useState } from 'react'
import './FoodDisplay.css'
import { StoreContext } from '../../context/StoreContext'
import FoodItem from '../FoodItem/FoodItem'
import { Search as SearchIcon } from 'lucide-react'

const ITEMS_PER_PAGE = 20

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const buildPageItems = (totalPages, currentPage) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, idx) => idx + 1)

  const pages = new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  const output = []
  for (let i = 0; i < sorted.length; i += 1) {
    const page = sorted[i]
    const prev = sorted[i - 1]
    if (i > 0 && page - prev > 1) output.push(`dots-${prev}-${page}`)
    output.push(page)
  }

  return output
}

const FoodDisplay = ({ category, excludeIds = [] }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  console.log("FoodDisplay rendered")

  const { food_list, url, addToCart } = useContext(StoreContext)

  useEffect(() => {
    console.log("food_list =", food_list)
  }, [food_list])

  const excludeSet = useMemo(() => {
    const list = Array.isArray(excludeIds) ? excludeIds : []
    return new Set(list.map((id) => String(id)))
  }, [excludeIds])

  const normalizedQuery = useMemo(() => normalize(searchTerm), [searchTerm])

  const filteredFoods = useMemo(() => {
    const list = Array.isArray(food_list) ? food_list : []

    return list.filter((item) => {
      if (excludeSet.has(String(item?._id))) return false
      if (category !== 'All' && category !== item?.category) return false
      if (!normalizedQuery) return true

      const name = normalize(item?.name)
      const description = normalize(item?.description)
      const itemCategory = normalize(item?.category)
      return name.includes(normalizedQuery) || description.includes(normalizedQuery) || itemCategory.includes(normalizedQuery)
    })
  }, [food_list, excludeSet, category, normalizedQuery])

  useEffect(() => {
    console.log("filteredFoods =", filteredFoods)
  }, [filteredFoods])

  const totalPages = Math.max(1, Math.ceil(filteredFoods.length / ITEMS_PER_PAGE))

  useEffect(() => {
    setCurrentPage(1)
  }, [category, normalizedQuery, excludeIds])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const currentFoods = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredFoods.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredFoods, currentPage])

  const pageItems = useMemo(() => buildPageItems(totalPages, currentPage), [totalPages, currentPage])

  return (
    <div className='food-display' id='food-display'>
      <h2 className='h2we'>Món nổi bật dành cho bạn</h2>

      <div className='food-display-toolbar'>
        <div className='food-display-search'>
          <SearchIcon className='food-display-search-icon' aria-hidden='true' />
          <input
            type='text'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder='Tìm món theo tên, mô tả hoặc danh mục...'
            aria-label='Tìm kiếm sản phẩm'
          />
        </div>
        <p className='food-display-result-count'>{filteredFoods.length} sản phẩm</p>
      </div>

      {filteredFoods.length === 0 ? (
        <div className='food-display-empty'>Không tìm thấy sản phẩm phù hợp.</div>
      ) : (
        <>
          <div className='mt-[22px] grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4'>
            {currentFoods.map((item) => (
              <FoodItem
                key={item._id}
                id={item._id}
                name={item.name}
                description={item.description}
                price={item.price}
                image={item.image}
                url={url}
                onAdd={addToCart}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className='food-display-pagination' role='navigation' aria-label='Phân trang sản phẩm'>
              <button
                type='button'
                className='food-display-page-btn'
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Trước
              </button>

              {pageItems.map((item) =>
                typeof item === 'number' ? (
                  <button
                    type='button'
                    key={item}
                    className={`food-display-page-btn ${item === currentPage ? 'is-active' : ''}`}
                    onClick={() => setCurrentPage(item)}
                    aria-current={item === currentPage ? 'page' : undefined}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={item} className='food-display-page-dots' aria-hidden='true'>
                    ...
                  </span>
                )
              )}

              <button
                type='button'
                className='food-display-page-btn'
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Sau
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

export default FoodDisplay
