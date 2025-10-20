function HttpClient() {
  const fetchHelper = async (url, options, parseAs = "json") => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error HTTP: ${response.status} - ${errorText}`);
    }
    return parseAs === "blob" ? response.blob() : response.json();
  };

  return {
    get: (url) =>
      fetchHelper(url, { method: "GET" }),
    post: (url, data) =>
      fetchHelper(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    put: (url, data) =>
      fetchHelper(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    patch: (url, data) =>
      fetchHelper(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (url) =>
      fetchHelper(url, { method: "DELETE" }),
  };
}

// Exportar en CommonJS
module.exports = HttpClient();