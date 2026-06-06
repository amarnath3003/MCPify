// ─────────────────────────────────────────────────────────────────────────────
// examples/ecommerce-saas/src/services/orders.ts
//
// Example backend service that MCPify will analyze and turn into MCP tools.
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'processing' | 'fulfilled' | 'cancelled' | 'refunded';

export interface Order {
  id:         string;
  customerId: string;
  status:     OrderStatus;
  total:      number;
  items:      OrderItem[];
  createdAt:  Date;
}

export interface OrderItem {
  productId: string;
  quantity:  number;
  price:     number;
}

// ── Read operations (will be classified SAFE) ─────────────────────────────────

/**
 * Retrieves a single order by its ID.
 * @param orderId - The unique order identifier
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  // Implementation: query database
  return null;
}

/**
 * Lists all orders with an optional status filter and pagination.
 * @param status  - Filter by order status
 * @param limit   - Max number of results
 * @param offset  - Pagination offset
 */
export async function getOrdersByStatus(
  status: OrderStatus,
  limit:  number = 20,
  offset: number = 0
): Promise<Order[]> {
  return [];
}

/**
 * Returns the total count of orders grouped by status.
 */
export async function countOrdersByStatus(): Promise<Record<OrderStatus, number>> {
  return { pending: 0, processing: 0, fulfilled: 0, cancelled: 0, refunded: 0 };
}

/**
 * Searches orders by customer email or name.
 */
export async function searchOrders(query: string): Promise<Order[]> {
  return [];
}

// ── Mutating operations (will be classified REQUIRES_CONFIRMATION) ─────────────

/**
 * Issues a full or partial refund for an order.
 * @param orderId - The order to refund
 * @param amount  - Amount to refund in cents; omit for full refund
 */
export async function refundOrder(orderId: string, amount?: number): Promise<void> {
  // Implementation: process refund via payment gateway
}

/**
 * Cancels a pending or processing order.
 * @param orderId - The order to cancel
 * @param reason  - Reason for cancellation
 */
export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  // Implementation: cancel order
}

/**
 * Updates the fulfillment status of an order.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  // Implementation: update status
}

/**
 * Assigns an order to a fulfilment agent.
 */
export async function assignOrderToAgent(orderId: string, agentId: string): Promise<void> {
  // Implementation
}
