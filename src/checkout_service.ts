import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { checkoutBody, GatewayCommerceAI, processOrder } from "./order_workflow.js";

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const ai = new GatewayCommerceAI();
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/orders/complete") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const order = checkoutBody.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(response, 200, await processOrder(order, ai));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid checkout body" });
      return;
    }
    console.error(error);
    send(response, 502, { error: "Order processing failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Checkout service listening on http://localhost:${port}`));
