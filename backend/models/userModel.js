import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
    name:{type:String,required:true},
    phone:{type:String,default:"",trim:true,index:true},
    email:{type:String,required:true,unique:true},
    clerkId:{type:String,unique:true,sparse:true,default:null},
    password:{type:String,required:true},
    cartData:{type:Object,default:{}},
    // Voucher mà user đã "lưu sẵn" để áp dụng cho đơn tiếp theo (pending apply).
    pendingVoucher: {
        id: { type: String, default: "" },
        voucherCode: { type: String, default: "", trim: true, uppercase: true },
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "voucher", default: null },
        claimedAt: { type: Date, default: null },
    },
    birthday: { type: Date, default: null },
    lastCheckInDate: { type: Date, default: null },
    lastBirthdayRewardYear: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0, min: 0 },
    coinBalance: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, unique: true, sparse: true, default: null, trim: true, uppercase: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    referralsCount: { type: Number, default: 0, min: 0 },
},{minimize:false})

const userModel = mongoose.models.user || mongoose.model("user", userSchema)
export default userModel;
