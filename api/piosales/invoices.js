const { requireRole } = require("../_lib/auth");
const { supabaseRequest } = require("../_lib/integrations");

function invoiceFromRow(row, rows) {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    customerAddress: row.customer_address || "",
    customerCompany: row.customer_company || "",
    customerEmail: row.customer_email || "",
    items: (rows || []).sort((a, b) => a.line_no - b.line_no).map(item => ({
      id: String(item.line_no), name: item.item_name || "", description: item.description || "",
      qty: Number(item.qty), price: Number(item.unit_price),
      discountType: item.discount_type === "percent" ? "percent" : "amount", discountValue: Number(item.discount_value || 0)
    })),
    totalDiscountType: row.total_discount_type === "percent" ? "percent" : "amount",
    totalDiscountValue: Number(row.total_discount_value || 0), notes: row.notes || "",
    warrantyNote: row.warranty_note || "", status: row.status, dpAmount: Number(row.dp_amount || 0),
    createdAt: row.created_at, updatedAt: row.updated_at || row.created_at
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  if (!await requireRole(req, res, ["owner"])) return;
  try {
    if (req.method === "GET") {
      const rows = await supabaseRequest("piosales_invoices?select=*&order=created_at.desc&limit=250");
      if (!rows || !rows.length) return res.status(200).json({ items: [] });
      const ids = rows.map(row => row.id).filter(id => /^[0-9a-f-]{36}$/i.test(String(id)));
      const itemRows = ids.length
        ? await supabaseRequest("piosales_invoice_items?select=*&invoice_id=in.(" + ids.join(",") + ")")
        : [];
      const byInvoice = new Map();
      for (const item of itemRows || []) byInvoice.set(item.invoice_id, [...(byInvoice.get(item.invoice_id) || []), item]);
      return res.status(200).json({ items: rows.map(row => invoiceFromRow(row, byInvoice.get(row.id))) });
    }
    if (req.method === "POST") {
      const invoice = req.body || {};
      if (!/^[0-9a-f-]{36}$/i.test(String(invoice.id || "")) || !String(invoice.invoiceNo || "").trim()) {
        return res.status(400).json({ error: "Data invoice tidak valid." });
      }
      if (!Array.isArray(invoice.items) || invoice.items.length > 100) return res.status(400).json({ error: "Daftar barang invoice tidak valid." });
      await supabaseRequest("rpc/save_piosales_invoice", {
        method: "POST",
        body: JSON.stringify({ payload: invoice })
      });
      return res.status(200).json({ ok: true });
    }
    const id = String(req.query && req.query.id || new URL(req.url, "https://itpioassistv2.vercel.app").searchParams.get("id") || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "ID invoice tidak valid." });
    await supabaseRequest("rpc/delete_piosales_invoice", { method: "POST", body: JSON.stringify({ p_invoice_id: id }) });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("PioSales backend unavailable", error && error.status || error && error.name || "unknown");
    if (error && error.status === 404) return res.status(503).json({ error: "Migrasi privasi Supabase belum dijalankan." });
    return res.status(503).json({ error: error && error.message || "PioSales belum tersambung ke database server." });
  }
};
