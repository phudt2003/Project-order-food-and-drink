import http from "./http";

export const uploadImage = async (url, file) => {
  const payload = new FormData();
  payload.append("file", file);
  const response = await http.post(`${url}/api/media/upload`, payload);
  return response.data;
};

export const deleteImageByPublicId = async (url, publicId) => {
  const response = await http.delete(`${url}/api/media/by-public-id`, {
    data: { publicId },
  });
  return response.data;
};

