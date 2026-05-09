import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar/Navbar";
import Sidebar from "./Sidebar/Sidebar";

const AdminLayout = () => (
  <div>
    <Navbar />
    <div className="app-content">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  </div>
);

export default AdminLayout;
