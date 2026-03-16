import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { decalerProchaineOccurrence, genererPlanning } from '../utils/planificateur'

export default function Taches() {
  const [taches, setTaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filtreRecherche, setFiltreRecherche] = useState('')
  const [filtrePiece, setFiltrePiece] = useState('Toutes')
  const [pieces, setPieces] = useState([])
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    piece: '', zone: '', tache: '', frequence_jours: 7, duree_minutes: 10
  })

  useEffect(() => { chargerTaches() }, [])

  const chargerTaches = async () => {
    setLoading(true)
    const aujourd_hui = new Date().toISOString().split('T')[0]

    // Récupérer toutes les tâches avec leur prochaine occurrence planifiée
    const { data: tachesData } = await supabase
      .from('menage_taches')
      .select('*')
      .eq('actif', true)
      .order('piece')

    // Pour chaque tâche, récupérer la prochaine occurrence future non faite
    const tachesAvecPlanning = await Promise.all(
      (tachesData || []).map(async (t) => {
        const { data: prochaine } = await supabase
          .from('menage_planning')
          .select('id, date_prevue, date_faite')
          .eq('tache_id', t.id)
          .gte('date_prevue', aujourd_hui)
          .is('date_faite', null)
          .order('date_prevue', { ascending: true })
          .limit(1)

        // Dernière fois faite
        const { data: derniere } = await supabase
          .from('menage_planning')
          .select('date_faite')
          .eq('tache_id', t.id)
          .not('date_faite', 'is', null)
          .order('date_faite', { ascending: false })
          .limit(1)

        return {
          ...t,
          prochaine_occurrence: prochaine?.[0] || null,
          derniere_fois: derniere?.[0]?.date_faite || null
        }
      })
    )

    setTaches(tachesAvecPlanning)
    const piecesUniques = [...new Set(tachesAvecPlanning.map(t => t.piece))]
    setPieces(piecesUniques)
    setLoading(false)
  }

  const cocherTache = async (tache) => {
    if (!tache.prochaine_occurrence) return
    await decalerProchaineOccurrence(
      tache.prochaine_occurrence.id,
      tache.id,
      tache.frequence_jours
    )
    setMessage({ type: 'success', text: `✅ "${tache.tache}" marquée comme faite, prochaine occurrence décalée.` })
    setTimeout(() => setMessage(null), 3000)
    chargerTaches()
  }

  const supprimerTache = async (id) => {
    if (!confirm('Supprimer cette tâche et toutes ses occurrences planifiées ?')) return
    await supabase.from('menage_taches').update({ actif: false }).eq('id', id)
    await supabase.from('menage_planning').delete().eq('tache_id', id).is('date_faite', null)
    chargerTaches()
  }

  const ajouterTache = async () => {
    if (!form.piece || !form.zone || !form.tache) {
      setMessage({ type: 'error', text: 'Merci de remplir tous les champs.' })
      return
    }

    const { data, error } = await supabase
      .from('menage_taches')
      .insert([{ ...form, actif: true }])
      .select()

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    // Générer les occurrences pour cette nouvelle tâche uniquement
    await genererPlanning(365)

    setMessage({ type: 'success', text: `✅ Tâche "${form.tache}" ajoutée et planifiée !` })
    setForm({ piece: '', zone: '', tache: '', frequence_jours: 7, duree_minutes: 10 })
    setShowForm(false)
    setTimeout(() => setMessage(null), 3000)
    chargerTaches()
  }

  const tachesFiltrees = taches.filter(t => {
    const matchRecherche = t.tache.toLowerCase().includes(filtreRecherche.toLowerCase()) ||
      t.zone.toLowerCase().includes(filtreRecherche.toLowerCase())
    const matchPiece = filtrePiece === 'Toutes' || t.piece === filtrePiece
    return matchRecherche && matchPiece
  })

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const frequenceLabel = (jours) => {
    if (jours === 1) return 'Quotidien'
    if (jours === 7) return 'Hebdo'
    if (jours === 14) return '2 semaines'
    if (jours === 30) return 'Mensuel'
    if (jours === 90) return 'Trimestriel'
    if (jours === 180) return 'Semestriel'
    if (jours === 365) return 'Annuel'
    return `${jours}j`
  }

  if (loading) return <div className="loading">Chargement des tâches...</div>

  return (
    <div className="taches-list-container">
      <div className="taches-list-header">
        <h2>Toutes les tâches</h2>
        <button className="btn-add" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Annuler' : '+ Ajouter'}
        </button>
      </div>

      {message && (
        <div className={`message message-${message.type}`}>{message.text}</div>
      )}

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="form-card">
          <h3>Nouvelle tâche</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Pièce</label>
              <input
                type="text"
                placeholder="ex: Cuisine"
                value={form.piece}
                onChange={e => setForm({ ...form, piece: e.target.value })}
                list="pieces-list"
              />
              <datalist id="pieces-list">
                {pieces.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label>Zone</label>
              <input
                type="text"
                placeholder="ex: Plan de travail"
                value={form.zone}
                onChange={e => setForm({ ...form, zone: e.target.value })}
              />
            </div>
            <div className="form-group full">
              <label>Tâche</label>
              <input
                type="text"
                placeholder="ex: Nettoyer le micro-ondes"
                value={form.tache}
                onChange={e => setForm({ ...form, tache: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Fréquence (jours)</label>
              <select
                value={form.frequence_jours}
                onChange={e => setForm({ ...form, frequence_jours: parseInt(e.target.value) })}
              >
                <option value={1}>Quotidien (1j)</option>
                <option value={7}>Hebdomadaire (7j)</option>
                <option value={14}>Bi-mensuel (14j)</option>
                <option value={30}>Mensuel (30j)</option>
                <option value={90}>Trimestriel (90j)</option>
                <option value={180}>Semestriel (180j)</option>
                <option value={365}>Annuel (365j)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Durée (minutes)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={form.duree_minutes}
                onChange={e => setForm({ ...form, duree_minutes: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <button className="btn-primary" onClick={ajouterTache}>
            ✓ Ajouter la tâche
          </button>
        </div>
      )}

      {/* Filtres */}
      <div className="filtres">
        <input
          type="text"
          placeholder="Rechercher..."
          value={filtreRecherche}
          onChange={e => setFiltreRecherche(e.target.value)}
          className="filtre-search"
        />
        <div className="filtre-pieces">
          {['Toutes', ...pieces].map(p => (
            <button
              key={p}
              className={`filtre-btn ${filtrePiece === p ? 'active' : ''}`}
              onClick={() => setFiltrePiece(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <p className="taches-count">{tachesFiltrees.length} tâche{tachesFiltrees.length > 1 ? 's' : ''}</p>

      {/* Liste des tâches */}
      <div className="taches-full-list">
        {tachesFiltrees.map(t => (
          <div key={t.id} className="tache-full-card">
            <div className="tache-full-info">
              <div className="tache-full-top">
                <span className="tache-piece">{t.piece}</span>
                <span className="tache-zone">{t.zone}</span>
              </div>
              <span className="tache-nom">{t.tache}</span>
              <div className="tache-full-meta">
                <span className="meta-tag">{frequenceLabel(t.frequence_jours)}</span>
                <span className="meta-tag">{t.duree_minutes} min</span>
                {t.derniere_fois && (
                  <span className="meta-tag muted">Fait le {formatDate(t.derniere_fois)}</span>
                )}
                {t.prochaine_occurrence && (
                  <span className="meta-tag accent">Prévu le {formatDate(t.prochaine_occurrence.date_prevue)}</span>
                )}
              </div>
            </div>
            <div className="tache-full-actions">
              <button
                className="btn-check"
                title="Marquer comme faite maintenant"
                onClick={() => cocherTache(t)}
                disabled={!t.prochaine_occurrence}
              >✓</button>
              <button
                className="btn-delete"
                title="Supprimer"
                onClick={() => supprimerTache(t.id)}
              >🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
