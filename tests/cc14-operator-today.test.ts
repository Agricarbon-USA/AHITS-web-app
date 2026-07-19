import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { getOperatorToday } from '../src/lib/operator-today'
import { businessDate } from '../src/lib/business-date'
import { createOperator, createRig, createVehicle, addVehicleToRig } from './helpers/fixtures'

// ── CC-14 (NS-10) Operator "Today" aggregate ─────────────────────────────────
// The endpoint is thin assembly of already-tested reads; the NEW logic under test is
// (a) resolving the active PRIMARY rig + shaping `deployment`, (b) the per-vehicle
// done/due signal (`checkedVehicleIds`, business-date scoped), (c) the not-deployed
// null/empty state, and (d) operator isolation. Transfers/handoffs/requests/pickup
// each have their own suites; here we assert one waiting-transfer flows through.

async function fileCheck(vehicleId: string, operatorId: string, date: Date) {
  return prisma.dailyCheck.create({
    data: { vehicleId, operatorId, date, checklistJson: [] },
  })
}

describe('CC-14 operator today', () => {
  describe('deployment + per-vehicle done/due', () => {
    it('returns the active deployment with its vehicles and an empty done set before any check', async () => {
      const op = await createOperator()
      const { rig } = await createRig(op.id)
      const v1 = await createVehicle()
      const v2 = await createVehicle()
      await addVehicleToRig(rig.id, v1.id)
      await addVehicleToRig(rig.id, v2.id)

      const today = await getOperatorToday(op.id, 'OPERATOR')
      expect(today.deployment).not.toBeNull()
      expect(today.deployment!.id).toBe(rig.id)
      expect(today.deployment!.vehicles.map((rv) => rv.vehicleId).sort()).toEqual([v1.id, v2.id].sort())
      expect(today.checkedVehicleIds).toEqual([])
    })

    it('marks only the vehicle checked TODAY as done', async () => {
      const op = await createOperator()
      const { rig } = await createRig(op.id)
      const v1 = await createVehicle()
      const v2 = await createVehicle()
      await addVehicleToRig(rig.id, v1.id)
      await addVehicleToRig(rig.id, v2.id)

      await fileCheck(v1.id, op.id, new Date(businessDate()))

      const today = await getOperatorToday(op.id, 'OPERATOR')
      expect(today.checkedVehicleIds).toEqual([v1.id])
    })

    it('does not count a check filed on a previous business day as done today', async () => {
      const op = await createOperator()
      const { rig } = await createRig(op.id)
      const v1 = await createVehicle()
      await addVehicleToRig(rig.id, v1.id)

      const yesterday = new Date(businessDate())
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      await fileCheck(v1.id, op.id, yesterday)

      const today = await getOperatorToday(op.id, 'OPERATOR')
      expect(today.checkedVehicleIds).toEqual([])
    })
  })

  describe('not-deployed state', () => {
    it('returns a null deployment and empty sections when the operator has no active rig', async () => {
      const op = await createOperator()

      const today = await getOperatorToday(op.id, 'OPERATOR')
      expect(today.deployment).toBeNull()
      expect(today.checkedVehicleIds).toEqual([])
      expect(today.transfers).toEqual([])
      expect(today.handoffs).toEqual([])
      expect(today.requests).toEqual([])
      expect(today.awaitingPickup).toEqual([])
      expect(typeof today.asOf).toBe('string')
    })
  })

  describe('isolation + waiting-on-me', () => {
    it('does not surface another operator\'s deployment', async () => {
      const mine = await createOperator()
      const other = await createOperator()
      await createRig(other.id)

      const today = await getOperatorToday(mine.id, 'OPERATOR')
      expect(today.deployment).toBeNull()
    })

    it('includes a PENDING transfer addressed to this operator', async () => {
      const me = await createOperator()
      const sender = await createOperator()
      const { rig: senderRig } = await createRig(sender.id)

      const transfer = await prisma.transferRequest.create({
        data: {
          fromRigId: senderRig.id,
          toOperatorId: me.id,
          initiatedById: sender.id,
          note: 'heading your way',
          status: 'PENDING',
        },
      })

      const today = await getOperatorToday(me.id, 'OPERATOR')
      expect(today.transfers.map((t) => t.id)).toContain(transfer.id)
    })
  })
})
