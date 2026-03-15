import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { genererPlanning } from '../utils/planificateur'

export default function ImportXlsx({ onImportSuccess }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [preview, setPreview] = useState([])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet)

      // Valider les colonnes
      const colonnesRequises = ['Piece', 'Zone', 'Tache', 'Frequence_jours', 'Duree_minutes']
      const colonnes = Object.keys(rows[0] || {})
      const manquantes = colonnesRequises.filter(c => !colonnes.includes(c))

      if (manquantes.length > 0) {
        setMessage({ type: 'error', text: `Colonnes manquantes : ${manquantes.join(', ')}` })
        return
      }

      setPreview(rows.slice(0, 5))
      setMessage({ type: 'info', text: `${rows.length} tâches détectées. Prêt à importer.` })

      // Stocker les lignes pour confirmation
      window._rowsToImport = rows
    }
    reader.readAsArrayBuffer(file)
  }

  const handleImport = async () => {
    const rows = window._rowsToImport
    if (!rows) return

    setLoading(true)
    setMessage({ type: 'info', text: 'Suppression des anciennes tâches...' })

    // Supprimer anciennes tâches et plannings
    await supabase.from('menage_planning').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('menage_taches').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    setMessage({ type: 'info', text: 'Import des nouvelles tâches...' })

    const taches = rows.map(r => ({
      piece: String(r.Piece),
      zone: String(r.Zone),
      tache: String(r.Tache),
      frequence_jours: parseInt(r.Frequence_jours),
      duree_minutes: parseInt(r.Duree_minutes),
      actif: true
    }))

    const { error } = await supabase.from('menage_taches').insert(taches)

    if (error) {
      setMessage({ type: 'error', text: `Erreur import : ${error.message}` })
      setLoading(false)
      return
    }

    setMessage({ type: 'info', text: 'Génération du planning sur 365 jours...' })
    const result = await genererPlanning(365)

    if (result.success) {
      setMessage({ type: 'success', text: `✅ ${taches.length} tâches importées, ${result.nbTaches} entrées planifiées sur 365 jours !` })
      onImportSuccess?.()
    } else {
      setMessage({ type: 'error', text: result.message })
    }

    setLoading(false)
  }

  return (
    <div className="import-container">
      <h2>Importer les tâches</h2>
      <p className="import-hint">
        Format attendu : fichier <strong>.xlsx</strong> avec les colonnes<br />
        <code>Piece | Zone | Tache | Frequence_jours | Duree_minutes</code>
      </p>

      <label className="file-input-label">
        <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
        Choisir un fichier xlsx
      </label>

      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      {preview.length > 0 && (
        <div className="preview">
          <h3>Aperçu (5 premières lignes)</h3>
          <table>
            <thead>
              <tr>
                <th>Pièce</th><th>Zone</th><th>Tâche</th><th>Fréq. (j)</th><th>Durée (min)</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i}>
                  <td>{r.Piece}</td>
                  <td>{r.Zone}</td>
                  <td>{r.Tache}</td>
                  <td>{r.Frequence_jours}</td>
                  <td>{r.Duree_minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleImport} disabled={loading} className="btn-primary">
            {loading ? 'Import en cours...' : '🚀 Confirmer l\'import'}
          </button>
        </div>
      )}

      <div className="danger-zone">
        <h3>⚠️ Réinitialiser (nouveau logement)</h3>
        <p>Supprime toutes les tâches et le planning existant.</p>
        <button
          className="btn-danger"
          onClick={async () => {
            if (!confirm('Supprimer toutes les données ? Cette action est irréversible.')) return
            await supabase.from('menage_planning').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            await supabase.from('menage_taches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            setMessage({ type: 'success', text: '✅ Toutes les données ont été supprimées.' })
            setPreview([])
          }}
        >
          🗑️ Tout supprimer
        </button>
      </div>
    </div>
  )
}