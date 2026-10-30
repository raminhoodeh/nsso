import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20261027154442_nsso_account_deletion_fence.sql', import.meta.url), 'utf8')
const purchaseLinkMigration = readFileSync(new URL('../supabase/migrations/20261029090357_product_secondary_purchase_link.sql', import.meta.url), 'utf8')
const buttonLabelMigration = readFileSync(new URL('../supabase/migrations/20261030084103_product_button_labels.sql', import.meta.url), 'utf8')
const bootstrap = readFileSync(new URL('../supabase/bootstrap/schema.sql', import.meta.url), 'utf8')

test('fresh bootstrap preserves account deletion and exact additive purchase migrations in order', () => {
    const trimmed = bootstrap.trimEnd()
    assert.ok(trimmed.endsWith(buttonLabelMigration.trimEnd()))
    const beforeLabels = trimmed.slice(0, -buttonLabelMigration.trimEnd().length).trimEnd()
    const extension = purchaseLinkMigration.trimEnd()
    assert.ok(beforeLabels.endsWith(extension))
    assert.ok(beforeLabels.slice(0, -extension.length).trimEnd().endsWith(migration.trimEnd()))
})

test('deletion contract contains no Storage catalog mutation or credential migration', () => {
    assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO|ALTER TABLE)\s+storage\./i)
    assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO)\s+auth\./i)
    assert.match(migration, /CREATE TRIGGER nsso_cleanup_deleted_profile_legacy AFTER DELETE ON auth\.users/)
})
