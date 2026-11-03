export type UserRole = 'admin' | 'shop' | 'delivery';

export interface User {
  id: string;
  name: string;
  email_or_phone: string;
  role: UserRole;
  shop_id: string | null;
  service_area_id: string | null;
  shop_name?: string | null;
  area_name?: string | null;
  status: 'active' | 'inactive';
  is_online: number;
  is_busy: number;
  last_heartbeat: string | null;
  created_at?: string;
  active_jobs_count?: number;
}

export interface ServiceArea {
  id: string;
  name: string;
  pincode: string;
  city: string;
  created_at: string;
}

export interface Shop {
  id: string;
  name: string;
  code: string;
  service_area_id: string | null;
  area_name?: string | null;
  address: string;
  phone: string;
  gst_number: string | null;
  upi_id: string | null;
  total_orders?: number;
  staff_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ClothingCategory {
  id: string;
  name: string;
  name_mr?: string | null;
  default_rate: number;
  unit: string;
  is_active: number;
  sort_order: number;
}

export interface Customer {
  id: string;
  shop_id: string | null;
  shop_name?: string | null;
  name: string;
  mobile: string;
  email: string | null;
  pickup_address: string;
  delivery_address: string;
  area: string;
  building_name: string | null;
  flat_number: string | null;
  notes: string | null;
  total_orders?: number;
  total_due?: number;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 
  | 'pending'
  | 'created'
  | 'assigned'
  | 'pickup_started'
  | 'arriving'
  | 'picked_up'
  | 'received_at_shop'
  | 'in_processing'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'rescheduled'
  | 'cancelled';

export interface OrderItem {
  id?: string;
  order_id?: string;
  category_id?: string | null;
  item_name: string;
  quantity: number;
  rate: number;
  line_total: number;
  unit?: 'piece' | 'kg' | 'sq_ft' | string;
  weight_kg?: number | null;
  weight_display?: string | null;
  sq_ft?: number | null;
  sq_ft_length?: number | null;
  sq_ft_width?: number | null;
  notes?: string | null;
}

export interface OrderPhoto {
  id: string;
  order_id: string;
  photo_type: 'bag' | 'clothes' | 'pickup' | string;
  file_path: string;
  file_url: string;
  caption?: string | null;
  uploaded_by_user_id: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  shop_id: string;
  shop_name?: string;
  shop_phone?: string;
  shop_address?: string;
  shop_gst?: string | null;
  shop_upi?: string | null;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string | null;
  flat_number?: string | null;
  building_name?: string | null;
  pickup_address: string;
  delivery_address: string;
  area: string;
  pickup_date: string;
  pickup_time_slot: string | null;
  assigned_delivery_boy_id: string | null;
  delivery_boy_name?: string | null;
  delivery_boy_phone?: string | null;
  assigned_at: string | null;
  assigned_by_user_id: string | null;
  status: OrderStatus;
  special_instructions: string | null;
  subtotal: number;
  delivery_charge: number;
  tax_amount: number;
  discount_amount: number;
  final_total: number;
  amount_paid: number;
  outstanding_amount: number;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  expected_payment_date?: string | null;
  credit_notes?: string | null;
  delivery_type?: 'standard' | 'credit' | string;
  pickup_weight_kg?: number | null;
  pickup_weight_grams?: number | null;
  pickup_weight_total_grams?: number | null;
  pickup_weight_rate?: number | null;
  pickup_photos?: string | string[];
  photos?: OrderPhoto[];
  has_bag_photo?: number;
  has_clothes_photo?: number;
  items_count?: number;
  order_type?: 'pickup' | 'delivery';
  invoice_number?: string | null;
  old_customer_due_at_order?: number;
  pickup_proof_notes?: string | null;
  clothes_summary?: string | null;
  iron_count?: number;
  dryclean_count?: number;
  wash_count?: number;
  total_pieces?: number;
  items?: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number?: string;
  order_status?: string;
  shop_id: string;
  shop_name?: string;
  shop_phone?: string;
  shop_address?: string;
  shop_gst?: string | null;
  shop_upi?: string | null;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string | null;
  pickup_address?: string;
  delivery_address?: string;
  customer_area?: string;
  pickup_weight_display?: string | null;
  photos?: OrderPhoto[];
  flat_number?: string | null;
  building_name?: string | null;
  date: string;
  pickup_date?: string;
  subtotal: number;
  delivery_charge: number;
  tax_amount: number;
  discount_amount: number;
  final_total: number;
  amount_paid: number;
  outstanding_balance: number;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  expected_payment_date?: string | null;
  credit_notes?: string | null;
  delivery_type?: string | null;
  previous_due?: number;
  total_with_previous_due?: number;
  items?: OrderItem[];
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  invoice_id: string | null;
  customer_id: string;
  shop_id: string;
  amount: number;
  payment_method: 'cash' | 'upi' | 'card' | 'bank_transfer';
  transaction_reference: string | null;
  collected_by_delivery_boy_id: string | null;
  collected_by_name?: string | null;
  recorded_by_user_id?: string | null;
  recorded_by_name?: string | null;
  is_credit_settlement?: number;
  is_settled_with_shop: number;
  settlement_id: string | null;
  notes: string | null;
  order_number?: string;
  customer_name?: string;
  created_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  date: string;
  type: 'order' | 'payment';
  reference_no: string;
  order_id?: string;
  description: string;
  debit: number;
  credit: number;
  balance_after: number;
  status?: string;
  payment_status?: string;
  expected_payment_date?: string | null;
  delivery_type?: string | null;
  collected_by?: string | null;
}

export interface CustomerLedgerSummary {
  customer: Customer;
  total_orders_count: number;
  total_billed_amount: number;
  total_paid_amount: number;
  total_outstanding_due: number;
  overdue_bills_count: number;
  overdue_bills_amount: number;
  unpaid_orders: Order[];
  entries: CustomerLedgerEntry[];
}

export interface ShopSettlement {
  id: string;
  settlement_number: string;
  shop_id: string;
  shop_name?: string;
  delivery_boy_id: string;
  delivery_boy_name?: string;
  amount_collected: number;
  amount_settled: number;
  remaining_unsettled: number;
  confirmed_by_user_id: string;
  confirmed_by_name?: string;
  notes: string | null;
  created_at: string;
}

export interface DuePaymentItem {
  invoice_id: string;
  invoice_number: string;
  date: string;
  final_total: number;
  amount_paid: number;
  outstanding_balance: number;
  order_id: string;
  order_number: string;
  order_status: OrderStatus;
  pickup_date: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_area: string;
  flat_number: string | null;
  building_name: string | null;
  shop_id: string;
  shop_name: string;
  delivery_boy_id: string | null;
  delivery_boy_name: string | null;
  expected_payment_date?: string | null;
  credit_notes?: string | null;
  delivery_type?: string | null;
  previous_unpaid_due?: number;
  total_customer_due?: number;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  user_role?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | null;
  created_at: string;
}

export interface DashboardStats {
  role: UserRole;
  // Admin stats
  totalShops?: number;
  onlineBoys?: number;
  availableBoys?: number;
  todayPickups?: number;
  todayDeliveries?: number;
  pendingOrders?: number;
  totalOutstanding?: number;
  todayCollections?: number;
  pendingSettlements?: number;
  overdueDuesCount?: number;
  overdueDuesAmount?: number;
  todayCollectionsList?: Array<{
    id: string;
    amount: number;
    payment_method: string;
    customer_name: string;
    order_number: string;
    collected_by: string;
    created_at: string;
  }>;
  // Shop stats
  todayOrders?: number;
  assignedBoys?: number;
  pendingDeliveries?: number;
  generatedInvoices?: number;
  outstandingDue?: number;
  collectionsToday?: number;
  // Delivery boy stats
  assignedPickups?: number;
  assignedDeliveries?: number;
  pendingTasks?: number;
  amountToCollect?: number;
  amountCollectedToday?: number;
  awaitingSettlement?: number;
  is_online?: number;
  is_busy?: number;
}
