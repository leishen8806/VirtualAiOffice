export function renderKpiCards(target, entries, createCard) {
  target.replaceChildren()
  for (const entry of entries) target.append(createCard(entry))
}
