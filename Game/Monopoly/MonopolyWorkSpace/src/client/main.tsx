import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initializeTheme } from "./theme.ts";
import "./tokens.css";
import "./styles.css";
import "./animations.css";

// The saved theme is applied before the first paint, so the page never flashes the wrong one.
initializeTheme();

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);