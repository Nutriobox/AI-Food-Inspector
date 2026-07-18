# Reply to Petpooja — Item on/off (stock) webhook details

**From:** NutrioBox (Satvik) · satvik@nutriobox.com
**Re:** API access request — Live Order Updates for Nutriobox

---

Hi Malvi,

Thanks — glad the menu push for the remaining outlets is being enabled.

For the **item on/off (stock) webhook**, here is everything you need on our side. It follows the same pattern as the menu push, and our endpoint is already live.

## Endpoint (live)

```
POST  https://aifoodinspector.nutriobox.com/api/petpooja/stock
Content-Type: application/json
```

## Payload we consume (your standard item on/off format)

```json
{
  "restID":  "<outlet restID>",
  "type":    "item",              // "item" or "addon"
  "inStock": false,               // true = back in stock, false = out of stock
  "itemID":  ["<id>", "<id>"]     // one or more ids being toggled
}
```

We reply with `{"code":200,"status":"success","message":"..."}` on success (HTTP 200). Please let us know if you expect a different acknowledgement shape.

## Three things to confirm

1. **IDs must match the Push Menu.** The values in `itemID` should be the same `itemid` you send in the Push Menu (and `addongroupitemid` when `type` = `addon`). That is how we map a toggle to the correct item/add-on on our side.

2. **Source IP(s) — we authorise by IP** (no token needed). We already whitelist these from the menu push:
   `18.140.101.169, 13.215.101.248, 13.229.16.157, 18.140.106.48, 13.234.181.90, 35.154.180.221, 122.179.153.230`
   Please confirm the stock webhook will call from these same IPs, or send us the additional IP(s) so we can whitelist them.

3. **One sample first, please.** Before going live, please fire one sample for an **item** and one for an **add-on** (any outlet), so we can confirm the exact field names — exactly as we did for orders and the menu.

Thanks,
Satvik — NutrioBox
satvik@nutriobox.com
