import { describe, expect, it } from "vitest";
import { processOrder, type CommerceAI, type CheckoutBody } from "../src/order_workflow.js";

const order: CheckoutBody = {
  orderId: "ord_creator_1042",
  customerName: "Mina",
  items: [{ title: "Studio Lighting Field Guide", quantity: 1 }],
  fulfillment: { carrier: "Parcel Post", trackingNumber: "PP-8041", status: "shipped" },
};

describe("fulfillment evidence decision", () => {
  it("holds an update for review when its evidence meaning diverges", async () => {
    const ai: CommerceAI = {
      async writeOrderCopy() {
        return { receipt: "Receipt for one field guide.", customerUpdate: "Your order was delivered." };
      },
      async embed() {
        return [[1, 0], [0, 1]];
      },
    };

    const result = await processOrder(order, ai);

    expect(result.state).toBe("needs_review");
    expect(result.evidenceScore).toBe(0);
  });
});
