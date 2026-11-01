import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MonopolyEntry } from "./MonopolyEntry.tsx";
import { initializeTheme } from "./theme.ts";
import "./tokens.css";
import "./styles.css";
import "./animations.css";

/**
 * The standalone page. In production Monopoly is a route of the LayUDown SPA (`MonopolyEntry` mounted by the site's own
 * App), so this file is only what `npm run dev` and `npm run preview` open: a real account is required to play online
 * there, and this page has none, so it starts in single-player.
 */
const SITE_TOKEN_KEY = "uno.accountToken";

initializeTheme();

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

const token = localStorage.getItem(SITE_TOKEN_KEY);

createRoot(container).render(
  <StrictMode>
    <MonopolyEntry
      account={{ id: "local", username: "本机" }}
      token={token}
      connection={token ? "已登录" : "未登录"}
    />
  </StrictMode>
);