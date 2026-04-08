#!/bin/bash
# Run full scrape in sequential batches of 200
# Usage: bash scripts/full-scrape.sh

BATCH_SIZE=200
TOTAL=0
BATCH=1

while true; do
  echo "[Batch $BATCH] Scraping up to $BATCH_SIZE articles..."
  RESULT=$(curl -s -X POST "http://localhost:3000/api/articles/rescrape?limit=$BATCH_SIZE" --max-time 600)

  PROCESSED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('processed',0))" 2>/dev/null)
  LINKS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalLinks',0))" 2>/dev/null)
  LINKEDIN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalLinkedin',0))" 2>/dev/null)

  if [ "$PROCESSED" = "0" ] || [ -z "$PROCESSED" ]; then
    echo "No more articles to scrape. Done!"
    break
  fi

  TOTAL=$((TOTAL + PROCESSED))
  echo "[Batch $BATCH] Processed: $PROCESSED | Links: $LINKS | LinkedIn: $LINKEDIN | Total so far: $TOTAL"
  BATCH=$((BATCH + 1))

  # Brief pause between batches
  sleep 2
done

echo "Full scrape complete. Total articles processed: $TOTAL"
