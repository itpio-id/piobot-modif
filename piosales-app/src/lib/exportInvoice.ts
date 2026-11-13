const A5_MM = { width: 148, height: 210 };

async function renderCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  // html2canvas-pro (not the original html2canvas) — the original can't parse the
  // oklch()/color-mix() colors Tailwind v4 generates and throws on export.
  const { default: html2canvas } = await import("html2canvas-pro");
  return html2canvas(node, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

export async function exportInvoiceAsJpg(node: HTMLElement, filename: string) {
  const canvas = await renderCanvas(node);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".jpg") ? filename : `${filename}.jpg`;
  a.click();
}

async function createPdf(node: HTMLElement) {
  const [canvas, { default: jsPDF }] = await Promise.all([renderCanvas(node), import("jspdf")]);
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [A5_MM.width, A5_MM.height],
  });
  pdf.addImage(imgData, "JPEG", 0, 0, A5_MM.width, A5_MM.height, undefined, "FAST");
  return pdf;
}

export async function createInvoicePdfBlob(node: HTMLElement): Promise<Blob> {
  const pdf = await createPdf(node);
  return pdf.output("blob");
}

export async function exportInvoiceAsPdf(node: HTMLElement, filename: string) {
  const pdf = await createPdf(node);
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
