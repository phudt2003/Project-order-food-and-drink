const fs = require('fs');
const path = require('path');

try {
  const filePath = path.join(__dirname, 'src/pages/Inventory/Recipes.jsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace corrupted Vietnamese strings
  content = content.replace(/"Ch\?\?a t\?\?\?o c\?\?ng th\?\?\?c"/g, '"Chưa tạo công thức"');
  content = content.replace(/"C\?\?ng th\?\?\?c tr\?\?\?ng"/g, '"Công thức trống"');
  content = content.replace(/"Kh\?\?ng th\?\?\? t\?\?\?i nguy\?\?n li\?\?\?u\."/g, '"Không thể tải nguyên liệu."');
  content = content.replace(/"Kh\?\?ng th\?\?\? t\?\?\?i d\?\?\? li\?\?\?u c\?\?ng th\?\?\?c\."/g, '"Không thể tải dữ liệu công thức."');

  content = content.replace(/"Quan ly cong thuc"/g, '"Quản lý công thức"');
  content = content.replace(/"Cong thuc san pham"/g, '"Công thức sản phẩm"');
  content = content.replace(/"Cong thuc topping"/g, '"Công thức topping"');
  content = content.replace(/"Cap nhat cong thuc san pham va topping\."/g, '"Cập nhật công thức sản phẩm và topping."');
  content = content.replace(/"Moi san pham co recipe de tru kho tu dong\."/g, '"Mỗi sản phẩm có công thức để trừ kho tự động."');
  content = content.replace(/"Moi topping co cong thuc de san xuat\."/g, '"Mỗi topping có công thức để sản xuất."');
  content = content.replace(/"Kiem tra cong thuc \(San pham & Topping\)"/g, '"Kiểm tra công thức (Sản phẩm & Topping)"');
  content = content.replace(/"Kiem tra cong thuc san pham"/g, '"Kiểm tra công thức sản phẩm"');
  content = content.replace(/"Kiem tra cong thuc topping"/g, '"Kiểm tra công thức topping"');

  content = content.replace(/"San pham"/g, '"Sản phẩm"');
  content = content.replace(/"Can nhap"/g, '"Cần nhập"');
  content = content.replace(/"Nhan \\"Nhap cong thuc\\" hoac \\"Tao cong thuc moi\\" de mo form\."/g, '"Nhấn \\"Nhập công thức\\" hoặc \\"Tạo công thức mới\\" để mở form."');
  content = content.replace(/"Thieu: "/g, '"Thiếu: "');
  content = content.replace(/"Trong: "/g, '"Trống: "');

  // Replace audit view buttons with select
  const auditStart = '<div className="flex flex-wrap items-center gap-2 sm:justify-end">';
  let auditEndIndex = content.indexOf('</div>', content.indexOf(auditStart)) + 6;
  if(auditEndIndex > 6){
     const newAuditSelect = `<div className="flex flex-wrap items-center sm:justify-end">
              <select
                className="h-11 min-w-[160px] px-4 rounded-lg border border-stone-200 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-50 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 appearance-none cursor-pointer pr-10 relative shadow-sm transition-colors"
                value={auditMode}
                onChange={(e) => setAuditMode(e.target.value)}
                disabled={loading || recipesLoading}
                style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 20 20\\'%3e%3cpath stroke=\\'%236b7280\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'1.5\\' d=\\'M6 8l4 4 4-4\\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em' }}
              >
                <option value="missing">Thiếu công thức</option>
                <option value="empty">Công thức trống</option>
                <option value="all">Xem tất cả</option>
              </select>
            </div>`;
    const beforeAudit = content.substring(0, content.indexOf(auditStart));
    const afterAudit = content.substring(auditEndIndex);
    content = beforeAudit + newAuditSelect + afterAudit;
  }

  // Replace Modal
  const modalStartMatch = '{modalOpen ? (';
  const modalEndMatch = ') : null}';
  const startIndex = content.indexOf(modalStartMatch);
  const endIndex = content.lastIndexOf(modalEndMatch);
  
  if (startIndex !== -1 && endIndex !== -1) {
    const newModal = `{modalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-6 flex items-center justify-center">
          <div className="relative w-full max-w-5xl max-h-full overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
            
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-200 px-4 py-4 sm:px-6">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {recipeExists ? "Sửa công thức" : "Tạo công thức"}
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  {formType === "topping" ? "Công thức topping" : "Công thức sản phẩm"}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                onClick={closeModal}
              >
                <span className="sr-only">Đóng</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Form Body - scrollable */}
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 lg:space-y-8">
              
              {/* Section 1: Basic Info (Responsive Grid) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Loại công thức</label>
                  <select
                    className="h-11 w-full rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-sm"
                    value={formType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    disabled={!showProducts || !showToppings || formLoading}
                  >
                    {showProducts && <option value="product">Sản phẩm</option>}
                    {showToppings && <option value="topping">Topping</option>}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-stone-500">
                    {formType === "topping" ? "Chọn topping" : "Chọn sản phẩm"}
                  </label>
                  <select
                    className="h-11 w-full rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-sm"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="">-- Chọn --</option>
                    {(formType === "topping" ? toppingOptions : products)
                      .filter((item) => String(item?._id || "").trim())
                      .map((item) => (
                        <option key={String(item._id)} value={String(item._id)}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Tên tự động</label>
                  <input
                    className="h-11 w-full cursor-not-allowed rounded-lg border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-stone-600 focus:outline-none shadow-sm"
                    value={selectedTarget?.name || ""}
                    disabled
                    placeholder="Tên hiển thị..."
                  />
                </div>
              </div>

              {/* Section 2: Tables (Ingredients + Toppings side by side on Desktop) */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                
                {/* 1. Nguy\u00ean li\u1EC7u Table */}
                <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-4 py-3">
                    <h4 className="text-sm font-bold text-stone-800">Nguyên liệu</h4>
                    <button
                      type="button"
                      onClick={addRow}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                      </svg>
                      Thêm
                    </button>
                  </div>
                  
                  {/* Table Wrapper for Horizontal Scroll */}
                  <div className="overflow-x-auto">
                    <table className="min-w-[600px] w-full text-left text-sm divide-y divide-stone-200">
                      <thead className="bg-stone-50">
                        <tr>
                          <th className="px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider">Tên nguyên liệu</th>
                          <th className="w-32 px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Số lượng</th>
                          {formType === "topping" && <th className="w-24 px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider text-center">Đơn vị</th>}
                          <th className="w-16 px-4 py-3 text-center text-xs font-bold text-stone-500 uppercase tracking-wider">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 bg-white">
                        {rows.map((row, idx) => (
                          <tr key={\`ingredient-\${idx}\`} className="hover:bg-stone-50/50 transition-colors">
                            <td className="px-5 py-2">
                              <select
                                value={row.ingredientId}
                                onChange={(e) => {
                                  const nextId = e.target.value;
                                  const ing = ingredientOptions.find((x) => String(x?._id) === String(nextId)) || null;
                                  updateRow(idx, { ingredientId: nextId, unit: String(ing?.unit || row.unit || "") });
                                }}
                                className="block w-full max-w-full font-medium rounded-lg border border-transparent py-2 pl-2 pr-8 text-sm text-stone-900 bg-transparent hover:bg-stone-100 focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-colors truncate"
                              >
                                <option value="">-- Chọn nguyên liệu --</option>
                                {ingredientOptions
                                  .filter((ing) => {
                                    const id = String(ing?._id || "").trim();
                                    if (!id) return false;
                                    if (String(row?.ingredientId || "").trim() === id) return true;
                                    return !pickedIngredientIds.has(id);
                                  })
                                  .map((ing) => (
                                    <option key={String(ing._id)} value={String(ing._id)}>
                                      {ing.name} ({ing.unit})
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-5 py-2 text-right">
                              <div className="flex flex-row items-center justify-end gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                                  className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-2 text-center text-sm font-semibold text-stone-800 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors"
                                  placeholder="0"
                                />
                                {formType !== "topping" && (
                                  <span className="w-10 truncate text-left text-xs font-semibold text-stone-500 bg-stone-100 px-2 py-1.5 rounded-md">
                                    {String((ingredientOptions.find((x) => String(x?._id) === String(row.ingredientId)) || {})?.unit || "")}
                                  </span>
                                )}
                              </div>
                            </td>
                            {formType === "topping" && (
                              <td className="px-5 py-2 text-center">
                                <select
                                  value={row.unit || ""}
                                  onChange={(e) => updateRow(idx, { unit: e.target.value })}
                                  className="w-full rounded-lg font-medium border-transparent bg-transparent py-2 text-center text-sm text-stone-700 hover:bg-stone-100 focus:border-transparent focus:ring-2 focus:ring-orange-400 transition-colors"
                                >
                                  <option value=""></option>
                                  {[...new Set([ ...(UNIT_OPTIONS || []), String((ingredientOptions.find((x) => String(x?._id) === String(row.ingredientId)) || {})?.unit || "") ].filter(Boolean))].map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                disabled={rows.length === 1}
                                className="inline-flex rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-400 transition-colors"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Topping Table (Only for product formula) */}
                {formType === "product" && (
                  <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-4 py-3">
                      <h4 className="text-sm font-bold text-stone-800">Topping đi kèm</h4>
                      <button
                        type="button"
                        onClick={addToppingRow}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-1 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                        </svg>
                        Thêm
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-[400px] xl:min-w-0 w-full text-left text-sm divide-y divide-stone-200">
                        <thead className="bg-stone-50">
                          <tr>
                            <th className="px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider">Tên topping</th>
                            <th className="w-32 px-5 py-3 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Số lượng</th>
                            <th className="w-16 px-4 py-3 text-center text-xs font-bold text-stone-500 uppercase tracking-wider">Xóa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 bg-white">
                          {toppingRows.map((row, idx) => (
                            <tr key={\`topping-\${idx}\`} className="hover:bg-stone-50/50 transition-colors">
                              <td className="px-5 py-2">
                                <select
                                  value={row.toppingId}
                                  onChange={(e) => updateToppingRow(idx, { toppingId: e.target.value })}
                                  className="block w-full max-w-full font-medium rounded-lg border-transparent py-2 pl-2 pr-8 text-sm text-stone-900 bg-transparent hover:bg-stone-100 focus:border-transparent focus:ring-2 focus:ring-stone-400 transition-colors truncate"
                                >
                                  <option value="">-- Chọn topping --</option>
                                  {toppingOptions
                                    .filter((top) => {
                                      const id = String(top?._id || "").trim();
                                      if (!id) return false;
                                      if (String(row?.toppingId || "").trim() === id) return true;
                                      return !pickedToppingIds.has(id);
                                    })
                                    .map((top) => (
                                      <option key={String(top._id)} value={String(top._id)}>
                                        {top.name}
                                      </option>
                                    ))}
                                </select>
                              </td>
                              <td className="px-5 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(e) => updateToppingRow(idx, { quantity: e.target.value })}
                                  className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-2 text-center text-sm font-semibold text-stone-800 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-400 transition-colors"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeToppingRow(idx)}
                                  disabled={toppingRows.length === 1}
                                  className="inline-flex rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-400 transition-colors"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Form Footer Buttons - Responsive Full Width */}
              <div className="mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-stone-100 pt-5">
                {recipeExists && (
                  <button
                    type="button"
                    className="w-full sm:w-auto inline-flex justify-center items-center rounded-lg border border-rose-200 bg-rose-50 px-6 py-3 sm:py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 transition-colors shadow-sm"
                    disabled={formLoading || !targetId}
                    onClick={() => handleDelete(\`\${formType}:\${targetId}\`)}
                  >
                    Xóa công thức
                  </button>
                )}
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full sm:w-auto inline-flex justify-center items-center rounded-lg bg-orange-500 px-10 py-3 sm:py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
                >
                  {formLoading ? "Đang lưu..." : "Lưu công thức"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}`;
    content = content.substring(0, startIndex) + newModal + content.substring(endIndex + modalEndMatch.length);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated modal completely.');
} catch (e) {
  console.error(e);
}
