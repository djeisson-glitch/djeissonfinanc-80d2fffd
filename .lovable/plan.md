

## Plan: Add Column Sorting to Transactions Table

### What changes
Add clickable column headers that toggle sorting (ascending/descending/none) on the transactions table. Each sortable column header will show an arrow indicator for the current sort direction.

### Technical approach

**File: `src/pages/Transacoes.tsx`**

1. Add state for sorting: `sortColumn` (string | null) and `sortDirection` ('asc' | 'desc')
2. Add a `toggleSort(column)` function that cycles: none → asc → desc → none
3. After filtering (`filtered`), apply a `.sort()` based on the active column:
   - **Data**: sort by `t.data` string comparison
   - **Descrição**: sort by `t.descricao` locale compare
   - **Categoria**: sort by `t.categoria` locale compare
   - **Valor**: sort by numeric `t.valor` (accounting for tipo sign)
   - **Tipo**: sort by `t.essencial` boolean
   - **Parcela**: sort by `t.parcela_atual` numeric
   - **Pessoa**: sort by `t.pessoa` locale compare
4. Replace static `<TableHead>` elements with clickable ones that call `toggleSort` and display `ArrowUpDown` / `ArrowUp` / `ArrowDown` icons from lucide-react
5. The "Ações" column remains non-sortable

### UI behavior
- Click a column header to sort ascending; click again for descending; click again to clear
- Active sort column shows a directional arrow; inactive columns show a subtle up-down icon
- Sorting applies on top of existing filters

