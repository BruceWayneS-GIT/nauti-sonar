#!/bin/bash
# Scrape company websites linked from articles for email addresses
# Runs in sequential batches of 50
# Usage: bash scripts/full-website-scrape.sh

BATCH_SIZE=25
TOTAL=0
TOTAL_EMAILS=0
BATCH=1

while true; do
  echo "[Batch $BATCH] Scraping up to $BATCH_SIZE article websites..."
  RESULT=$(curl -s -X POST "http://localhost:3000/api/articles/scrape-websites?limit=$BATCH_SIZE" --max-time 1200)

  PROCESSED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('processed',0))" 2>/dev/null)
  EMAILS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalEmailsFound',0))" 2>/dev/null)
  PENDING=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalPending',0))" 2>/dev/null)

  if [ "$PROCESSED" = "0" ] || [ -z "$PROCESSED" ]; then
    echo "No more articles to scrape. Done!"
    break
  fi

  TOTAL=$((TOTAL + PROCESSED))
  TOTAL_EMAILS=$((TOTAL_EMAILS + EMAILS))
  echo "[Batch $BATCH] Processed: $PROCESSED | Emails: $EMAILS | Pending: $PENDING | Total: $TOTAL | Total Emails: $TOTAL_EMAILS"
  BATCH=$((BATCH + 1))

  # Brief pause between batches
  sleep 2
done

echo "Full website scrape complete. Total articles: $TOTAL | Total emails found: $TOTAL_EMAILS"
