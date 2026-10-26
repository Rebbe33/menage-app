import { supabase } from '../lib/supabase'

/**
 * Génère le planning sur N jours avec répartition ÉQUITABLE.
 * Pour chaque tâche, crée toutes ses occurrences depuis `debut`
 * jusqu'à `debut + nbJours`, espacées de `frequence_jours`.
 */
export async function genererPlanning(nbJours = 365) {
  const { data: configs } = await supabase
    .from('menage_config')
    .select('cle, valeur')

  const config = Object.fromEntries((configs || []).map(c => [c.cle, c.valeur]))
  const debut = new Date(config.planning_debut || new Date().toISOString().split('T')[0])

  const { data: taches } = await supabase
    .from('menage_taches')
    .select('*')
    .eq('actif', true)

  if (!taches || taches.length === 0) {
    return { success: false, message: 'Aucune tâche active trouvée.' }
  }

  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Supprimer toutes les occurrences futures non faites
  await supabase
    .from('menage_planning')
    .delete()
    .gte('date_prevue', aujourd_hui)
    .is('date_faite', null)

  // Construire toutes les occurrences
  const insertions = []
  for (const tache of taches) {
    const freq = tache.frequence_jours
    // Offset aléatoire pour répartir équitablement
    const offset = Math.floor(Math.random() * freq)
    for (let j = offset; j < nbJours; j += freq) {
      const date = new Date(debut)
      date.setDate(debut.getDate() + j)
      const dateStr = date.toISOString().split('T')[0]
      // Ne pas insérer dans le passé
      if (dateStr >= aujourd_hui) {
        insertions.push({
          tache_id: tache.id,
          date_prevue: dateStr,
          reporte: false
        })
      }
    }
  }

  if (insertions.length > 0) {
    const batchSize = 500
    for (let i = 0; i < insertions.length; i += batchSize) {
      const { error } = await supabase
        .from('menage_planning')
        .insert(insertions.slice(i, i + batchSize))
      if (error) return { success: false, message: error.message }
    }
  }

  return { success: true, nbTaches: insertions.length, nbJours }
}

/**
 * Génère les occurrences futures d'une SEULE tâche à partir d'une date donnée.
 * Utilisé après cochage pour replanifier proprement sans toucher aux autres tâches.
 */
async function replanifierTache(tacheId, frequenceJours, dateDebut, nbJours = 365) {
  const fin = new Date(dateDebut)
  fin.setDate(fin.getDate() + nbJours)
  const finStr = fin.toISOString().split('T')[0]

  // Supprimer les occurrences futures non faites de cette tâche uniquement
  await supabase
    .from('menage_planning')
    .delete()
    .eq('tache_id', tacheId)
    .gt('date_prevue', dateDebut)
    .is('date_faite', null)

  // Recréer toutes les occurrences depuis dateDebut + freq jusqu'à la fin
  const insertions = []
  const debut = new Date(dateDebut)
  for (let j = frequenceJours; ; j += frequenceJours) {
    const date = new Date(debut)
    date.setDate(debut.getDate() + j)
    const dateStr = date.toISOString().split('T')[0]
    if (dateStr > finStr) break
    insertions.push({
      tache_id: tacheId,
      date_prevue: dateStr,
      reporte: false
    })
  }

  if (insertions.length > 0) {
    const batchSize = 500
    for (let i = 0; i < insertions.length; i += batchSize) {
      await supabase.from('menage_planning').insert(insertions.slice(i, i + batchSize))
    }
  }
}

/**
 * Reporte les tâches non faites d'hier vers aujourd'hui.
 * Si une occurrence existe déjà aujourd'hui pour cette tâche, supprime l'ancienne.
 */
export async function reporterTachesNonFaites() {
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  const hierStr = hier.toISOString().split('T')[0]
  const aujourd_hui = new Date().toISOString().split('T')[0]

  const { data: nonFaites } = await supabase
    .from('menage_planning')
    .select('id, tache_id')
    .eq('date_prevue', hierStr)
    .is('date_faite', null)

  if (!nonFaites || nonFaites.length === 0) return

  const { data: dejaPlanifiees } = await supabase
    .from('menage_planning')
    .select('tache_id')
    .eq('date_prevue', aujourd_hui)
    .is('date_faite', null)

  const tachesDejaAujourdhui = new Set((dejaPlanifiees || []).map(t => t.tache_id))

  for (const tache of nonFaites) {
    if (tachesDejaAujourdhui.has(tache.tache_id)) {
      // Déjà présente aujourd'hui → supprimer l'ancienne
      await supabase.from('menage_planning').delete().eq('id', tache.id)
    } else {
      // Pas encore présente → reporter
      await supabase
        .from('menage_planning')
        .update({ date_prevue: aujourd_hui, reporte: true })
        .eq('id', tache.id)
    }
  }
}

/**
 * Nettoie les doublons pour une date donnée.
 * Garde uniquement la première occurrence non faite par tâche.
 */
export async function nettoyerDoublons(date) {
  const { data: occurrences } = await supabase
    .from('menage_planning')
    .select('id, tache_id, created_at')
    .eq('date_prevue', date)
    .is('date_faite', null)
    .order('created_at', { ascending: true })

  if (!occurrences || occurrences.length === 0) return

  const vues = new Set()
  const aSupprimer = []

  for (const occ of occurrences) {
    if (vues.has(occ.tache_id)) {
      aSupprimer.push(occ.id)
    } else {
      vues.add(occ.tache_id)
    }
  }

  if (aSupprimer.length > 0) {
    await supabase.from('menage_planning').delete().in('id', aSupprimer)
  }
}

/**
 * Coche une tâche et replanifie TOUTES ses occurrences futures à partir d'aujourd'hui.
 *
 * Logique :
 * 1. Marque l'occurrence comme faite
 * 2. Supprime toutes les occurrences futures non faites de cette tâche
 * 3. Recrée toutes les occurrences futures espacées de `frequenceJours`
 *    → garantit qu'une tâche quotidienne reste quotidienne,
 *      qu'une tâche hebdo reste hebdo, etc.
 */
export async function decalerProchaineOccurrence(planningId, tacheId, frequenceJours) {
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // 1. Marquer comme faite
  await supabase
    .from('menage_planning')
    .update({ date_faite: new Date().toISOString() })
    .eq('id', planningId)

  // 2 & 3. Replanifier toutes les occurrences futures depuis aujourd'hui
  await replanifierTache(tacheId, frequenceJours, aujourd_hui, 365)
}
