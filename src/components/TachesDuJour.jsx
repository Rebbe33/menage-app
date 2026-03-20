import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useStocks(giteId) {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!giteId) return
    const { data } = await supabase.from('stocks')
      .select('*').eq('gite_id', giteId)
      .order('categorie').order('nom')
    setStocks(data || [])
    setLoading(false)
  }, [giteId])

  useEffect(() => {
    fetch()
    const sub = supabase.channel(`stocks-${giteId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks',
        filter: `gite_id=eq.${giteId}` }, fetch)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [giteId, fetch])

  const add = async (item) => {
    await supabase.from('stocks').insert({ ...item, gite_id: giteId })
    await fetch()
  }

  const updateQty = async (id, delta) => {
    const item = stocks.find(s => s.id === id)
    if (!item) return
    const newQty = Math.max(0, item.quantite + delta)
    await supabase.from('stocks').update({ quantite: newQty }).eq('id', id)
    setStocks(prev => prev.map(s => s.id === id ? { ...s, quantite: newQty } : s))
  }

  const remove = async (id) => {
    await supabase.from('stocks').delete().eq('id', id)
    await fetch()
  }

  const update = async (id, updates) => {
    await supabase.from('stocks').update(updates).eq('id', id)
    await fetch()
  }

  return { stocks, loading, add, updateQty, remove, update, refresh: fetch }
}
