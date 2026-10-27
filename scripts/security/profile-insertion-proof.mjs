/** Synthetic local-database proof; called by the fresh-project gate only. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export async function verifyProfileInsertion({ owner, other, anon }) {
    const ok = result => { assert.equal(result.error, null, result.error?.message); return result.data }
    const snapshot = () => owner.client.rpc('get_profile_snapshot').then(ok)
    const apply = async changes => {
        const before = await snapshot()
        const operation = { version: 1, operationId: randomUUID(), expectedRevision: before.revision, changes }
        return { operation, result: ok(await owner.client.rpc('apply_profile_operation', { p_operation: operation })) }
    }
    for (const [kind, collection, values] of [
        ['link', 'links', { link_name: 'Synthetic insertion', link_url: '' }],
        ['contact', 'contacts', { method: 'Email', value: 'synthetic@example.invalid' }],
        ['experience', 'experiences', { company_name: 'Synthetic insertion', job_title: 'Builder' }],
        ['qualification', 'qualifications', { institution: 'Synthetic insertion', qualification_name: 'Course' }],
        ['project', 'projects', { project_name: 'Synthetic insertion', contribution: 'Creator' }],
        ['product', 'products', { name: 'Synthetic insertion' }],
    ]) {
        const intents = []
        for (const position of [undefined, 'top', 'bottom']) {
            const change = { kind: `${kind}.add`, values, ...(position ? { position } : {}) }
            const intent = await apply([change]); intents.push(intent)
            assert.equal(intent.result.status, 'applied')
            assert.equal(intent.result.changes.length, 1)
            assert.deepEqual(ok(await owner.client.rpc('apply_profile_operation', { p_operation: intent.operation })), intent.result, 'replay uses exact original receipt')
        }
        const ids = intents.map(intent => intent.result.changes[0].id)
        const ordered = (await snapshot())[collection].filter(row => ids.includes(row.id))
        assert.deepEqual(ordered.map(row => row.id), [ids[1], ids[0], ids[2]])
        assert.ok(ordered.every((row, index) => index === 0 || row.display_order > ordered[index - 1].display_order))
        if (kind === 'product') {
            const publicRows = ok(await anon.from('products').select('id,display_order').eq('user_id', owner.id).in('id', ids).order('display_order'))
            assert.deepEqual(publicRows.map(row => row.id), [ids[1], ids[0], ids[2]])
            assert.deepEqual(ok(await owner.client.rpc('get_own_products')).filter(row => ids.includes(row.id)).map(row => row.id), [ids[1], ids[0], ids[2]])
        }
        for (const position of [null, 0, 'middle', { top: true }]) {
            const invalid = await apply([{ kind: `${kind}.add`, values, position }])
            assert.equal(invalid.result.status, 'rejected')
            assert.deepEqual(invalid.result.changes, [])
        }
        const ownerBefore = await snapshot()
        const otherBefore = ok(await other.client.rpc('get_profile_snapshot'))
        assert.equal(ok(await other.client.rpc('apply_profile_operation', { p_operation: { version: 1, operationId: randomUUID(), expectedRevision: otherBefore.revision, changes: [{ kind: `${kind}.add`, values, position: 'top' }] } })).status, 'applied')
        assert.deepEqual(await snapshot(), ownerBefore, 'another account cannot reposition this owner collection')
        // Undo removes only the exact created item and preserves later placements.
        const revision = (await snapshot()).revision
        const undone = ok(await owner.client.rpc('undo_profile_operation', { p_operation_id: randomUUID(), p_original_operation_id: intents[1].operation.operationId, p_expected_revision: revision }))
        assert.equal(undone.status, 'applied')
        assert.deepEqual((await snapshot())[collection].filter(row => ids.includes(row.id)).map(row => row.id), [ids[0], ids[2]])
        assert.equal((await apply(ids.filter(id => id !== ids[1]).map(id => ({ kind: `${kind}.remove`, id })))).result.status, 'applied')
    }
}
