import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { openEmbeddedYeli } from "./format/open.ts";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("YELI root element is missing");
}

const embedded = await openEmbeddedYeli();
const staticPreview = document.getElementById("yeli-static-preview");
staticPreview?.remove();

createRoot(root).render(
  <StrictMode>
    <App initialResult={embedded} />
  </StrictMode>,
);
