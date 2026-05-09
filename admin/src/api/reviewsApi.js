import axios from "axios";

import http from "./http";

export const getReviews = async (url, params = {}) => {
  const response = await http.get(`${url}/api/reviews`, { params });
  return response.data;
};

export const updateReviewReply = async (url, id, adminReply) => {
  const response = await http.patch(`${url}/api/reviews/${id}/reply`, { adminReply });
  return response.data;
};
