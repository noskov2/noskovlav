import { slugify } from '@/lib/id'
import { listTeams, upsertTeam } from '@/data/repo/teams'
import { getCashier, upsertCashier } from '@/data/repo/cashiers'
import type { Cashier, Team } from '@/types/domain'

// The team composition the station asked for. Runs once, only when no
// teams exist yet (so it never overwrites edits made afterwards in
// Nomenclator — renames, re-assignments, merges all stick).
const DEFAULT_TEAMS: { name: string; members: string[] }[] = [
  { name: 'Echipa 1', members: ['Catalin', 'Ioana'] },
  { name: 'Echipa 2', members: ['Buzila', 'Andreea', 'Denisa'] },
  { name: 'Echipa 3', members: ['Razvan', 'Rodica'] },
]

export async function ensureDefaultTeamsSeeded(): Promise<void> {
  const existing = await listTeams()
  if (existing.length > 0) return

  for (const def of DEFAULT_TEAMS) {
    const team: Team = { id: slugify(def.name), name: def.name, createdAt: Date.now() }
    await upsertTeam(team)

    for (const memberName of def.members) {
      const id = slugify(memberName) || `cashier-${Date.now()}`
      const existingCashier = await getCashier(id)
      const cashier: Cashier = existingCashier
        ? { ...existingCashier, teamId: team.id }
        : {
            id,
            name: memberName,
            aliases: [memberName],
            active: true,
            teamId: team.id,
            teamHistory: [],
            resignedAt: null,
            resignedNote: null,
            createdAt: Date.now(),
          }
      await upsertCashier(cashier)
    }
  }
}
