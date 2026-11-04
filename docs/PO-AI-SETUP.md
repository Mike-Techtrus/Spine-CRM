# Switching on "Check with AI" for POs

The **Check with AI** button on a sales order's PO copy sends the PO to Claude (Anthropic's AI), which reads the PO number, date and values. Spine then compares them with the quote. Nothing changes on the sales order until someone presses **Use these figures** and saves.

It needs an Anthropic API key. Mike adds this himself. Never paste the key into chat, code or GitHub.

## 1. Get an API key

1. Go to **console.anthropic.com** and sign in or sign up with a Techtrus email.
2. **Billing**: add a company card and buy some credit (£10 lasts a long time). Turn on a monthly spend limit if you want a cap.
3. **API keys** → **Create key**, name it `spine-read-po`, and copy it. It's shown only once.

## 2. Put the key into Supabase

1. Open Supabase → project **Spine CRM** → **Edge Functions** → **Secrets**.
2. Add a new secret with name `ANTHROPIC_API_KEY` and paste the key as the value.
3. Press **Save**.

## 3. Deploy the function

Claude can deploy `supabase/functions/read-po` for you through the Supabase connector. Just say yes when asked.

## Cost and privacy

- The model is Claude Opus 5.5. A one or two page PO costs roughly 2–5p to read.
- **Read again** reads the PO again and costs the same again. Otherwise the last reading is saved on the file, and opening the sales order costs nothing.
- The PO file goes to Anthropic's API only when someone presses the button. Anthropic doesn't train on API data.
- To switch it off, delete the `ANTHROPIC_API_KEY` secret. The button then shows "isn't switched on yet".
