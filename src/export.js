import JSZip from 'jszip'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const STATUTS = { a_justifier: 'À justifier', justificatif_envoye: 'Justificatif envoyé', justifiee: 'Justifiée' }

// CSV lisible par Excel en français : séparateur point-virgule, virgule décimale, BOM UTF-8.
const cell = (c) => {
  const s = typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? '')
  return '"' + s.replace(/"/g, '""') + '"'
}
const csv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
const h = (t) => String(t || '').slice(0, 5)

export async function exportZip(eleve, d) {
  const zip = new JSZip()
  zip.file('emploi-du-temps.csv', csv([
    ['Jour', 'Début', 'Fin', 'Matière', 'Enseignant', 'Salle'],
    ...[...d.cours].sort((a, b) => a.jour - b.jour).map((c) => [JOURS[c.jour], h(c.debut), h(c.fin), c.matiere, c.enseignant, c.salle]),
  ]))
  zip.file('notes.csv', csv([
    ['Trimestre', 'Matière', 'Coefficient', 'Évaluation', 'Note', 'Sur', 'Date'],
    ...d.notes.map((n) => [n.trimestre, n.matiere, n.coefficient, n.libelle, n.note, n.sur, n.date]),
  ]))
  zip.file('controles.csv', csv([
    ['Date', 'Heure', 'Matière', 'Type', 'Chapitre'],
    ...d.evaluations.map((e) => [e.date, h(e.heure), e.matiere, e.type, e.chapitre]),
  ]))
  zip.file('presences.csv', csv([
    ['Date', 'Type', 'Détail', 'Statut', 'Motif'],
    ...d.presences.map((p) => [p.date, p.type, p.detail, STATUTS[p.statut] || p.statut, p.motif]),
  ]))
  zip.file('scolarite.csv', csv([
    ['Échéance', 'Date limite', 'Montant (F CFA)', 'Statut'],
    ...d.echeances.map((e) => [e.libelle, e.date_limite, e.montant, e.payee ? 'Payée' : 'À payer']),
  ]))
  zip.file('donnees.json', JSON.stringify({ eleve, ...d }, null, 2))

  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `csed-${eleve.prenom}-${eleve.nom}.zip`.toLowerCase().replace(/\s+/g, '-')
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
