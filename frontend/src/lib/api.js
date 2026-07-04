const raw = import.meta.env.VITE_API_URL;
const base = typeof raw === "string" ? raw.replace(/\/+$/, "") : ""; // remove trailing slashes

// this is an authenticated fetch req that we use to send reqs to our api
export async function apiFetch(path, opts = {}) {
  const { getToken, method = "GET", body } = opts;
  const headers = { "Content-Type": "application/json" };

  if (getToken) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw e;
  }

  const data = await res.json();

  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : res.statusText;
    const err = new Error(typeof msg === "string" ? msg : "Request failed");

    throw err;
  }

  return data;
}
