import mongoose from "mongoose";

const loyaltyMissionClaimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    missionKey: { type: String, required: true, trim: true, index: true },
    ymd: { type: Number, required: true, index: true },
    claimedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false }
);

loyaltyMissionClaimSchema.index({ userId: 1, missionKey: 1, ymd: 1 }, { unique: true });

const loyaltyMissionClaimModel =
  mongoose.models.loyalty_mission_claim || mongoose.model("loyalty_mission_claim", loyaltyMissionClaimSchema);

export default loyaltyMissionClaimModel;

