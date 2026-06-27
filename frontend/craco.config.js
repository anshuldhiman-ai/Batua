const path = require("path");

// Load the single project-root .env so the frontend shares one env file with
// the backend. dotenv does not override vars already in process.env, so any
// real shell env still wins. REACT_APP_* vars are then picked up by CRA.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
};
