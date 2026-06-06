// examples/ecommerce-saas/src/components/AdminDashboard.tsx
// MCPify will extract: refundOrder, approveRequest, publishContent,
//                      createSupportRequest, exportData, searchItems

import React, { useState } from 'react';

interface AdminDashboardProps {
  onRefund:          (orderId: string) => void;
  onApprove:         (requestId: string) => void;
  onReject:          (requestId: string) => void;
  onPublish:         () => void;
  onExport:          () => void;
  onSearch:          (query: string) => void;
  onCreateTicket:    () => void;
  onSendMessage:     (userId: string) => void;
  onInviteUser:      () => void;
  onDeleteRecord:    (id: string) => void;
}

export function AdminDashboard({
  onRefund, onApprove, onReject, onPublish,
  onExport, onSearch, onCreateTicket, onSendMessage, onInviteUser, onDeleteRecord,
}: AdminDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('order_001');

  return (
    <div className="admin-dashboard">
      <header>
        <h1>Admin Dashboard</h1>

        {/* MCPify extracts: searchItems */}
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search orders, customers…"
        />
        <button onClick={() => onSearch(searchQuery)}>Search</button>
      </header>

      <section className="orders-panel">
        <h2>Orders</h2>

        {/* MCPify extracts: refundOrder */}
        <button onClick={() => onRefund(selectedOrder)}>
          Refund
        </button>

        {/* MCPify extracts: exportData */}
        <button onClick={onExport}>
          Export CSV
        </button>
      </section>

      <section className="approval-panel">
        <h2>Pending Approvals</h2>

        {/* MCPify extracts: approveRequest */}
        <button onClick={() => onApprove('req_001')}>
          Approve
        </button>

        {/* MCPify extracts: rejectRequest */}
        <button onClick={() => onReject('req_001')}>
          Reject
        </button>
      </section>

      <section className="content-panel">
        <h2>Content</h2>

        {/* MCPify extracts: publishContent */}
        <button onClick={onPublish}>
          Publish
        </button>
      </section>

      <section className="support-panel">
        <h2>Support</h2>

        {/* MCPify extracts: createSupportRequest */}
        <button onClick={onCreateTicket}>
          Submit Support Ticket
        </button>

        {/* MCPify extracts: sendMessage */}
        <button onClick={() => onSendMessage('user_001')}>
          Send Message
        </button>
      </section>

      <section className="team-panel">
        <h2>Team</h2>

        {/* MCPify extracts: inviteUser */}
        <button onClick={onInviteUser}>
          Invite User
        </button>

        {/* MCPify extracts: deleteRecord */}
        <button onClick={() => onDeleteRecord('record_001')}>
          Delete
        </button>
      </section>
    </div>
  );
}
