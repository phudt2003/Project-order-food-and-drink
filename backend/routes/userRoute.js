import express from "express"
import {
  loginUser,
  registerUser,
  clerkSyncUser,
  getUserAddresses,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress,
  getMe,
  updateMe,
  checkBirthdayReward,
  autoSyncVouchers,
  listMyVouchers,
} from "../controllers/userController.js"
import authMiddleware from "../middleware/auth.js"

const userRouter = express.Router()

userRouter.post("/register",registerUser)
userRouter.post("/login",loginUser)
userRouter.post("/clerk-sync",clerkSyncUser)
userRouter.get("/me", authMiddleware, getMe)
userRouter.patch("/me", authMiddleware, updateMe)
userRouter.post("/birthday/reward", authMiddleware, checkBirthdayReward)
userRouter.post("/vouchers/auto-sync", authMiddleware, autoSyncVouchers)
userRouter.get("/my-vouchers", authMiddleware, listMyVouchers)
userRouter.get("/addresses", authMiddleware, getUserAddresses)
userRouter.post("/addresses", authMiddleware, addUserAddress)
userRouter.put("/addresses/:id", authMiddleware, updateUserAddress)
userRouter.delete("/addresses/:id", authMiddleware, deleteUserAddress)

export default userRouter;
