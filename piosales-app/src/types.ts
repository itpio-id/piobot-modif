export type DiscountType = "amount" | "percent";

export interface InvoiceItem {
  id: string;
  name: string;
  description: string;
  qty: number;
  price: number;
  discountType: DiscountType;
  discountValue: number;
}

export type PaymentStatus = "LUNAS" | "BELUM LUNAS" | "DP";

export interface Invoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO yyyy-mm-dd
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCompany: string;
  customerEmail: string;
  items: InvoiceItem[];
  totalDiscountType: DiscountType;
  totalDiscountValue: number;
  notes: string;
  warrantyNote: string;
  status: PaymentStatus;
  dpAmount: number;
  createdAt: string;
  updatedAt: string;
}

export function discountAmount(base: number, type: DiscountType, value: number): number {
  const safeBase = Math.max(0, base);
  const safeValue = Math.max(0, Number(value) || 0);
  if (type === "percent") return Math.min(safeBase, (safeBase * Math.min(safeValue, 100)) / 100);
  return Math.min(safeBase, safeValue);
}

export function invoiceItemSubtotal(item: Pick<InvoiceItem, "qty" | "price">): number {
  return Math.max(0, item.qty * item.price);
}

export function invoiceItemDiscount(item: InvoiceItem): number {
  return discountAmount(invoiceItemSubtotal(item), item.discountType, item.discountValue);
}

export function invoiceItemTotal(item: InvoiceItem): number {
  return invoiceItemSubtotal(item) - invoiceItemDiscount(item);
}

export function invoiceSubtotal(inv: Pick<Invoice, "items">): number {
  return inv.items.reduce((sum, item) => sum + invoiceItemSubtotal(item), 0);
}

export function invoiceItemDiscountTotal(inv: Pick<Invoice, "items">): number {
  return inv.items.reduce((sum, item) => sum + invoiceItemDiscount(item), 0);
}

export function invoiceAfterItemDiscount(inv: Pick<Invoice, "items">): number {
  return Math.max(invoiceSubtotal(inv) - invoiceItemDiscountTotal(inv), 0);
}

export function invoiceTotalDiscount(inv: Pick<Invoice, "items" | "totalDiscountType" | "totalDiscountValue">): number {
  return discountAmount(invoiceAfterItemDiscount(inv), inv.totalDiscountType, inv.totalDiscountValue);
}

export function invoiceTotal(inv: Pick<Invoice, "items" | "totalDiscountType" | "totalDiscountValue">): number {
  return Math.max(invoiceAfterItemDiscount(inv) - invoiceTotalDiscount(inv), 0);
}

export function invoiceDue(inv: Pick<Invoice, "items" | "totalDiscountType" | "totalDiscountValue" | "status" | "dpAmount">): number {
  const total = invoiceTotal(inv);
  if (inv.status === "LUNAS") return 0;
  if (inv.status === "DP") return Math.max(total - (inv.dpAmount || 0), 0);
  return total;
}

export function emptyItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    qty: 1,
    price: 0,
    discountType: "amount",
    discountValue: 0,
  };
}

export function emptyInvoice(invoiceNo: string): Invoice {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(),
    invoiceNo,
    invoiceDate: iso(today),
    dueDate: iso(due),
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerCompany: "",
    customerEmail: "",
    items: [emptyItem()],
    totalDiscountType: "amount",
    totalDiscountValue: 0,
    notes: "",
    warrantyNote: "Garansi Sparepart 1 Bulan diluar kerusakan Software",
    status: "BELUM LUNAS",
    dpAmount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
