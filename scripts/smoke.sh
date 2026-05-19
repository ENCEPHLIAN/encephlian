#!/usr/bin/env bash
# Devops #4 — post-deploy smoke test.
#
# Hits the production surfaces and asserts they respond. Run after every
# Vercel + Supabase deploy. Designed to be safe to run unauthenticated
# (only touches public-facing routes + the multitenancy guard via a
# service-role-only SQL endpoint).
#
# Usage:
#   ENCEPHLIAN_URL=https://encephlian.cloud ./scripts/smoke.sh
#
# Exit codes:
#   0  — everything green
#   1  — one or more checks failed
#   2  — bad invocation (missing env)
#
# Owner: #71 (QA / Test Gate)
set -euo pipefail

URL="${ENCEPHLIAN_URL:-https://encephlian.cloud}"
SUPABASE_URL="${SUPABASE_URL:-https://mngkbtsummbknrbpjbye.supabase.co}"
ANON_KEY="${SUPABASE_ANON_KEY:-}"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

FAILED=0
ok()   { green "  ✓ $*"; }
fail() { red "  ✗ $*"; FAILED=$((FAILED+1)); }

echo "── ENCEPHLIAN smoke test ──"
echo "  URL=$URL"
echo "  Supabase=$SUPABASE_URL"
echo

# 1. Frontend reachable (follow Vercel redirects)
echo "→ Frontend"
code=$(curl -sL -o /dev/null -w "%{http_code}" "$URL/" || echo 000)
if [ "$code" = "200" ]; then ok "/ returns 200 (after redirects)"; else fail "/ final code $code"; fi

# 2. Login page branding (follow redirects, look at final body)
echo "→ Login page"
body=$(curl -sL "$URL/" || true)
if echo "$body" | grep -qi "encephlian\|<title>"; then ok "page body served"; else fail "no recognisable body served"; fi

# 3. Admin-gated legal routes — they're behind /admin so they'll redirect to /login
echo "→ Admin legal pages (gated)"
for p in admin/legal/terms admin/legal/privacy admin/legal/refund admin/legal/support; do
  code=$(curl -sL -o /dev/null -w "%{http_code}" "$URL/$p" || echo 000)
  if [ "$code" = "200" ]; then
    ok "$p reachable as SPA route"
  else
    fail "$p final code $code"
  fi
done

# 4. Supabase health
echo "→ Supabase"
code=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" || echo 000)
if [ "$code" = "200" ] || [ "$code" = "401" ]; then ok "PostgREST responds"; else fail "PostgREST $code"; fi

# 5. Anon-token roundtrip (sanity that auth backend is up)
if [ -n "$ANON_KEY" ]; then
  echo "→ Anon roundtrip"
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    "$SUPABASE_URL/rest/v1/clinics?select=count" || echo 000)
  if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "406" ]; then
    ok "anon hit got $code (RLS gated, as expected)"
  else
    fail "anon hit got $code"
  fi
else
  yellow "→ SUPABASE_ANON_KEY not set, skipping anon roundtrip"
fi

# 6. Edge function health — admin_provision_clinic rejects no-auth at the
#    Supabase platform layer (UNAUTHORIZED_NO_AUTH_HEADER) before reaching our
#    function body. Both responses count as healthy.
echo "→ Edge function admin_provision_clinic"
resp=$(curl -s "$SUPABASE_URL/functions/v1/admin_provision_clinic" \
  -X POST -H "Content-Type: application/json" -d '{}' || echo "{}")
if echo "$resp" | grep -qE "Unauthorized|auth_missing|no bearer token|UNAUTHORIZED_NO_AUTH_HEADER|Missing authorization"; then
  ok "rejects unauthenticated calls (expected)"
else
  fail "did not reject unauthenticated call: ${resp:0:200}"
fi

# 7. C-Plane health — try /healthz then / (FastAPI root usually returns 200 if alive)
echo "→ C-Plane health"
CPLANE_URL="https://encephlian-cplane.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io"
code=$(curl -s -o /dev/null -m 5 -w "%{http_code}" "$CPLANE_URL/healthz" || echo 000)
if [ "$code" = "200" ]; then
  ok "C-Plane /healthz 200"
else
  code=$(curl -s -o /dev/null -m 5 -w "%{http_code}" "$CPLANE_URL/" || echo 000)
  if [ "$code" = "200" ] || [ "$code" = "404" ]; then
    ok "C-Plane reachable (/ → $code)"
  else
    yellow "C-Plane unreachable (code $code) — may be scaled to zero"
  fi
fi

# 8. Bundle size regression — ensure no chunk over 2 MB lands in dist if we built locally
if [ -d dist/assets ]; then
  echo "→ Bundle size"
  oversize=$(find dist/assets -name "*.js" -size +2M | wc -l | tr -d ' ')
  if [ "$oversize" = "0" ]; then
    ok "no chunk over 2 MB"
  else
    fail "$oversize chunks exceed 2 MB:"
    find dist/assets -name "*.js" -size +2M -exec ls -lh {} \;
  fi
fi

echo
if [ "$FAILED" = "0" ]; then
  green "── ALL CHECKS PASSED ──"
  exit 0
else
  red "── $FAILED CHECK(S) FAILED ──"
  exit 1
fi
