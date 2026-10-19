import { applyHomeCommand, createHomeState, validateHomeState } from './home-data.js'

export const HOME_KEY = 'grapes-home-household-v1'
export const HOME_PREVIOUS_KEY = 'grapes-home-household-v1-previous'

function parse(raw) {
  if (raw == null) return null
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('A Home helyi mentése sérült JSON. Az eredeti adat megőrizve.') }
  // The v1 snapshot is upgraded in memory only. The original JSON remains
  // untouched until an explicit, verified Home write succeeds.
  if (value?.schemaVersion === 1) value = { ...value, schemaVersion: 2, prepared: [] }
  try { return validateHomeState(value) } catch (error) { throw new Error(`A Home helyi mentése nem olvasható: ${error.message} Az eredeti adat megőrizve.`) }
}

export function createHomeStore(storage = globalThis.localStorage) {
  if (!storage) throw new Error('A helyi tároló nem érhető el.')
  let state
  try {
    state = parse(storage.getItem(HOME_KEY))
    if (!state) {
      if (storage.getItem(HOME_PREVIOUS_KEY) != null) throw new Error('Az aktív Home mentés hiányzik, de van korábbi példány. Ellenőrizd az adatokat; nem hozunk létre üres készletet.')
      state = createHomeState()
    }
  } catch (error) { throw new Error(`A Home nem nyitható meg biztonságosan: ${error.message}`) }

  return {
    getState: () => structuredClone(state),
    dispatch(command) {
      // A stale tab must never overwrite a newer local snapshot.
      const onDisk = parse(storage.getItem(HOME_KEY))
      if (onDisk && (onDisk.revision !== state.revision || onDisk.householdId !== state.householdId)) throw new Error('A Home adatai másik nézetben megváltoztak. Nyisd meg újra a modult.')
      if (!onDisk && state.revision) throw new Error('A Home mentése eltűnt. A művelet nem lett végrehajtva.')
      const result = applyHomeCommand(state, command)
      if (result.duplicate) return result
      const nextRaw = JSON.stringify(result.state)
      const previousRaw = storage.getItem(HOME_KEY)
      try {
        if (previousRaw != null) storage.setItem(HOME_PREVIOUS_KEY, previousRaw)
        storage.setItem(HOME_KEY, nextRaw)
        const verified = storage.getItem(HOME_KEY)
        if (verified !== nextRaw) throw new Error('A mentés visszaolvasása eltér.')
        parse(verified)
      } catch (error) {
        // Never claim success; keep the old in-memory state and the previous snapshot.
        throw new Error(`A Home mentése sikertelen: ${error.message}`)
      }
      state = result.state
      return result
    },
    previousSnapshot() {
      return parse(storage.getItem(HOME_PREVIOUS_KEY))
    },
  }
}
