import { stringify } from 'csv-stringify/sync';

export interface ExportRow {
  title: string;
  url: string;
  source: string;
  author: string;
  publishedAt: string;
  status: string;
  owner: string;
  contactEmail: string;
  contactType: string;
  contactConfidence: string;
  contactFoundOnUrl: string;
  contactUrl: string;
  outreachNotes: string;
  category: string;
}

export function generateCsv(rows: ExportRow[]): string {
  return stringify(rows, {
    header: true,
    columns: [
      { key: 'title', header: 'Title' },
      { key: 'url', header: 'Article URL' },
      { key: 'source', header: 'Source' },
      { key: 'author', header: 'Author' },
      { key: 'publishedAt', header: 'Published Date' },
      { key: 'status', header: 'Status' },
      { key: 'owner', header: 'Assigned To' },
      { key: 'contactEmail', header: 'Contact Email' },
      { key: 'contactType', header: 'Contact Type' },
      { key: 'contactConfidence', header: 'Confidence' },
      { key: 'contactFoundOnUrl', header: 'Email Found On' },
      { key: 'contactUrl', header: 'Contact Page URL' },
      { key: 'outreachNotes', header: 'Outreach Notes' },
      { key: 'category', header: 'Category' },
    ],
  });
}
