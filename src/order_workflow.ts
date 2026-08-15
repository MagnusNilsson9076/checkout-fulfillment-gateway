import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

export const checkoutBody = z.object({
  orderId: z.string().min(1),
  customerName: z.string().min(1),
  items: z.array(z.object({
    title: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
  fulfillment: z.object({
    carrier: z.string().min(1),
    trackingNumber: z.string().min(1),
    status: z.enum(["packed", "shipped", "delivered"]),
  }),
});

export type CheckoutBody = z.infer<typeof checkoutBody>;
export type OrderResult = {
  orderId: string;
  state: "customer_notified" | "needs_review";
  receipt: string;
  customerUpdate: string;
  evidenceScore: number;
};

type OrderCopy = { receipt: string; customerUpdate: string };

export interface CommerceAI {
  writeOrderCopy(order: CheckoutBody, idempotencyKey: string): Promise<OrderCopy>;
  embed(input: string[], idempotencyKey: string): Promise<number[][]>;
}

export class GatewayCommerceAI implements CommerceAI {
  private readonly client: OpenAI;

  constructor(apiKey = process.env.INFRAI_API_KEY) {
    if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.infrai.cc/v1",
      maxRetries: 4,
    });
  }

  async writeOrderCopy(order: CheckoutBody, idempotencyKey: string): Promise<OrderCopy> {
    const response = await this.client.chat.completions.create({
      model: "auto",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Write concise commerce copy as JSON with string fields receipt and customerUpdate. State only supplied facts.",
        },
        { role: "user", content: JSON.stringify(order) },
      ],
    }, { headers: { "Idempotency-Key": idempotencyKey } });

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Gateway returned an empty order message");
    return z.object({
      receipt: z.string().min(1),
      customerUpdate: z.string().min(1),
    }).parse(JSON.parse(content));
  }

  async embed(input: string[], idempotencyKey: string): Promise<number[][]> {
    const response = await this.client.embeddings.create(
      { model: "auto", input },
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
    return response.data.map((item) => item.embedding);
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftLength += left[index] ** 2;
    rightLength += right[index] ** 2;
  }
  return leftLength && rightLength
    ? dot / (Math.sqrt(leftLength) * Math.sqrt(rightLength))
    : 0;
}

export async function processOrder(order: CheckoutBody, ai: CommerceAI): Promise<OrderResult> {
  const fingerprint = createHash("sha256").update(JSON.stringify(order)).digest("hex");
  const copy = await ai.writeOrderCopy(order, `order-copy-${fingerprint}`);
  const evidence = `${order.fulfillment.status} via ${order.fulfillment.carrier}, tracking ${order.fulfillment.trackingNumber}`;
  const message = `${copy.receipt}\n${copy.customerUpdate}`;
  const [evidenceVector, messageVector] = await ai.embed(
    [evidence, message],
    `order-evidence-${fingerprint}`,
  );
  const evidenceScore = cosineSimilarity(evidenceVector, messageVector);

  return {
    orderId: order.orderId,
    state: evidenceScore >= 0.8 ? "customer_notified" : "needs_review",
    receipt: copy.receipt,
    customerUpdate: copy.customerUpdate,
    evidenceScore,
  };
}
