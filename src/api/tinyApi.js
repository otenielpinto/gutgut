import axios from "axios";
import qs from "qs";
const base_url = "https://api.tiny.com.br/api2/";

export const tinyApi = async (apiUrl, data = [], method = "GET") => {
  let body = "";
  let contentData = "";
  const params = new URLSearchParams();
  for (let item of data) {
    if (item.key == "data") contentData = JSON.stringify(item.value);
    else if (typeof item.value == "object")
      body = `&${item.key}=` + JSON.stringify(item.value);
    else if (item.key == "data_xml")
      contentData = qs.stringify({ xml: item.value });
    else params.append(item.key, item.value);
  }
  let response = null;

  try {
    response = await axios({
      method,
      url: `${base_url}${apiUrl}?${params.toString()}${body}`,
      data: contentData,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    return response;
  } catch (error) {
    console.log("🚀 ~ file: tinyApi.js:33 ~ module.exports= ~ error:", error);
    return error;
  }
};
