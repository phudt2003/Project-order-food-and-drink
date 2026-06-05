# Order Food and Drinks - Frontend

Frontend cho ung dung dat do an va thuc uong, duoc xay dung bang React + Vite. Ung dung ket noi voi backend Express/MongoDB de hien thi san pham, gio hang, dat hang, thanh toan, lich su don hang, voucher, loyalty, danh gia va dong bo tai khoan Clerk.

## Cong nghe su dung

- React 19 va React Router
- Vite
- Axios
- Clerk Authentication
- Leaflet / React Leaflet cho ban do
- Tailwind CSS va CSS module theo tung component
- Lucide React, React Icons, React Confetti

## Chuc nang chinh

- Trang chu, danh muc mon, tim kiem va chi tiet san pham
- Gio hang, tuy chon topping, muc duong, so luong va dat lai don cu
- Checkout voi dia chi, ban do va ap dung voucher
- Theo doi don hang va trang thai thanh toan
- He thong voucher, diem loyalty, diem danh va phan thuong sinh nhat
- Dang nhap/dang ky bang Clerk
- POS route danh cho luong dat mon nhanh
- Giao dien sang/toi

## Yeu cau

- Node.js 18 tro len
- npm
- Backend dang chay, mac dinh tai `http://localhost:4000`
- Clerk publishable key
- Google Maps browser key neu su dung tinh nang ban do

## Cai dat

```bash
cd frontend
npm install
```

Tao file `.env.local` tu `.env.example` va bo sung cac bien can thiet:

```env
VITE_API_URL=http://localhost:4000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
```

Ghi chu:

- `VITE_API_URL` co gia tri mac dinh la `http://localhost:4000` trong code va Vite proxy.
- `VITE_CLERK_PUBLISHABLE_KEY` la bat buoc, ung dung se dung lai neu thieu bien nay.
- Khong dua secret key cua Clerk, MongoDB, JWT hay Cloudinary vao frontend.

## Chay du an

Chay backend truoc:

```bash
cd ../backend
npm install
npm run server
```

Chay frontend:

```bash
cd ../frontend
npm run dev
```

Ung dung mac dinh mo tai:

```text
http://localhost:3000
```

## Lenh huu ich

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Cau truc thu muc

```text
frontend/
  public/                 Static assets
  src/
    api/                  Ham goi API
    assets/               Hinh anh va asset dung trong UI
    components/           Component dung chung
    context/              Store, cart va theme context
    features/             Logic theo tinh nang
    pages/                Cac trang route chinh
    utils/                Ham tien ich
  vite.config.js          Cau hinh Vite, port va proxy API
```

## Build va preview

```bash
npm run build
npm run preview
```

Thu muc build se duoc tao tai `frontend/dist`.

## Luu y trien khai

- Dat `VITE_API_URL` tro den backend production, vi du `https://order-food-and-drink-project.onrender.com`.
- Them `VITE_CLERK_PUBLISHABLE_KEY` tren moi truong hosting.
- Kiem tra CORS o backend neu domain frontend thay doi.
