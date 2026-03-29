import { supabase } from '../lib/supabase'

/**
 * Génère le planning sur N jours avec répartition ÉQUITABLE.
 * Chaque tâche est planifiée selon sa fréquence, répartie uniformément
 * avec un offset aléatoire pour éviter que tout tombe le même jour.
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

  // Répartition équitable : offset aléatoire par tâche
  const insertions = []
  for (const tache of taches) {
    const freq = tache.frequence_jours
    const offset = Math.floor(Math.random() * freq)
    for (let j = offset; j < nbJours; j += freq) {
      const date = new Date(debut)
      date.setDate(debut.getDate() + j)
      insertions.push({
        tache_id: tache.id,
        date_prevue: date.toISOString().split('T')[0],
        reporte: false
      })
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
 * Reporte les tâches non faites d'hier vers aujourd'hui.
 * Evite les doublons : si une occurrence existe déjà aujourd'hui
 * pour cette tâche, on supprime simplement l'ancienne au lieu de reporter.
 */
export async function reporterTachesNonFaites() {
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  const hierStr = hier.toISOString().split('T')[0]
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Tâches non faites d'hier
  const { data: nonFaites } = await supabase
    .from('menage_planning')
    .select('id, tache_id')
    .eq('date_prevue', hierStr)
    .is('date_faite', null)

  if (!nonFaites || nonFaites.length === 0) return

  // Tâches déjà planifiées aujourd'hui (non faites)
  const { data: dejaPlanifiees } = await supabase
    .from('menage_planning')
    .select('tache_id')
    .eq('date_prevue', aujourd_hui)
    .is('date_faite', null)

  const tachesDejaAujourdhui = new Set((dejaPlanifiees || []).map(t => t.tache_id))

  for (const tache of nonFaites) {
    if (tachesDejaAujourdhui.has(tache.tache_id)) {
      // Il y a déjà une occurrence aujourd'hui → on supprime juste l'ancienne
      await supabase.from('menage_planning').delete().eq('id', tache.id)
    } else {
      // Pas d'occurrence aujourd'hui → on reporte
      await supabase
        .from('menage_planning')
        .update({ date_prevue: aujourd_hui, reporte: true })
        .eq('id', tache.id)
    }
  }
}

/**
 * Nettoie les doublons pour une date donnée :
 * garde uniquement la première occurrence par tâche (non faite),
 * supprime les autres.
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
 * Coche une tâche manuellement et décale sa prochaine occurrence.
 */
export async function decalerProchaineOccurrence(planningId, tacheId, frequenceJours) {
  const aujourd_hui = new Date().toISOString().split('T')[0]

  await supabase
    .from('menage_planning')
    .update({ date_faite: new Date().toISOString() })
    .eq('id', planningId)

  const { data: prochaines } = await supabase
    .from('menage_planning')
    .select('id')
    .eq('tache_id', tacheId)
    .gt('date_prevue', aujourd_hui)
    .is('date_faite', null)
    .order('date_prevue', { ascending: true })
    .limit(1)

  if (prochaines && prochaines.length > 0) {
    const nouvelleDate = new Date()
    nouvelleDate.setDate(nouvelleDate.getDate() + frequenceJours)
    await supabase
      .from('menage_planning')
      .update({ date_prevue: nouvelleDate.toISOString().split('T')[0] })
      .eq('id', prochaines[0].id)
  }
}
