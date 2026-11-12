import test from 'node:test'
import assert from 'node:assert/strict'
import { runProductionMonitor } from '../scripts/security/monitor-production.mjs'

const oldRelease = { sha: '1'.repeat(40), deploymentId: 1, statusId: 10 }
const newRelease = { sha: '2'.repeat(40), deploymentId: 2, statusId: 20 }
const quiet = () => {}

test('monitor checks the independently resolved release, without a manual version setting', async () => {
    const checked = []
    const result = await runProductionMonitor({ resolveRelease: async () => oldRelease, smoke: async release => checked.push(release), log: quiet })
    assert.deepEqual(checked, [oldRelease])
    assert.deepEqual(result, oldRelease)
})

test('metadata failure stops the monitor before making smoke requests', async () => {
    let checked = false
    await assert.rejects(runProductionMonitor({ resolveRelease: async () => { throw new Error('Metadata unavailable') }, smoke: () => { checked = true }, log: quiet }), /Metadata unavailable/)
    assert.equal(checked, false)
})

test('a healthy-looking unexpected version cannot become its own expected version', async () => {
    let checks = 0
    await assert.rejects(runProductionMonitor({ resolveRelease: async () => oldRelease, smoke: () => { checks++; throw new Error('Unexpected deployed revision') }, log: quiet }), /Unexpected deployed revision/)
    assert.equal(checks, 1)
})

test('a deployment race permits one complete check of the new independently verified release', async () => {
    let resolutions = 0
    const checked = []
    const result = await runProductionMonitor({
        resolveRelease: async () => ++resolutions === 1 ? oldRelease : newRelease,
        smoke: release => { checked.push(release.sha); if (release.sha === oldRelease.sha) throw new Error('Unexpected deployed revision') },
        log: quiet,
    })
    assert.deepEqual(checked, [oldRelease.sha, newRelease.sha])
    assert.deepEqual(result, newRelease)
    assert.equal(resolutions, 2)
})

test('a failing new release still fails, with no repeated retries', async () => {
    let resolutions = 0
    let checks = 0
    await assert.rejects(runProductionMonitor({
        resolveRelease: async () => ++resolutions === 1 ? oldRelease : newRelease,
        smoke: () => { checks++; throw new Error('Public availability failed') },
        log: quiet,
    }), /Public availability failed/)
    assert.equal(checks, 2)
    assert.equal(resolutions, 2)
})

test('a second deployment of the same commit does not hide a route or security failure', async () => {
    let resolutions = 0
    let checks = 0
    await assert.rejects(runProductionMonitor({
        resolveRelease: async () => ++resolutions === 1 ? oldRelease : { ...oldRelease, deploymentId: 3, statusId: 30 },
        smoke: () => { checks++; throw new Error('Security posture unavailable') },
        log: quiet,
    }), /Security posture unavailable/)
    assert.equal(checks, 1)
})

test('failed reconciliation cannot fall back to the earlier release', async () => {
    let resolutions = 0
    await assert.rejects(runProductionMonitor({
        resolveRelease: async () => { if (++resolutions > 1) throw new Error('Metadata unavailable'); return oldRelease },
        smoke: () => { throw new Error('Unexpected deployed revision') },
        log: quiet,
    }), /Metadata unavailable/)
})
