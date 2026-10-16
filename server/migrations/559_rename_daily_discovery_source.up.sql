-- Rename the daily_discovery source card to match its product role: mining
-- feeds the shared pool; the public "每日商机" edition is a later, separate
-- selection step. Guard on the old name so a re-run never overwrites an
-- operator-edited name.
UPDATE customer_pool_source
   SET name = '商机智能挖掘'
 WHERE kind = 'daily_discovery'
   AND name = '每日商机发现';
