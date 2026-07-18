# Request to Petpooja — Menu / Item Master access (add-on prices)

**From:** NutrioBox (Satvik) · satvik@nutriobox.com
**Re:** Menu data feed for our existing order-webhook integration

---

Hi Petpooja team,

We already receive **live orders** from Petpooja via your order webhook (Save & Print push) for our 10 outlets, and it's working well. Thank you.

We now need the **menu / item master** for the same outlets — specifically each **add-on group item and its price** — so our system can read an item's real price directly from Petpooja (instead of the order payload, which sends price = 0 for combo-choice add-ons).

## What we need

The full menu for each outlet below, including:

- **Add-on groups** (`addongroups`) and their **add-on items** (`addongroupitems`), each with its **id** (`addongroupitemid`) and **price** (`addongroupitem_price`)
- (Items, categories and variations are welcome too, but add-on group items + prices are the essential part.)

The `addongroupitemid` should match the `addon_id` we already receive in the order webhook, so we can map the two.

## Preferred delivery — push to our endpoint (same as orders)

Please **push the menu** to our endpoint, using the **same secure token** you already use for our order webhook:

```
POST  https://aifoodinspector.nutriobox.com/api/petpooja/menu
Body includes:  "token": "<our existing webhook token>"
```

Please push it **once now** and then **again whenever the menu is updated** in Petpooja, so our prices always stay current.

## Alternative — Menu Fetch (pull) API

If a push isn't available, please instead share **Menu Fetch API** access:

- `app_key`, `app_secret`, `access_token`
- The exact **fetch-menu endpoint URL**

and we'll pull the menu ourselves per outlet.

## One sample first, please

Before going live, please send us **one sample menu JSON** (any one outlet) so we can confirm the exact field names on our side — exactly like we did for the order webhook.

## Our 10 outlets (restID)

| Outlet | restID |
|---|---|
| NutrioBox (DLF Phase 2) | hxv8af3b9u |
| NutrioBox (Rajinder Nagar) | 68grvqp5 |
| NutrioBox (Sector 63 Noida) | j7oy1q02 |
| NutrioBox (Dwarka) | vb1siky0 |
| NutrioBox (Janakpuri) | r6xuq8nm |
| NutrioBox (Karkardooma) | hka5vwum |
| NutrioBox (Noida) | 1by7fdz5 |
| NutrioBox (Prashant Vihar) | c3rd9f1k |
| NutrioBox (Sector 15, Gurugram) | yb4vw7h2n8 |
| NutrioBox (Shivalik) | 5n9vof7m |

Thanks,
Satvik — NutrioBox
satvik@nutriobox.com
