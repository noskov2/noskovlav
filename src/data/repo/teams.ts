import { db } from '@/data/db'
import type { Team } from '@/types/domain'

export async function listTeams(): Promise<Team[]> {
  return db.teams.toArray()
}

export async function upsertTeam(team: Team): Promise<void> {
  await db.teams.put(team)
}

export async function deleteTeam(id: string): Promise<void> {
  await db.teams.delete(id)
  const members = await db.cashiers.where('teamId').equals(id).toArray()
  await db.cashiers.bulkPut(members.map((c) => ({ ...c, teamId: null })))
}
