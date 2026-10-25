/* BorrowBox frontend API configuration.
   Local development uses http://localhost:3000/api by default.
   When deploying, set this to your backend URL, for example:
   window.BORROWBOX_API_URL = "https://your-backend.example.com/api";
*/
window.BORROWBOX_API_URL = window.BORROWBOX_API_URL || (
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "/api"
);
