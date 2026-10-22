import { toCanvas } from "html-to-image";
import { encodeTiff } from "./tiff";

export async function downloadStatistic(element: HTMLElement, filename: string) {
  await document.fonts.ready;
  let backgroundColor = "#ffffff";
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const color = getComputedStyle(ancestor).backgroundColor;
    if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
      backgroundColor = color;
      break;
    }
  }
  // html-to-image deep-clones SVGs without resolving their descendant CSS.
  // Freeze computed styles in a separate copy, including SVG paths and local
  // custom properties, so selectors, dark mode and animations remain accurate.
  const clone = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll<HTMLElement | SVGElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement | SVGElement>("*")];
  originals.forEach((original, index) => {
    const copy = copies[index];
    const style = getComputedStyle(original);
    for (const property of Array.from(style)) {
      copy.style.setProperty(property, style.getPropertyValue(property));
    }
    copy.style.animation = "none";
    copy.style.transition = "none";
    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) copy.value = original.value;
  });
  clone.querySelectorAll("[data-export-exclude]").forEach((node) => node.remove());
  clone.style.margin = "0";
  clone.style.transform = "none";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  host.setAttribute("aria-hidden", "true");
  host.appendChild(clone);
  document.body.appendChild(host);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(clone, { pixelRatio: 2, backgroundColor });
  } finally {
    host.remove();
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Grafik konnte nicht erstellt werden");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const blob = new Blob([encodeTiff(canvas.width, canvas.height, pixels.data)], { type: "image/tiff" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
