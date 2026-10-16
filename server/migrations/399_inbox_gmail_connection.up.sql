CREATE INDEX CONCURRENTLY inbox_item_gmail_connection_idx ON inbox_item ((details->>'connection_id')) WHERE type = 'gmail_analysis';
