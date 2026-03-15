import { supabase } from '../lib/supabase'

/**
 * Génère le planning pour les N prochains jours
 * en respectant la charge max par jour (défaut 60 min)
 * et la fréquence de chaque tâche.
 */
export async function genererPlanning(nbJours = 365) {
  // 1. Récupérer la config
  const { data: configs } = await supabase
    .from('menage_config')
    .select('cle, valeur')

  const config = Object.fromEntries(configs.map(c => [c.cle, c.valeur]))
  const chargeMax = parseInt(config.charge_max_minutes || '60')
  const debut = new Date(config.planning_debut || new Date().toISOString().split('T')[0])

  // 2. Récupérer toutes les tâches actives
  const { data: taches } = await supabase
    .from('menage_taches')
    .select('*')
    .eq('actif', true)

  if (!taches || taches.length === 0) return { success: false, message: 'Aucune tâche active trouvée.' }

  // 3. Supprimer le planning existant non fait (on replanifie depuis aujourd'hui)
  const aujourd_hui = new Date().toISOString().split('T')[0]
  await supabase
    .from('menage_planning')
    .delete()
    .gte('date_prevue', aujourd_hui)
    .is('date_faite', null)

  // 4. Construire le planning jour par jour
  const insertions = []
  // Suivre la dernière date planifiée pour chaque tâche
  const derniereDate = {}

  for (let j = 0; j < nbJours; j++) {
    const date = new Date(debut)
    date.setDate(debut.getDate() + j)
    const dateStr = date.toISOString().split('T')[0]

    let chargeJour = 0
    const tachesDuJour = []

    for (const tache of taches) {
      const derniere = derniereDate[tache.id]
      const diff = derniere
        ? Math.floor((date - new Date(derniere)) / (1000 * 60 * 60 * 24))
        : tache.frequence_jours // première fois : planifier dès que possible

      if (diff >= tache.frequence_jours) {
        if (chargeJour + tache.duree_minutes <= chargeMax) {
          tachesDuJour.push(tache)
          chargeJour += tache.duree_minutes
          derniereDate[tache.id] = dateStr
        }
      }
    }

    for (const tache of tachesDuJour) {
      insertions.push({
        tache_id: tache.id,
        date_prevue: dateStr,
        reporte: false
      })
    }
  }

  // 5. Insérer en batch
  if (insertions.length > 0) {
    const batchSize = 500
    for (let i = 0; i < insertions.length; i += batchSize) {
      await supabase.from('menage_planning').insert(insertions.slice(i, i + batchSize))
    }
  }

  return { success: true, nbTaches: insertions.length, nbJours }
}

/**
 * Reporte les tâches non faites d'hier vers aujourd'hui
 * si la charge le permet, sinon vers le premier jour disponible.
 */
export async function reporterTachesNonFaites() {
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  const hierStr = hier.toISOString().split('T')[0]
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Récupérer les tâches non faites d'hier
  const { data: nonFaites } = await supabase
    .from('menage_planning')
    .select('*, menage_taches(duree_minutes)')
    .eq('date_prevue', hierStr)
    .is('date_faite', null)

  if (!nonFaites || nonFaites.length === 0) return

  // Charge actuelle d'aujourd'hui
  const { data: tachesAujourdhui } = await supabase
    .from('menage_planning')
    .select('menage_taches(duree_minutes)')
    .eq('date_prevue', aujourd_hui)

  const chargeActuelle = (tachesAujourdhui || [])
    .reduce((sum, t) => sum + (t.menage_taches?.duree_minutes || 0), 0)

  const { data: configs } = await supabase.from('menage_config').select('cle, valeur')
  const config = Object.fromEntries(configs.map(c => [c.cle, c.valeur]))
  const chargeMax = parseInt(config.charge_max_minutes || '60')

  let chargeRestante = chargeMax - chargeActuelle

  for (const tache of nonFaites) {
    const duree = tache.menage_taches?.duree_minutes || 0
    if (chargeRestante >= duree) {
      // Reporter à aujourd'hui
      await supabase
        .from('menage_planning')
        .update({ date_prevue: aujourd_hui, reporte: true })
        .eq('id', tache.id)
      chargeRestante -= duree
    }
    // Si pas assez de place, on laisse pour la prochaine régénération
  }
}