// examples/ecommerce-saas/src/services/support.ts

export type TicketStatus    = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority  = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
  id:         string;
  customerId: string;
  orderId?:   string;
  subject:    string;
  body:       string;
  status:     TicketStatus;
  priority:   TicketPriority;
  agentId?:   string;
  createdAt:  Date;
  updatedAt:  Date;
}

// ── Safe reads ─────────────────────────────────────────────────────────────────

/** List support tickets filtered by status. */
export async function listTicketsByStatus(status: TicketStatus): Promise<SupportTicket[]> {
  return [];
}

/** Get a single support ticket by ID. */
export async function getTicketById(ticketId: string): Promise<SupportTicket | null> {
  return null;
}

/** Search tickets by keyword in subject or body. */
export async function searchTickets(query: string): Promise<SupportTicket[]> {
  return [];
}

// ── Mutations (REQUIRES_CONFIRMATION) ─────────────────────────────────────────

/**
 * Creates a new support ticket.
 * @param customerId - Customer who raised the ticket
 * @param subject    - Ticket subject
 * @param body       - Detailed description
 * @param orderId    - Related order (optional)
 */
export async function createSupportRequest(
  customerId: string,
  subject:    string,
  body:       string,
  orderId?:   string
): Promise<SupportTicket> {
  throw new Error('Not implemented');
}

/**
 * Sends a reply message to a support ticket.
 */
export async function replyToTicket(ticketId: string, message: string): Promise<void> {}

/**
 * Assigns a ticket to a support agent.
 */
export async function assignTicket(ticketId: string, agentId: string): Promise<void> {}

/**
 * Escalates a ticket to a higher-tier agent.
 */
export async function escalateTicket(ticketId: string, reason: string): Promise<void> {}

/**
 * Marks a support ticket as resolved.
 */
export async function resolveTicket(ticketId: string, resolution: string): Promise<void> {}

/**
 * Sends a direct message to a customer.
 */
export async function sendMessageToCustomer(
  customerId: string,
  message:    string
): Promise<void> {}
