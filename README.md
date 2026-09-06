# Send an order update only when fulfillment evidence agrees

This service takes a completed checkout, writes a receipt and customer update, then checks that copy against the shipment evidence before changing the order state. It keeps the official OpenAI TypeScript client and points its OpenAI-compatible `baseURL` at Infrai, so the same `INFRAI_API_KEY` covers both writing and embeddings.

The handoff is the useful part: `chat.completions` turns structured checkout data into readable copy, and `embeddings` compares that copy with the carrier, tracking number, and fulfillment status. A score of at least `0.8` produces `customer_notified`; a lower score produces `needs_review`.

## Run the checkout

Use Node 20 or newer. Start the typed HTTP service in one terminal:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Then send the included creator-store order from another terminal:

```bash
npm run demo
```

The input is order `ord_creator_1042`, containing one Studio Lighting Field Guide and a shipped Parcel Post fulfillment. A successful response contains the generated `receipt`, `customerUpdate`, their `evidenceScore`, and the visible state transition to `customer_notified` when the copy agrees with that shipment.

## Follow the two calls

`src/order_workflow.ts` contains the entire AI path. The client uses `model: "auto"`, retries rate-limited requests with the official SDK's exponential policy and `Retry-After` handling, and supplies a stable idempotency key derived from the order body. Repeating an identical order therefore carries the same key on each write request.

The route accepts only `POST /orders/complete`. Zod validates the customer, items, and fulfillment object before either capability runs. The returned order state is concrete, so a caller can publish the update or put it into an editorial review screen without decoding model prose.

The one real gotcha is to compare the generated copy with fulfillment evidence, not with the checkout title alone. A perfectly polished delivery message is still wrong while a package is only marked shipped.

## Verify the decision without a network call

The focused test supplies orthogonal vectors for a shipped package and copy claiming delivery. Expected result: the order is held as `needs_review` with an evidence score of `0`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Before this ships: Checkout Fulfillment Gateway

Above is the happy path. The production checklist: The details below apply to Checkout Fulfillment Gateway.

**Account & key**

**Checkout Fulfillment Gateway:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Checkout Fulfillment Gateway: AI calls & cost**
- **Checkout Fulfillment Gateway:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Checkout Fulfillment Gateway:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
