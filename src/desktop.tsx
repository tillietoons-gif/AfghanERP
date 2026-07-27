import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { getRouter } from "./router";
import { installAppZoom } from "./lib/app-zoom";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The desktop app could not find its root element.");
}

installAppZoom();

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);