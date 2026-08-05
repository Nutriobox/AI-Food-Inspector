#!/bin/bash
# Test the NutrioBox WMS PACT webhook without Postman - just curl.
# Edit HOST to your real WMS host, then run:  bash test-pact-webhook.sh
# Or send one event:  bash test-pact-webhook.sh STOCK_RECEIPT

HOST="https://aifoodinspector.nutriobox.com"   # the NutrioBox app (or kds.nutriobox.com)
TOKEN="ntbx_whk_587231a06c77c733d51e1326f3d4212dd0db2936d3948e2e"
URL="$HOST/api/vouchers/pact-webhook"

send () {
  local event="$1" body="$2"
  echo ">> $event"
  curl -s -o - -w "\n   HTTP %{http_code}\n" -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$body"
  echo
}

only="$1"
run () { [ -z "$only" ] || [ "$only" = "$1" ]; }

run PMR && send PMR '{"event":"PMR","voucher_no":"PMR-0001","voucher_date":"2026-08-05","warehouse":"WH-NOIDA","items":[{"sku":"RM-001","name":"Raw material","quantity":100,"unit":"kg"}],"source_system":"PACT"}'
run STOCK_RECEIPT && send STOCK_RECEIPT '{"event":"STOCK_RECEIPT","voucher_no":"SR-0001","voucher_date":"2026-08-05","warehouse":"WH-NOIDA","reference_no":"PO-0001","items":[{"sku":"RM-001","name":"Raw material","quantity":100,"unit":"kg","batch":"B-2026-08"}],"source_system":"PACT"}'
run ISSUE_TO_PRODUCTION && send ISSUE_TO_PRODUCTION '{"event":"ISSUE_TO_PRODUCTION","voucher_no":"ITP-0001","voucher_date":"2026-08-05","warehouse":"WH-NOIDA","production_order":"PO-PROD-0001","items":[{"sku":"RM-001","name":"Raw material","quantity":50,"unit":"kg"}],"source_system":"PACT"}'
run WIP && send WIP '{"event":"WIP","voucher_no":"WIP-0001","voucher_date":"2026-08-05","production_order":"PO-PROD-0001","stage":"MIXING","items":[{"sku":"WIP-001","name":"Semi-finished","quantity":48,"unit":"kg"}],"source_system":"PACT"}'
run FG_RECEIPT && send FG_RECEIPT '{"event":"FG_RECEIPT","voucher_no":"FG-0001","voucher_date":"2026-08-05","warehouse":"FG-STORE-NOIDA","production_order":"PO-PROD-0001","items":[{"sku":"FG-001","name":"Finished product","quantity":200,"unit":"pcs","batch":"FG-2026-08"}],"source_system":"PACT"}'
run SECONDARY && send SECONDARY '{"event":"SECONDARY","voucher_no":"SEC-0001","voucher_date":"2026-08-05","warehouse":"FG-STORE-NOIDA","items":[{"sku":"FG-001","name":"Finished product","quantity":200,"unit":"pcs"}],"source_system":"PACT"}'
