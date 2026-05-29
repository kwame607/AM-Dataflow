# ADMUNZ — Three Fixes

## Fix 1: Auto-populate Telecel prices for all existing agents
File: auto-telecel-agent-prices.sql

Run this ONCE in Supabase SQL Editor (supabase.com → your project → SQL Editor).
It inserts Telecel bundle rows for every active agent at the admin floor price.
Agents can then go to "My Prices" to adjust their Telecel markup.

After running, ALL existing agent stores will immediately show Telecel bundles.


## Fix 2: Telecel logo on stores
File: components/ui/NetworkLogo.tsx  ← replace existing file

ALSO: Copy your telecel.png logo into your /public folder
(same place as mtn.png and at.jpg).

The logo file must be named exactly: telecel.png
Resolution: 100×100px or larger, PNG with transparent background works best.

If you don't have a telecel.png yet, the stores will show a blue "TCEL"
placeholder badge automatically — no errors.


## Fix 3: "Hubnet Balance" → "XpresPortal Balance" in admin dashboard
File: app/xena-173424/page.tsx  ← edit in VS Code

Open the file, press Ctrl+H (Win) or Cmd+H (Mac), then:

  FIND:    Hubnet Balance
  REPLACE: XpresPortal Balance
  → Click "Replace All"

Then also:
  FIND:    Available to fulfil orders  
  REPLACE: Available to place orders
  → Click "Replace"

Save the file. That's it.


## Order of operations
1. Run the SQL in Supabase first
2. Copy telecel.png into /public
3. Copy NetworkLogo.tsx into components/ui/
4. Edit admin page labels (Ctrl+H)
5. npm run dev to test locally
6. git push to deploy
