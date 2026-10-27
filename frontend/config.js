/* BorrowBox API configuration for a separately hosted Render frontend. */
window.BORROWBOX_API_URL = window.BORROWBOX_API_URL || (
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "https://borrowbox-h11b.onrender.com/api"
);
