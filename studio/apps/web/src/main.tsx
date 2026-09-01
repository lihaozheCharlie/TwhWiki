import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans-sc";
import App from "./App";
import "./styles/base.css";
import "./styles/features.css";
import "./styles/archive-foundation.css";
import "./styles/refinements.css";
import "./styles/archive-theme.css";
import "./styles/understanding.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
