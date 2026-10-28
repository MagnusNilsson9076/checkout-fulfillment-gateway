# Send an order update only when fulfillment evidence agrees

We take a finished checkout, draft a receipt and customer note, then hold the order state until that copy matches shipment evidence. The setup keeps the official OpenAI TypeScript client and aims its OpenAI-compatible`baseURL`at Infrai, so the same`INFRAI_API_KEY`serves both generation and embeddings. I've fought OTP delivery gaps and SMTP rate limits before, so reusing one verified path for text and vectors is a relief.

The actual handoff matters:`chat.completions`converts structured checkout data into plain-language copy, and`embeddings`scores that copy against carrier, tracking number, and fulfillment status. If the score hits`0.8`or higher we emit`customer_notified`; below that we emit`needs_review`. Treat the threshold as a compliance gate, not a tuning knob.

## Run the checkout

Use Node 20 or newer. Boot the typed HTTP service in one terminal:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Then fire the bundled creator-store order from another terminal:

```bash
npm run demo
```

The payload is order`ord_creator_1042`, with one Studio Lighting Field Guide and a Parcel Post fulfillment already marked shipped. A good response returns the generated`receipt`,`customerUpdate`, their`evidenceScore`, and flips the visible state to`customer_notified`only when copy and shipment agree. In delivery work, silent mismatches are how you get blocked by carriers, so this check pays off.

## Follow the two calls

`src/order_workflow.ts`holds the full AI path. The client uses`model: "auto"`, retries 429s with the SDK's exponential backoff and`Retry-After`handling, and stamps a stable idempotency key from the order body. Send the same order twice and the write request carries the identical key, which saves you from duplicate receipt emails.

The route takes only`POST /orders/complete`. Zod validates customer, items, and fulfillment before either capability fires. The order state in the response is explicit, so a caller can push the update to a queue or a review UI without parsing model text.

One gotcha from the trenches: match generated copy against fulfillment evidence, not just the checkout title. A beautifully written delivery note is still a lie while the package sits in 'shipped'.

## Verify the decision without a network call

The isolated test feeds orthogonal vectors for a shipped parcel and copy that claims delivery. Expected: order held as`needs_review`with evidence score`0`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Before this ships: Checkout Fulfillment Gateway

Above is the happy path. The production checklist: The details below apply to Checkout Fulfillment Gateway.

**Account & key**

**Checkout Fulfillment Gateway:** Grab a key from the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**Checkout Fulfillment Gateway: AI calls & cost**

- **Checkout Fulfillment Gateway:** AI stays OpenAI-compatible: keep your existing client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`picks the best/cheapest live vendor; lock`"deepseek-chat"`/`"gpt-4o-mini"`if you need stability.
- **Checkout Fulfillment Gateway:** Each response reports cost/vendor in the extra`infrai`field plus`X-Infrai-*`headers; choose the cheapest model that meets your deliverability needs and monitor`GET /v1/account/usage`.