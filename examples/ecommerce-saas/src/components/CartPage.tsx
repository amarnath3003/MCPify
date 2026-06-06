// examples/ecommerce-saas/src/components/CartPage.tsx
// MCPify will extract: checkoutCart, addItemToCart, applyDiscountCode

import React, { useState } from 'react';

interface CartItem {
  id:       string;
  name:     string;
  price:    number;
  quantity: number;
}

interface CartPageProps {
  items:          CartItem[];
  onCheckout:     () => void;
  onRemoveItem:   (id: string) => void;
  onApplyCoupon:  (code: string) => void;
}

export function CartPage({ items, onCheckout, onRemoveItem, onApplyCoupon }: CartPageProps) {
  const [coupon, setCoupon] = useState('');
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="cart-page">
      <h1>Your Cart</h1>
      {items.map(item => (
        <div key={item.id} className="cart-item">
          <span>{item.name}</span>
          <span>${item.price}</span>
          {/* MCPify extracts: removeItemFromCart */}
          <button onClick={() => onRemoveItem(item.id)}>Remove</button>
        </div>
      ))}

      <div className="coupon-section">
        <input
          value={coupon}
          onChange={e => setCoupon(e.target.value)}
          placeholder="Coupon code"
        />
        {/* MCPify extracts: applyDiscountCode */}
        <button onClick={() => onApplyCoupon(coupon)}>Apply Coupon</button>
      </div>

      <div className="cart-total">Total: ${total.toFixed(2)}</div>

      {/* MCPify extracts: checkoutCart */}
      <button onClick={onCheckout} className="btn-primary">
        Checkout
      </button>
    </div>
  );
}
