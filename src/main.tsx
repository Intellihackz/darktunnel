import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/martian-mono/wdth.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={location.pathname} />
  </StrictMode>
);
// A built page arrives with its markup already in place; the dev server sends an empty shell.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
