const response = await fetch("http://localhost:3000/orders/complete", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    orderId: "ord_creator_1042",
    customerName: "Mina",
    items: [{ title: "Studio Lighting Field Guide", quantity: 1 }],
    fulfillment: {
      carrier: "Parcel Post",
      trackingNumber: "PP-8041",
      status: "shipped",
    },
  }),
});

if (!response.ok) throw new Error(`Checkout service returned HTTP ${response.status}`);
console.log(await response.json());

export {};
