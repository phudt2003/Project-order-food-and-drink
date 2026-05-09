import vi from "./locales/vi.json";

const dictionary = vi;

export function t(key, params = {}) {
  const template = dictionary[key] || key;
  return Object.keys(params).reduce((message, paramKey) => {
    const pattern = new RegExp(`\\{${paramKey}\\}`, "g");
    return message.replace(pattern, String(params[paramKey]));
  }, template);
}

export default t;
